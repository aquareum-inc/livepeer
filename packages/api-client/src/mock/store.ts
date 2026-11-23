import type { Generation, GenerationRequest, MockArtwork } from "../types";
import type { Owner } from "./shared";

/** Realistic latency for mocked calls. */
export function latency(min = 180, max = 420): Promise<void> {
  const ms = min + Math.random() * (max - min);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const RENDER_MS: Record<GenerationRequest["kind"], number> = { video: 9000, image: 2600, audio: 4200 };
const QUEUE_MS = 1200;

interface StoredGeneration {
  generation: Generation;
  startedAt: number;
  /** The workspace it was made in and by whom; null in a personal account. */
  owner: Owner | null;
}

const generations = new Map<string, StoredGeneration>();
let sequence = 0;

function artworkFor(prompt: string, variant: number): MockArtwork {
  let hash = variant * 7919;
  for (const char of prompt) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  const base = hash % 360;
  return { hues: [base, (base + 48) % 360, (base + 200) % 360], seed: hash % 97 };
}

/**
 * Credits for a mocked generation. Video: 11 per second at 720p, 1.6x at 1080p. Audio: 1 per
 * second. Image: 4 each.
 */
export function quoteCredits(request: GenerationRequest): number {
  if (request.kind === "image") return 4;
  const seconds = request.duration_seconds ?? 5;
  if (request.kind === "audio") return Math.round(seconds);
  return Math.round((request.resolution === "1080p" ? 17.6 : 11) * seconds);
}

/** `startDelayMs` holds the job in the queue, for a generation an agent starts partway through a turn. */
export function createStoredGeneration(request: GenerationRequest, startDelayMs = 0, owner: Owner | null = null): Generation {
  sequence += 1;
  const generation: Generation = {
    id: `gen_${Date.now().toString(36)}${sequence.toString(36)}`,
    state: "queued",
    progress: 0,
    request,
    credits_charged: quoteCredits(request),
    created_at: new Date().toISOString(),
    artwork: artworkFor(request.prompt, sequence),
  };
  generations.set(generation.id, { generation, startedAt: Date.now() + startDelayMs, owner });
  return generation;
}

/** Whose a generation is, so its result is saved to the right library. Undefined when there is no such generation. */
export function generationOwner(id: string): Owner | null | undefined {
  return generations.get(id)?.owner;
}

export function readStoredGeneration(id: string): Generation | null {
  const stored = generations.get(id);
  if (!stored) return null;
  const elapsed = Date.now() - stored.startedAt;
  if (elapsed < QUEUE_MS) return { ...stored.generation, state: "queued", progress: 0 };
  const progress = Math.min(1, (elapsed - QUEUE_MS) / RENDER_MS[stored.generation.request.kind]);
  return {
    ...stored.generation,
    state: progress >= 1 ? "succeeded" : "running",
    progress,
  };
}
