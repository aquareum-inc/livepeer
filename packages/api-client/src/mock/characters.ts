import type { Character, CharacterInput } from "../types";

const base = (slug: string, name: string, tagline: string, description: string, greeting: string, author: string, tags: string[], hues: [number, number, number], extra: Partial<Character> = {}): Character => ({
  slug,
  name,
  tagline,
  description,
  greeting,
  author,
  visibility: "public",
  mature: false,
  calls: true,
  tags,
  rating: 4.6,
  chats: 1200,
  mine: false,
  image: `/characters/${slug}.webp`,
  artwork: { hues, seed: slug.length * 7 },
  ...extra,
});

const characters: Character[] = [
  base("mara-the-director", "Mara", "A film director who thinks in shots.", "Mara has cut features and commercials. Describe an idea and she'll break it into coverage: size, angle, movement, and why each shot cuts to the next.", "Tell me what the audience should feel in the last frame. We'll work backwards from there.", "studio-north", ["film", "directing", "shot lists"], [18, 44, 280], { rating: 4.8, chats: 18400 }),
  base("okon-the-editor", "Okon", "An editor who cuts for rhythm.", "Okon listens for the beat in a scene. Share a rough cut or a description and he'll tell you where it drags and what to lose.", "Send me the cut, or tell me the scene. I'll tell you where I'd blink.", "cutting-room", ["editing", "pacing"], [205, 160, 250], { rating: 4.7, chats: 9300 }),
  base("lumen", "Lumen", "A patient cinematography tutor.", "Lumen explains light: key and fill, time of day, lens choice. Ask why a shot looks flat and get an answer you can use on the next one.", "What are we lighting today, and what time is it in the scene?", "open-lens", ["lighting", "lenses", "teaching"], [48, 28, 200], { rating: 4.9, chats: 22100 }),
  base("juno-live", "Juno", "A live co-host for your stream.", "Juno joins a broadcast as an on-screen character, reacts to chat and keeps the energy up between segments.", "We're live in five. What's the show about tonight?", "relay-club", ["live", "co-host", "streaming"], [320, 280, 20], { rating: 4.5, chats: 5400 }),
  base("old-harbour-keeper", "The Harbour Keeper", "Stories from a lighthouse, told slowly.", "A storyteller for long evenings. Every tale starts at the harbour and goes somewhere you didn't expect.", "Sit down. The tide's going out, so we've time for a long one.", "saltwater", ["stories", "calm"], [200, 30, 230], { rating: 4.6, chats: 7800 }),
  base("vesper", "Vesper", "A late-night companion with a dry sense of humour.", "Vesper keeps you company, remembers what you said earlier in the conversation, and doesn't take either of you too seriously.", "You're up late. Good. So am I.", "after-hours", ["companion"], [270, 330, 240], { mature: true, rating: 4.4, chats: 31000 }),
];

/** The workspace a made character belongs to. Characters with no entry are personal, or the seeded public cast. */
const homes = new Map<string, string>();

/**
 * A character as one account sees it. A private one exists only in the account it was made in; a public one is
 * everyone's, and "mine" only where it was made.
 */
function seenFrom(scope: string | null) {
  return (entry: Character): Character | null => {
    const home = homes.get(entry.slug) ?? null;
    const here = home === scope;
    if (entry.mine && !here) return entry.visibility === "public" ? { ...entry, mine: false } : null;
    return entry;
  };
}

function slugify(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  let candidate = slug || "character";
  for (let n = 2; characters.some((entry) => entry.slug === candidate); n += 1) candidate = `${slug}-${n}`;
  return candidate;
}

export interface CharacterFilter {
  scope?: "mine" | "public";
  query?: string;
  /** Include characters marked mature. Off unless the instance and the user both allow it. */
  includeMature?: boolean;
}

export function listStoredCharacters(filter: CharacterFilter = {}, scope: string | null = null): Character[] {
  const query = filter.query?.trim().toLowerCase();
  const see = seenFrom(scope);
  return characters.flatMap((entry) => see(entry) ?? []).filter((entry) => {
    if (filter.scope === "mine" && !entry.mine) return false;
    if (filter.scope === "public" && entry.visibility !== "public") return false;
    if (entry.mature && !filter.includeMature) return false;
    if (!query) return true;
    return [entry.name, entry.tagline, entry.description, ...entry.tags].some((text) => text.toLowerCase().includes(query));
  });
}

export function readStoredCharacter(slug: string, scope: string | null = null): Character | null {
  const entry = characters.find((candidate) => candidate.slug === slug);
  return entry ? seenFrom(scope)(entry) : null;
}

export function createStoredCharacter(input: CharacterInput, author: string, scope: string | null = null): Character {
  let hash = 0;
  for (const char of input.name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  const character: Character = {
    ...input,
    slug: slugify(input.name),
    author,
    calls: true,
    tags: [],
    rating: 0,
    chats: 0,
    mine: true,
    image: null,
    artwork: { hues: [hash % 360, (hash + 60) % 360, (hash + 210) % 360], seed: hash % 97 },
  };
  characters.unshift(character);
  if (scope) homes.set(character.slug, scope);
  return character;
}
