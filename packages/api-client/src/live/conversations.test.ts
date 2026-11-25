import { afterEach, describe, expect, it, vi } from "vitest";

import type { ConversationStore, StoredConversation, StoredMessage } from "../conversation-store";
import { createApiClient } from "../index";

afterEach(() => vi.unstubAllGlobals());

/** An in-memory ConversationStore for tests. */
function memoryStore(): ConversationStore {
  const conversations = new Map<string, StoredConversation>();
  const messages = new Map<string, StoredMessage[]>();

  return {
    async create(record) {
      conversations.set(record.id, { ...record });
      messages.set(record.id, []);
    },
    async get(id, userId, workspaceId) {
      const c = conversations.get(id);
      if (!c) return null;
      if (c.userId !== userId) return null;
      if ((c.workspaceId ?? null) !== (workspaceId ?? null)) return null;
      return c;
    },
    async list(userId, workspaceId) {
      return [...conversations.values()]
        .filter((c) => c.userId === userId && (c.workspaceId ?? null) === (workspaceId ?? null))
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    },
    async delete(id, userId, workspaceId) {
      const c = conversations.get(id);
      if (!c || c.userId !== userId || (c.workspaceId ?? null) !== (workspaceId ?? null)) return false;
      conversations.delete(id);
      messages.delete(id);
      return true;
    },
    async touch(id, updatedAt, title) {
      const c = conversations.get(id);
      if (!c) return;
      c.updatedAt = updatedAt;
      if (title !== undefined) c.title = title;
    },
    async addMessage(message) {
      const list = messages.get(message.conversationId);
      if (list) list.push(message);
    },
    async listMessages(conversationId) {
      return messages.get(conversationId) ?? [];
    },
  };
}

const chatCompletion = (text: string) => ({
  choices: [{ message: { role: "assistant", content: text }, finish_reason: "stop" }],
  usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
});

const input = (text: string) => ({ text, app: null, aspect: "16:9" as const, duration_seconds: 5 });

function mockFetchWith(reply: string) {
  return vi.fn(async (url: URL | string) => {
    const path = String(url);
    if (path.endsWith("/v1/offerings")) {
      return new Response(JSON.stringify([
        {
          app: "blueclaw/chat/qwen3.8-27b",
          modes: ["single-shot"],
          rate_low: null,
          rate_high: null,
          rate_status: "ok",
          stale: false,
          runner_count: 2,
          ready_count: 2,
          observed_at: "2026-11-25T00:00:00Z",
        },
      ]), { status: 200 });
    }
    if (path.endsWith("/v1/jobs")) {
      return new Response(JSON.stringify(chatCompletion(reply)), {
        status: 200,
        headers: { "Livepeer-Job-Id": "job_test123" },
      });
    }
    return new Response("not found", { status: 404 });
  });
}

