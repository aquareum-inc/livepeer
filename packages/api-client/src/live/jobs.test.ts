import { afterEach, describe, expect, it, vi } from "vitest";

import { assistantText, runChatJob, type ChatJobRequest } from "./jobs";

afterEach(() => vi.unstubAllGlobals());

function chatRequest(text: string): ChatJobRequest {
  return {
    app: "blueclaw/chat/qwen3.8-27b",
    path: "/v1/chat/completions",
    method: "POST",
    mode: "immediate",
    payload: {
      messages: [{ role: "user", content: text }],
      stream: false,
    },
    timeout_s: 55,
    operation_ref: "test",
  };
}

describe("runChatJob", () => {
  it("sends an immediate job and returns the completion", async () => {
    const completion = {
      id: "chatcmpl-1",
      choices: [{ message: { role: "assistant", content: "Hello!" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 },
    };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(completion), {
      status: 200,
      headers: { "Livepeer-Job-Id": "job_abc123" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await runChatJob(
      { url: "http://engine.test", token: "lpk_builder" },
      chatRequest("Hi"),
    );

    expect(result.completion.choices[0]?.message.content).toBe("Hello!");
    expect(result.jobId).toBe("job_abc123");

    const call = fetchMock.mock.calls[0] as unknown as [URL | string, RequestInit];
    expect(String(call[0])).toBe("http://engine.test/v1/jobs");
    expect(call[1].method).toBe("POST");
    const body = JSON.parse(call[1].body as string);
    expect(body.app).toBe("blueclaw/chat/qwen3.8-27b");
    expect(body.mode).toBe("immediate");
    expect(body.payload.messages[0]).toEqual({ role: "user", content: "Hi" });
    expect(call[1].headers).toMatchObject({
      Authorization: "Bearer lpk_builder",
      "Content-Type": "application/json",
    });
  });

  it("sends no Authorization header when there is no token", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await runChatJob({ url: "http://engine.test" }, chatRequest("test"));

    const call = fetchMock.mock.calls[0] as unknown as [URL | string, RequestInit];
    const headers = call[1].headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
  });

  it("throws EngineError on non-2xx", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("Service Unavailable", { status: 503 })));

    await expect(
      runChatJob({ url: "http://engine.test", token: "lpk_x" }, chatRequest("test")),
    ).rejects.toMatchObject({ name: "EngineError", status: 503 });
  });

  it("returns null jobId when the header is absent", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { role: "assistant", content: "hi" }, finish_reason: "stop" }],
    }), { status: 200 })));

    const result = await runChatJob(
      { url: "http://engine.test", token: "lpk_x" },
      chatRequest("test"),
    );
    expect(result.jobId).toBeNull();
  });

  it("assistantText prefers content and falls back to reasoning", () => {
    expect(
      assistantText({
        choices: [{ message: { role: "assistant", content: "hi" }, finish_reason: "stop" }],
      }),
    ).toBe("hi");
    expect(
      assistantText({
        choices: [{
          message: { role: "assistant", content: null, reasoning: "thinking then answer" },
          finish_reason: "length",
        }],
      }),
    ).toBe("thinking then answer");
  });
});
