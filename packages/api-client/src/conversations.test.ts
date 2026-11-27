import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { memoryStorage } from "@livepeer/storage/memory";

import { createApiClient, createMediaStore, memoryUploadRecords } from "./index";

const input = (text: string) => ({ text, app: null, aspect: "16:9" as const, duration_seconds: 5 });

describe("conversations (mock agent)", () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => vi.useRealTimers());

  it("starts a turn that works through steps, then replies", async () => {
    const client = createApiClient({ env: { MOCK_ONLY: "1" } });
    const created = (await client.createConversation(input("Tracking shot beside a runner at night"))).data;
    const [user, agent] = created.messages;
    expect(user).toMatchObject({ role: "user", text: "Tracking shot beside a runner at night" });
    expect(agent).toMatchObject({ role: "agent", state: "working", text: null });

    vi.advanceTimersByTime(60_000);
    const done = (await client.getConversation(created.id)).data?.messages[1];
    if (done?.role !== "agent") throw new Error("expected an agent message");
    expect(done.state).toBe("done");
    expect(done.steps.every((step) => step.state === "done")).toBe(true);
    expect(done.steps.at(-1)).toMatchObject({ kind: "review", app: "video-understanding" });
    expect(done.generation_ids).toHaveLength(1);
    expect(done.text).toBeTruthy();
  });

  it("asks what to make when a request only names the kind of thing, then makes the answer", async () => {
    const client = createApiClient({ env: { MOCK_ONLY: "1" } });
    const created = (await client.createConversation({ ...input("Make a video"), app: "text-to-video" })).data;
    vi.advanceTimersByTime(60_000);
    const asked = (await client.getConversation(created.id)).data?.messages[1];
    if (asked?.role !== "agent") throw new Error("expected an agent message");
    expect(asked.state).toBe("done");
    expect(asked.generation_ids).toHaveLength(0);
    expect(asked.text).toMatch(/What should it show\?/);

    // The answer has no capability of its own and none of the words that mark a shot.
    await client.sendMessage(created.id, input("A red fox crossing a frozen lake"));
    vi.advanceTimersByTime(60_000);
    const made = (await client.getConversation(created.id)).data?.messages[3];
    if (made?.role !== "agent") throw new Error("expected an agent message");
    expect(made.generation_ids).toHaveLength(1);
    expect(made.steps.find((step) => step.title === "Generate the shot")).toMatchObject({ app: "text-to-video" });
  });

  it("asks for the video when asked to understand one", async () => {
    const client = createApiClient({ env: { MOCK_ONLY: "1" } });
    const created = (await client.createConversation({ ...input("Understand a video"), app: "video-understanding" })).data;
    vi.advanceTimersByTime(60_000);
    const asked = (await client.getConversation(created.id)).data?.messages[1];
    if (asked?.role !== "agent") throw new Error("expected an agent message");
    expect(asked.generation_ids).toHaveLength(0);
    expect(asked.text).toMatch(/^Attach a video or paste a link/);
  });

  it("starts a shot from an uploaded picture", async () => {
    const storage = memoryStorage();
    const client = createApiClient({ env: { MOCK_ONLY: "1" }, media: createMediaStore({ records: memoryUploadRecords(), storage }) });
    const ticket = (await client.requestUpload({ kind: "image", name: "tide-pool.jpg", content_type: "image/jpeg", size_bytes: 3 })).data;
    storage.put(ticket.url, new Uint8Array([1, 2, 3]), "image/jpeg");
    const picture = (await client.completeUpload(ticket.id)).data;
    if (!picture) throw new Error("expected the upload to land");
    const created = (await client.createConversation({ ...input("Bring this picture to life."), attachment_ids: [picture.id] })).data;
    vi.advanceTimersByTime(60_000);
    const agent = (await client.getConversation(created.id)).data?.messages[1];
    if (agent?.role !== "agent") throw new Error("expected an agent message");
    expect(agent.steps[0]).toMatchObject({ kind: "plan", title: "Start from your picture" });
    expect(agent.analysis).toBeNull();
    const [generationId] = agent.generation_ids;
    const generation = generationId ? (await client.getGeneration(generationId)).data : null;
    expect(generation?.request).toMatchObject({ app: "image-to-video", first_frame: picture.image });
  });

  it("plans a multi-step job for a larger request", async () => {
    const client = createApiClient({ env: { MOCK_ONLY: "1" } });
    const created = (await client.createConversation(input("A 30-second film for a mug: script, storyboard, shots"))).data;
    vi.advanceTimersByTime(60_000);
    const agent = (await client.getConversation(created.id)).data?.messages[1];
    if (agent?.role !== "agent") throw new Error("expected an agent message");
    expect(agent.steps.map((step) => step.title)).toEqual([
      "Plan the job",
      "Write the script",
      "Draw the storyboard",
      "Generate three shots",
      "Review the shots",
      "Compose the score",
      "Assemble the cut",
    ]);
    expect(agent.generation_ids).toHaveLength(3);
  });

  it("puts a character on screen, starting from their portrait", async () => {
    const client = createApiClient({ env: { MOCK_ONLY: "1" } });
    const created = (await client.createConversation({ ...input("On a rooftop at dusk, looking over the city"), character_slug: "lumen" })).data;
    expect(created.messages[0]).toMatchObject({ role: "user", cast: { slug: "lumen", name: "Lumen", image: "/characters/lumen.webp" } });
    vi.advanceTimersByTime(60_000);
    const agent = (await client.getConversation(created.id)).data?.messages[1];
    if (agent?.role !== "agent") throw new Error("expected an agent message");
    expect(agent.steps[0]).toMatchObject({ kind: "plan", title: "Cast Lumen" });
    expect(agent.steps.find((step) => step.kind === "tool" && step.app === "image-to-video")).toBeDefined();
    const [generationId] = agent.generation_ids;
    const generation = generationId ? (await client.getGeneration(generationId)).data : null;
    expect(generation?.request).toMatchObject({ app: "image-to-video", first_frame: "/characters/lumen.webp" });
  });

  it("plans with the language model the user picked", async () => {
    const client = createApiClient({ env: { MOCK_ONLY: "1" } });
    const created = (await client.createConversation({ ...input("Tracking shot beside a runner at night"), agent_model: "blueclaw/chat/qwen3.8-27b" })).data;
    vi.advanceTimersByTime(60_000);
    const agent = (await client.getConversation(created.id)).data?.messages[1];
    if (agent?.role !== "agent") throw new Error("expected an agent message");
    expect(created.messages[0]).toMatchObject({ role: "user", agent_model: "blueclaw/chat/qwen3.8-27b" });
    expect(agent.steps[0]).toMatchObject({ kind: "plan", app: "blueclaw/chat/qwen3.8-27b" });
  });

  it("ignores a character that doesn't exist", async () => {
    const client = createApiClient({ env: { MOCK_ONLY: "1" } });
    const created = (await client.createConversation({ ...input("Tracking shot beside a runner"), character_slug: "nobody" })).data;
    expect(created.messages[0]).toMatchObject({ role: "user", cast: null });
  });

  it("does not generate for a question", async () => {
    const client = createApiClient({ env: { MOCK_ONLY: "1" } });
    const created = (await client.createConversation(input("What aspect ratio suits a phone?"))).data;
    vi.advanceTimersByTime(10_000);
    const agent = (await client.getConversation(created.id)).data?.messages[1];
    if (agent?.role !== "agent") throw new Error("expected an agent message");
    expect(agent.generation_ids).toHaveLength(0);
    expect(agent.state).toBe("done");
  });

  it("lists newest first, continues a conversation and deletes it", async () => {
    const client = createApiClient({ env: { MOCK_ONLY: "1" } });
    const first = (await client.createConversation(input("First shot"))).data;
    vi.advanceTimersByTime(1000);
    const second = (await client.createConversation(input("Second shot"))).data;
    const ids = (await client.listConversations()).data.map((entry) => entry.id);
    expect(ids.indexOf(second.id)).toBeLessThan(ids.indexOf(first.id));

    const continued = (await client.sendMessage(first.id, input("Make it slower"))).data;
    expect(continued?.messages).toHaveLength(4);
    expect((await client.sendMessage("cnv_missing", input("x"))).data).toBeNull();

    expect((await client.deleteConversation(first.id)).data).toBe(true);
    expect((await client.getConversation(first.id)).data).toBeNull();
  });
});