describe("live conversations", () => {
  it("creates a conversation, runs a job and persists everything", async () => {
    const fetchMock = mockFetchWith("The answer is 42.");
    vi.stubGlobal("fetch", fetchMock);

    const store = memoryStore();
    const client = createApiClient({
      engine: { url: "http://engine.test", token: "lpk_test" },
      env: {},
      user: { id: "usr_alice", name: "Alice" },
      conversationStore: store,
    });

    const created = await client.createConversation(input("What is the answer?"));
    expect(created.source).toBe("live");
    expect(created.data.messages).toHaveLength(2);
    expect(created.data.messages[0]).toMatchObject({ role: "user", text: "What is the answer?" });
    expect(created.data.messages[1]).toMatchObject({ role: "agent", state: "done", text: "The answer is 42." });
    expect(created.data.title).toBe("What is the answer?");

    const listed = await client.listConversations();
    expect(listed.source).toBe("live");
    expect(listed.data).toHaveLength(1);
    expect(listed.data[0]!.id).toBe(created.data.id);
  });

  it("sends a follow-up with prior context", async () => {
    let callCount = 0;
    const fetchMock = vi.fn(async (url: URL | string) => {
      const path = String(url);
      if (path.endsWith("/v1/offerings")) {
        return new Response(JSON.stringify([{
          app: "blueclaw/chat/qwen3.8-27b", modes: ["single-shot"],
          rate_low: null, rate_high: null, rate_status: "ok", stale: false,
          runner_count: 1, ready_count: 1, observed_at: "2026-11-25T00:00:00Z",
        }]), { status: 200 });
      }
      if (path.endsWith("/v1/jobs")) {
        callCount++;
        const reply = callCount === 1 ? "First reply" : "Follow-up reply";
        return new Response(JSON.stringify(chatCompletion(reply)), {
          status: 200,
          headers: { "Livepeer-Job-Id": `job_${callCount}` },
        });
      }
      return new Response("not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const store = memoryStore();
    const client = createApiClient({
      engine: { url: "http://engine.test", token: "lpk_test" },
      env: {},
      user: { id: "usr_alice", name: "Alice" },
      conversationStore: store,
    });

    const created = await client.createConversation(input("Hello"));
    const followed = await client.sendMessage(created.data.id, input("Tell me more"));
    expect(followed.data).not.toBeNull();
    expect(followed.data!.messages).toHaveLength(4);
    expect(followed.data!.messages[2]).toMatchObject({ role: "user", text: "Tell me more" });
    expect(followed.data!.messages[3]).toMatchObject({ role: "agent", text: "Follow-up reply" });

    // The second job had the prior context
    const jobCalls = fetchMock.mock.calls.filter(([u]) => String(u).endsWith("/v1/jobs"));
    expect(jobCalls).toHaveLength(2);
    const secondCall = jobCalls[1] as unknown as [URL | string, RequestInit];
    const secondBody = JSON.parse(secondCall[1].body as string);
    expect(secondBody.payload.messages).toHaveLength(3);
    expect(secondBody.payload.messages[0]).toMatchObject({ role: "user", content: "Hello" });
    expect(secondBody.payload.messages[1]).toMatchObject({ role: "assistant", content: "First reply" });
    expect(secondBody.payload.messages[2]).toMatchObject({ role: "user", content: "Tell me more" });
  });

  it("gets and deletes a conversation", async () => {
    const fetchMock = mockFetchWith("Sure thing.");
    vi.stubGlobal("fetch", fetchMock);

    const store = memoryStore();
    const client = createApiClient({
      engine: { url: "http://engine.test", token: "lpk_test" },
      env: {},
      user: { id: "usr_alice", name: "Alice" },
      conversationStore: store,
    });

    const created = await client.createConversation(input("Test"));
    const fetched = await client.getConversation(created.data.id);
    expect(fetched.source).toBe("live");
    expect(fetched.data).not.toBeNull();
    expect(fetched.data!.messages).toHaveLength(2);

    expect((await client.deleteConversation(created.data.id)).data).toBe(true);
    expect((await client.getConversation(created.data.id)).data).toBeNull();
    expect((await client.listConversations()).data).toHaveLength(0);
  });

  it("returns null for a conversation that doesn't exist", async () => {
    vi.stubGlobal("fetch", mockFetchWith("ok"));
    const store = memoryStore();
    const client = createApiClient({
      engine: { url: "http://engine.test", token: "lpk_test" },
      env: {},
      user: { id: "usr_alice", name: "Alice" },
      conversationStore: store,
    });

    expect((await client.getConversation("cnv_missing")).data).toBeNull();
    expect((await client.sendMessage("cnv_missing", input("hi"))).data).toBeNull();
  });

  it("isolates conversations by user and workspace", async () => {
    vi.stubGlobal("fetch", mockFetchWith("hi"));
    const store = memoryStore();

    const alice = createApiClient({
      engine: { url: "http://engine.test", token: "lpk_test" },
      env: {},
      user: { id: "usr_alice", name: "Alice" },
      conversationStore: store,
    });
    const bob = createApiClient({
      engine: { url: "http://engine.test", token: "lpk_test" },
      env: {},
      user: { id: "usr_bob", name: "Bob" },
      conversationStore: store,
    });

    await alice.createConversation(input("Alice's chat"));
    expect((await alice.listConversations()).data).toHaveLength(1);
    expect((await bob.listConversations()).data).toHaveLength(0);
  });

  it("falls back to mock when MOCK_ONLY is set", async () => {
    const store = memoryStore();
    const client = createApiClient({
      engine: { url: "http://engine.test", token: "lpk_test" },
      env: { MOCK_ONLY: "1" },
      conversationStore: store,
    });

    const created = await client.createConversation(input("Hello mock"));
    expect(created.source).toBe("mock");
  });

  it("uses agent_model as the app when it is a language offering", async () => {
    const smartFetch = vi.fn(async (url: URL | string) => {
      const path = String(url);
      if (path.endsWith("/v1/offerings")) {
        return new Response("[]", { status: 200 });
      }
      if (path.endsWith("/v1/jobs")) {
        return new Response(JSON.stringify(chatCompletion("model reply")), {
          status: 200,
          headers: { "Livepeer-Job-Id": "job_model" },
        });
      }
      return new Response("not found", { status: 404 });
    });
    vi.stubGlobal("fetch", smartFetch);

    const store = memoryStore();
    const client = createApiClient({
      engine: { url: "http://engine.test", token: "lpk_test" },
      env: {},
      user: { id: "usr_alice", name: "Alice" },
      conversationStore: store,
    });

    await client.createConversation({
      ...input("Hi"),
      agent_model: "northlight/chat/gemma-3-27b",
    });

    const jobCalls = smartFetch.mock.calls.filter(([u]) => String(u).endsWith("/v1/jobs"));
    expect(jobCalls).toHaveLength(1);
    const call = jobCalls[0] as unknown as [URL | string, RequestInit];
    const body = JSON.parse(call[1].body as string);
    expect(body.app).toBe("northlight/chat/gemma-3-27b");
  });
});
