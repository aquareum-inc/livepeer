import { describe, expect, it } from "vitest";

import { createApiClient } from "./index";
import { agentModelsFrom, appModel, runnerModel } from "./runner-model";
import type { Offering } from "./types";

const standard = JSON.stringify({ runner_contract: 1, model: { name: "qwen3.8-27b", source: "hf:cyankiwi/Qwen3.8-27B-AWQ-INT4" }, limits: { context_tokens: 4096 } });
const operatorOwn = JSON.stringify({ blueclaw: 1, model_id: "Qwen3.8-27B", name: "Qwen 3.8 27B", category: "chat", max_context: 131072 });

describe("runner models", () => {
  it("reads both live description shapes", () => {
    expect(runnerModel(standard)).toEqual({ model: "qwen3.8-27b", context_tokens: 4096 });
    expect(runnerModel(operatorOwn)).toEqual({ model: "Qwen3.8-27B", context_tokens: 131072 });
  });

  it("returns null when there is no model to read", () => {
    expect(runnerModel(null)).toBeNull();
    expect(runnerModel("not json")).toBeNull();
    expect(runnerModel(JSON.stringify({ runner_contract: 1, endpoints: {} }))).toBeNull();
  });

  it("combines an app's runners: one name per model, the largest context", () => {
    const small = JSON.stringify({ model: { name: "qwen3.8-27b" }, limits: { context_tokens: 4096 } });
    const large = JSON.stringify({ model: { name: "Qwen3.8-27B" }, limits: { context_tokens: 32768 } });
    expect(appModel("chat", [{ metadata: small }, { metadata: large }, { metadata: null }])).toEqual({ app: "chat", model: "qwen3.8-27b", context_tokens: 32768 });
    expect(appModel("chat", [{ metadata: small }, { metadata: JSON.stringify({ model: { name: "llama-4-70b" } }) }])?.model).toBe("qwen3.8-27b or llama-4-70b");
    expect(appModel("chat", [{ metadata: null }])).toBeNull();
  });
});

function offering(app: string, ready = 1): Offering {
  return { app, modes: ["single-shot"], rate_low: null, rate_high: null, rate_status: "ok", stale: false, runner_count: 1, ready_count: ready, observed_at: "2026-11-18T00:00:00Z" };
}

describe("agent models", () => {
  it("lists language apps by their runners' model, or the model in their name", () => {
    const offerings = [offering("chat"), offering("blueclaw/chat/qwen3.8-27b", 0), offering("text-to-image")];
    expect(agentModelsFrom(offerings, [{ app: "chat", model: "qwen3.8-27b", context_tokens: 4096 }])).toEqual([
      { app: "chat", model: "qwen3.8-27b", context_tokens: 4096, busy: false },
      { app: "blueclaw/chat/qwen3.8-27b", model: "qwen3.8-27b", context_tokens: null, busy: true },
    ]);
  });

  it("leaves out a plain app whose model is unknown", () => {
    expect(agentModelsFrom([offering("chat")], [])).toEqual([]);
  });

  it("serves the mock agent's models in mock-only mode", async () => {
    const client = createApiClient({ env: { MOCK_ONLY: "1" }, engine: { url: "http://engine.invalid" } });
    const result = await client.listAgentModels();
    expect(result.source).toBe("mock");
    expect(result.data.map((model) => model.model)).toContain("gemma-3-27b");
  });
});
