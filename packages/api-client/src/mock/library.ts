import type { Generation, MediaItem } from "../types";
import { shared } from "./shared";
import { MOCK_SHOWCASE } from "./showcase";

const DESCRIPTIONS: Record<string, { description: string; tags: string[] }> = {
  sc_harbour: { description: "A fishing harbour at dawn. The camera pushes slowly along the quay; mist lifts off still water and gulls cross the frame.", tags: ["harbour", "dawn", "mist", "boats", "slow push"] },
  sc_ceramics: { description: "A ceramic bowl turning on a wheel beside a window. Wet glaze catches the light through one rotation.", tags: ["ceramics", "close-up", "window light", "rotation"] },
  sc_runner: { description: "A runner on a wet city street at night, followed from the side. Neon signs reflect in the road.", tags: ["night", "city", "runner", "tracking shot", "neon"] },
  sc_orchard: { description: "An aerial descent over rows of apple trees in low autumn sun. Leaves move in a light wind.", tags: ["aerial", "orchard", "autumn", "descent"] },
  sc_poster: { description: "A two-colour risograph poster with a bold geometric sun and wide margins.", tags: ["poster", "risograph", "graphic", "sun"] },
  sc_kitchen: { description: "A kitchen seen through a live camera, restyled as warm gouache with visible brushwork.", tags: ["live", "restyle", "gouache", "kitchen"] },
  sc_tide: { description: "A tide pool in macro as a wave drains away. Anemones open and sunlight ripples over sand.", tags: ["macro", "tide pool", "water", "anemone"] },
  sc_score: { description: "Sparse piano with bowed strings, building once near the end.", tags: ["music", "piano", "strings", "slow build"] },
};

const removed = shared("library.removed", () => new Set<string>());
const added = shared("library.added", (): MediaItem[] => []);

function seeded(): MediaItem[] {
  return MOCK_SHOWCASE.map((item, index) => ({
    id: `med_${item.id.slice(3)}`,
    kind: item.kind,
    source: item.app.startsWith("live") ? "recording" : "generation",
    title: item.title,
    description: DESCRIPTIONS[item.id]?.description ?? item.prompt,
    tags: DESCRIPTIONS[item.id]?.tags ?? [],
    app: item.app,
    prompt: item.prompt,
    aspect: item.aspect,
    duration_seconds: item.duration_seconds,
    created_at: new Date(Date.UTC(2026, 10, 17, 18) - index * 26 * 3600_000).toISOString(),
    image: item.image,
    artwork: item.artwork,
  }));
}

/** Finished generations are saved to the library. */
export function addGenerationToLibrary(generation: Generation): void {
  if (added.some((item) => item.id === `med_${generation.id}`)) return;
  const words = generation.request.prompt.split(/\s+/).slice(0, 6).join(" ");
  added.unshift({
    id: `med_${generation.id}`,
    kind: generation.request.kind,
    source: "generation",
    title: words.length < generation.request.prompt.length ? `${words}…` : words,
    description: generation.request.prompt,
    tags: [],
    app: generation.request.app,
    prompt: generation.request.prompt,
    aspect: generation.request.aspect,
    duration_seconds: generation.request.duration_seconds,
    created_at: generation.created_at,
    image: generation.request.first_frame ?? null,
    artwork: generation.artwork,
  });
}

/** Adds an item made elsewhere, such as a recorded live session. */
export function addMediaToLibrary(item: MediaItem): void {
  added.unshift(item);
}

export interface MediaFilter {
  kind?: MediaItem["kind"];
  source?: MediaItem["source"];
  /** Searches titles, descriptions and tags: what is in the media, not only its name. */
  query?: string;
}

export function listStoredMedia(filter: MediaFilter = {}): MediaItem[] {
  const query = filter.query?.trim().toLowerCase();
  return [...added, ...seeded()].filter((item) => {
    if (removed.has(item.id)) return false;
    if (filter.kind && item.kind !== filter.kind) return false;
    if (filter.source && item.source !== filter.source) return false;
    if (!query) return true;
    return [item.title, item.description, ...item.tags].some((text) => text.toLowerCase().includes(query));
  });
}

export function deleteStoredMedia(id: string): boolean {
  if (removed.has(id)) return false;
  removed.add(id);
  return true;
}
