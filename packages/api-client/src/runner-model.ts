import type { AgentModel, AppModel, Offering } from "./types";

interface RunnerDescription {
  metadata: string | null;
}

/**
 * The model a runner serves, read from its description. Two shapes are live: the standard envelope
 * (`model.name`, `limits.context_tokens`) and an operator's own (`model_id`, `max_context`).
 * Anything else, or no model, is `null`.
 */
export function runnerModel(metadata: string | null): { model: string; context_tokens: number | null } | null {
  if (!metadata) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(metadata);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const record = parsed as Record<string, unknown>;
  const envelope = typeof record.model === "object" && record.model !== null ? (record.model as Record<string, unknown>) : null;
  const limits = typeof record.limits === "object" && record.limits !== null ? (record.limits as Record<string, unknown>) : null;
  const model = typeof envelope?.name === "string" ? envelope.name : typeof record.model_id === "string" ? record.model_id : null;
  if (!model) return null;
  const context = typeof limits?.context_tokens === "number" ? limits.context_tokens : typeof record.max_context === "number" ? record.max_context : null;
  return { model, context_tokens: context };
}

/** The model behind one app, from all its runners; `null` when none of them name one. */
export function appModel(app: string, runners: ReadonlyArray<RunnerDescription>): AppModel | null {
  const found = runners.flatMap((runner) => runnerModel(runner.metadata) ?? []);
  if (found.length === 0) return null;
  const names = [...new Set(found.map((entry) => entry.model.toLowerCase()))].map((lower) => found.find((entry) => entry.model.toLowerCase() === lower)?.model ?? lower);
  const contexts = found.flatMap((entry) => (entry.context_tokens === null ? [] : [entry.context_tokens]));
  return { app, model: names.join(" or "), context_tokens: contexts.length > 0 ? Math.max(...contexts) : null };
}

/** A language app: plain `chat`, or one with a model in its name (`<owner>/chat/<model>`). */
const LANGUAGE_APP = /^chat$|(^|\/)chat\//;

export function isLanguageApp(app: string): boolean {
  return LANGUAGE_APP.test(app);
}

/**
 * The language app a chat runs when the user has not picked one.
 *
 * A ready app whose name contains `qwen` wins (the historical `blueclaw/chat/qwen3.8-27b`). Otherwise the
 * plain `chat` app wins: that is how the Qwen 3.8 27B runner advertises today. Anything else falls through
 * to the first ready language app.
 */
export function chooseLanguageApp(
  offerings: ReadonlyArray<{ app: string; ready_count: number }>,
  agentModel: string | null | undefined,
): string {
  if (agentModel && isLanguageApp(agentModel)) return agentModel;
  const ready = offerings.filter((offering) => isLanguageApp(offering.app) && offering.ready_count > 0);
  const named = ready.find((offering) => /qwen/i.test(offering.app));
  if (named) return named.app;
  const plain = ready.find((offering) => offering.app === "chat");
  if (plain) return plain.app;
  return ready[0]?.app ?? offerings.find((offering) => isLanguageApp(offering.app))?.app ?? "chat";
}
const NAMED_MODEL = /(^|\/)chat\/([^/]+)$/;

/**
 * The language models on offer, from discovery and what each app's runners say. An app is named
 * by its runners' model, or failing that by the model in its name; a plain app whose model is
 * unknown is left out (Auto still uses it).
 */
export function agentModelsFrom(offerings: ReadonlyArray<Offering>, models: ReadonlyArray<AppModel>): AgentModel[] {
  const byApp = new Map(models.map((model) => [model.app, model]));
  const found = new Map<string, AgentModel>();
  for (const offering of offerings) {
    if (!LANGUAGE_APP.test(offering.app)) continue;
    const described = byApp.get(offering.app);
    const model = described?.model ?? NAMED_MODEL.exec(offering.app)?.[2];
    if (!model) continue;
    const busy = offering.ready_count === 0;
    const earlier = found.get(offering.app);
    // Discovery can list an app once per pricing unit: free if any listing is.
    found.set(offering.app, earlier ? { ...earlier, busy: earlier.busy && busy } : { app: offering.app, model, context_tokens: described?.context_tokens ?? null, busy });
  }
  return [...found.values()];
}
