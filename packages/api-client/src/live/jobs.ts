import { EngineError, type EngineConfig } from "./engine";

/** One turn in a chat completion payload, OpenAI shaped. */
export interface ChatTurn {
  role: "system" | "user" | "assistant";
  content: string;
}

/** The body POSTed to `POST /v1/jobs` for an immediate chat completion. */
export interface ChatJobRequest {
  app: string;
  path: "/v1/chat/completions";
  method: "POST";
  mode: "immediate";
  payload: {
    messages: ChatTurn[];
    max_tokens?: number;
    temperature?: number;
    stream: false;
    /** Qwen-style runners default to thinking; turn it off so `content` is filled. */
    chat_template_kwargs?: { enable_thinking: boolean };
  };
  timeout_s: number;
  operation_ref?: string;
}

/** What the runner sends back (OpenAI chat-completion shaped). */
export interface ChatCompletion {
  id?: string;
  choices: Array<{
    message: {
      role: "assistant";
      content: string | null;
      reasoning?: string | null;
      reasoning_content?: string | null;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/** Prefer the assistant's spoken content; fall back to reasoning when content is null. */
export function assistantText(completion: ChatCompletion): string {
  const message = completion.choices[0]?.message;
  if (!message) return "";
  return message.content ?? message.reasoning_content ?? message.reasoning ?? "";
}

/** The result of a successful immediate chat job: the completion and the network's job id. */
export interface ChatJobResult {
  completion: ChatCompletion;
  jobId: string | null;
}

/**
 * Run an immediate chat-completion job on the Livepeer network.
 *
 * POSTs to `{engine.url}/v1/jobs` with the builder's bearer token, the app that serves the model, the
 * OpenAI-shaped messages and `mode: "immediate"`. Returns the runner's response and the `Livepeer-Job-Id`
 * header the engine sets.
 */
export async function runChatJob(
  config: EngineConfig,
  request: ChatJobRequest,
): Promise<ChatJobResult> {
  const response = await fetch(new URL("/v1/jobs", config.url), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(config.token ? { Authorization: `Bearer ${config.token}` } : {}),
    },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(request.timeout_s * 1000 + 5_000),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new EngineError(
      response.status,
      `Engine answered ${response.status} for POST /v1/jobs: ${body}`,
    );
  }
  const completion = (await response.json()) as ChatCompletion;
  return {
    completion,
    jobId:
      response.headers.get("Livepeer-Job-Id") ??
      response.headers.get("livepeer-job-id"),
  };
}
