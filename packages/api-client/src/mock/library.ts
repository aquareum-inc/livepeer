import type { Generation, MediaItem } from "../types";
import { shared, type Owner } from "./shared";
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
/** The workspace an added item belongs to. Items with no entry are in the personal library. */
const homes = shared("library.homes", () => new Map<string, string>());

/** What the seeded workspace's people have already made, so its library isn't empty. */
const WORKSPACE_SEED: Record<string, Array<[showcase: string, by: string]>> = {
  wsp_northlight: [["sc_runner", "Inés Castellanos"], ["sc_poster", "Priya Raman"], ["sc_kitchen", "Adam Soffer"], ["sc_score", "Inés Castellanos"], ["sc_orchard", "Tomás Lindqvist"]],
};

function seeded(scope: string | null): MediaItem[] {
  if (scope) {
    const all = seeded(null);
    return (WORKSPACE_SEED[scope] ?? []).flatMap(([showcase, by]) => {
      const item = all.find((entry) => entry.id === `med_${showcase.slice(3)}`);
      return item ? [{ ...item, id: `${item.id}_${scope.slice(4)}`, made_by: by }] : [];
    });
  }
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
    made_by: null,
  }));
}

function keep(item: MediaItem, owner: Owner | null): void {
  if (owner) homes.set(item.id, owner.scope);
  added.unshift({ ...item, made_by: owner?.by ?? null });
}

/** Finished generations are saved to the library. */
export function addGenerationToLibrary(generation: Generation, owner: Owner | null = null): void {
  if (added.some((item) => item.id === `med_${generation.id}`)) return;
  const words = generation.request.prompt.split(/\s+/).slice(0, 6).join(" ");
  keep({
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
    made_by: null,
  }, owner);
}

/** Adds an item made elsewhere, such as a recorded live session. */
export function addMediaToLibrary(item: MediaItem, owner: Owner | null = null): void {
  keep(item, owner);
}

export interface MediaFilter {
  kind?: MediaItem["kind"];
  source?: MediaItem["source"];
  /** Searches titles, descriptions and tags: what is in the media, not only its name. */
  query?: string;
}

/** The library of one account: a workspace's (`scope`), or the personal one. */
export function listStoredMedia(filter: MediaFilter = {}, scope: string | null = null): MediaItem[] {
  return [...added.filter((item) => (homes.get(item.id) ?? null) === scope), ...seeded(scope)].filter((item) => !removed.has(item.id) && matchesMedia(item, filter));
}

/** Whether an item is what a filter asks for. */
export function matchesMedia(item: MediaItem, filter: MediaFilter = {}): boolean {
  const query = filter.query?.trim().toLowerCase();
  if (filter.kind && item.kind !== filter.kind) return false;
  if (filter.source && item.source !== filter.source) return false;
  if (!query) return true;
  return [item.title, item.description, ...item.tags].some((text) => text.toLowerCase().includes(query));
}

export function deleteStoredMedia(id: string, scope: string | null = null): boolean {
  if (removed.has(id) || !listStoredMedia({}, scope).some((item) => item.id === id)) return false;
  removed.add(id);
  return true;
}
