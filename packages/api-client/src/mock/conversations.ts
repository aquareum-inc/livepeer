import type {
  AgentMessage,
  AgentStep,
  CharacterCast,
  Conversation,
  ConversationSummary,
  Message,
  SendMessageInput,
  VideoAnalysis,
} from "../types";
import { readStoredCharacter } from "./characters";
import { listStoredMedia } from "./library";
import { analyseStoredVideo } from "./live";
import type { Owner } from "./shared";
import { createStoredGeneration } from "./store";

interface ScriptedStep extends Omit<AgentStep, "state"> {
  ms: number;
}

interface StoredTurn {
  message: AgentMessage;
  script: ScriptedStep[];
  reply: string;
  analysis: VideoAnalysis | null;
  startedAt: number;
  /** When, into the turn, its generations begin. */
  generateAt: number;
}

interface StoredConversation {
  id: string;
  title: string;
  updatedAt: number;
  messages: Message[];
  turns: Map<string, StoredTurn>;
  /** The capability the agent last asked about, so the answer is read as the rest of that request. */
  asked: string | null;
  /** Whose chat it is: null in a personal account, or a member's own inside a workspace. */
  home: ConversationHome | null;
}

/** A chat in a workspace belongs to one member there, and what it makes goes to the workspace's library. */
export interface ConversationHome extends Owner {
  userId: string;
}

const sameHome = (a: ConversationHome | null, b: ConversationHome | null) => (a?.scope ?? null) === (b?.scope ?? null) && (a?.userId ?? null) === (b?.userId ?? null);

const conversations = new Map<string, StoredConversation>();
let sequence = 0;

function id(prefix: string): string {
  sequence += 1;
  return `${prefix}_${Date.now().toString(36)}${sequence.toString(36)}`;
}

const VIDEO = /video|shot|film|footage|clip|animate|scene|camera|drone|tracking|timelapse|macro/i;
const PRODUCTION = /script|storyboard|\bfilm\b|trailer|advert|commercial|\d+[- ]second|scenes/i;
/** A request that names the kind of thing and nothing about it, such as a starting point sent as it is. */
const OPENER = /^(i'd like to |i want to |let's |help me )?(make|create|animate|understand|watch|restyle)\s+(a|an|my)\s+(video|image|photo|picture|live camera|camera)\.?$/i;
/** What a client sends when a picture is attached with no words. */
const PICTURE_ALONE = "Bring this picture to life.";
const UNDERSTAND = /summari[sz]e|find (every|the|all)|moments|timestamps|what happens|describe this/i;

function step(kind: AgentStep["kind"], title: string, detail: string, app: string | null, ms: number): ScriptedStep {
  return { id: id("stp"), kind, title, detail, app, ms };
}

/** What the agent asks before making anything, by capability. */
const QUESTIONS: Record<string, string> = {
  "text-to-video":
    "Happy to. What should it show? Give me the subject, what happens and where, and I'll add the lens, light and movement. Say so if you want a particular length or shape.",
  "image-to-video":
    "Which picture, and what should move? Add one with the plus button, or put a character in it and I'll start from their portrait. You can also describe the picture and I'll draw the first frame before animating it.",
  "video-understanding":
    "Attach a video or paste a link and I'll go through it. I can summarise it, list the key moments with timestamps, and find every shot that matches a description.",
  "live-video-to-video":
    "What should your camera look like? Describe the look, such as a medium, a palette or an era, and I'll write the restyle for you to take live in the studio.",
};

/** The capability an opener is about: the one picked with it, or the one its words name. */
function openerKind(input: SendMessageInput): string | null {
  const text = input.text.trim();
  if (!OPENER.test(text)) return null;
  const named = /camera/i.test(text) ? "live-video-to-video" : /understand|watch/i.test(text) ? "video-understanding" : /image|photo|picture/i.test(text) ? "image-to-video" : "text-to-video";
  const kind = input.app ?? named;
  return kind in QUESTIONS ? kind : named;
}

/** The character a request puts on screen, if it names one that exists. */
function castFor(input: SendMessageInput, scope: string | null): CharacterCast | null {
  const character = input.character_slug ? readStoredCharacter(input.character_slug, scope) : null;
  return character ? { slug: character.slug, name: character.name, image: character.image } : null;
}

/** What the agent does for a request, as a timed script. The shape is what the real agent will report. */
function plan(input: SendMessageInput, cast: CharacterCast | null, scope: string | null): { script: ScriptedStep[]; reply: string; generate: number; analysis?: VideoAnalysis; asks?: string } {
  const subject = input.text.length > 80 ? `${input.text.slice(0, 77)}…` : input.text;
  const spec = `${input.duration_seconds}s, ${input.aspect}`;
  const attached = listStoredMedia({}, scope).find((item) => input.attachment_ids?.includes(item.id));
  const link = /https?:\/\/\S+/.exec(input.text)?.[0];

  // A picture is something to start a shot from, not something to watch.
  const picture = attached?.kind === "image" ? attached : undefined;
  if (picture) {
    const moves = UNDERSTAND.test(input.text) || input.text === PICTURE_ALONE ? "a slow push in, with the light and anything loose in the frame moving a little" : subject;
    return {
      generate: 1,
      script: [
        step("plan", "Start from your picture", `“${picture.title}” is the first frame, so the shot opens exactly as the picture looks.`, null, 1000),
        step("tool", "Write the shot prompt", `Described what moves: ${moves}.`, "chat", 1500),
        step("tool", "Generate the shot", spec, "image-to-video", 10400),
        step("review", "Check it against the picture", "Compared the first frame and the subject with your picture. They match.", "video-understanding", 1800),
      ],
      reply: `Here's “${picture.title}” in motion. It opens on your picture and I checked the subject held. Tell me what should move differently, or open it in the studio to extend it.`,
    };
  }

  if (attached || link) {
    const name = attached ? `“${attached.title}”` : "the linked video";
    const analysis = analyseStoredVideo(name, input.text);
    return {
      generate: 0,
      analysis,
      script: [
        step("tool", "Watch the video", attached ? `${attached.duration_seconds ?? 0}s from your library.` : `Fetched ${link}.`, "video-understanding", 2600),
        step("tool", "Mark the key moments", "Noted where the framing, subject or light changes.", "video-understanding", 1600),
      ],
      reply: `${analysis.summary} Pick a moment to restyle or extend it in the studio, or ask me something more specific about it.`,
    };
  }

  if (cast) {
    const shots = PRODUCTION.test(input.text) ? 3 : 1;
    const start = cast.image ? `${cast.name}'s portrait is the first frame, so the face holds from shot to shot` : `${cast.name} has no portrait yet, so I described them in full`;
    return {
      generate: shots,
      script: [
        step("plan", `Cast ${cast.name}`, `${start}. Their description sets how they move and react.`, null, 1100),
        step("tool", "Write the shot prompt", `Put ${cast.name} in “${subject}”, in character, with lens, light and movement added.`, "chat", 1500),
        step("tool", shots > 1 ? "Generate three shots" : "Generate the shot", shots > 1 ? `Each ${spec}, all starting from the same portrait.` : spec, "image-to-video", shots > 1 ? 9000 : 10400),
        step("review", `Check it's still ${cast.name}`, "Compared face, hair and wardrobe with the portrait, frame by frame. They match.", "video-understanding", 1800),
      ],
      reply: `Here's ${cast.name}${shots > 1 ? " across three shots" : ""}. I checked ${shots > 1 ? "every shot" : "the shot"} against the portrait before showing it. Open it in the studio to refine it, or tell me what ${cast.name} should do next.`,
    };
  }

  const opener = openerKind(input);
  if (opener) {
    return {
      generate: 0,
      asks: opener,
      script: [step("plan", "Read the request", "It says what kind of thing to make and nothing about it, so I'll ask before spending anything.", null, 900)],
      reply: QUESTIONS[opener] ?? "",
    };
  }

  if (UNDERSTAND.test(input.text)) {
    return {
      generate: 0,
      script: [
        step("plan", "Read the request", "Looking for a video to work from in this conversation.", null, 900),
      ],
      reply:
        "Attach a video or paste a link and I'll go through it. I can summarise it, list the key moments with timestamps, find every shot that matches a description, and hand any moment to the studio to restyle or extend.",
    };
  }

  if (PRODUCTION.test(input.text)) {
    return {
      generate: 3,
      script: [
        step("plan", "Plan the job", "Script, storyboard, three shots, a score, then assembly. I'll check each shot before moving on.", null, 1400),
        step("tool", "Write the script", "Three beats: establish, show the detail, resolve.", "chat", 2200),
        step("tool", "Draw the storyboard", "One frame per beat, to lock framing before spending on video.", "text-to-image", 2600),
        step("tool", "Generate three shots", `Each ${spec}, using the storyboard frames as first frames.`, "image-to-video", 9000),
        step("review", "Review the shots", "Watched each one back. Shot 2 drifted off the storyboard, so I regenerated it once.", "video-understanding", 2400),
        step("tool", "Compose the score", "Sparse piano that builds once, cut to the edit length.", "music", 2200),
        step("tool", "Assemble the cut", "Shots in order, score underneath, levels normalised.", "media/ffmpeg-compose", 1800),
      ],
      reply:
        "Here are the three shots in story order, with the score laid under the assembled cut. The second shot is a retake: the first attempt lost the framing from the storyboard. Open any shot in the studio to refine it, or tell me what to change and I'll redo just that part.",
    };
  }

  if (VIDEO.test(input.text) || (input.app !== null && /video/.test(input.app))) {
    return {
      generate: 1,
      script: [
        step("plan", "Choose a capability", `${input.app ?? "text-to-video"} fits a single described shot.`, null, 900),
        step("tool", "Write the shot prompt", `Kept your wording and added lens, light and movement for “${subject}”.`, "chat", 1500),
        step("tool", "Generate the shot", spec, input.app ?? "text-to-video", 10400),
        step("review", "Review the shot", "Watched it back against your request: subject, movement and framing match.", "video-understanding", 1800),
      ],
      reply:
        "Here's the shot. I checked it against what you asked for before showing it. Open it in the studio to change the framing or extend it, or tell me what to adjust.",
    };
  }

  return {
    generate: 0,
    script: [step("plan", "Think it through", "No generation needed for this one.", null, 1200)],
    reply:
      "I can help with that. If you want it on screen, describe the shot — subject, movement, light — and I'll generate it, or attach a video and I'll work from what's in it.",
  };
}

function titleFor(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > 48 ? `${clean.slice(0, 46)}…` : clean;
}

function resolveTurn(turn: StoredTurn): AgentMessage {
  const elapsed = Date.now() - turn.startedAt;
  let cursor = 0;
  const steps: AgentStep[] = turn.script.map(({ ms, ...rest }) => {
    const start = cursor;
    cursor += ms;
    const state = elapsed >= cursor ? "done" : elapsed >= start ? "running" : "pending";
    return { ...rest, state };
  });
  const done = elapsed >= cursor;
  return {
    ...turn.message,
    steps,
    state: done ? "done" : "working",
    text: done ? turn.reply : null,
    analysis: done ? turn.analysis : null,
    generation_ids: elapsed >= turn.generateAt ? turn.message.generation_ids : [],
    elapsed_ms: Math.min(elapsed, cursor),
  };
}

function snapshot(stored: StoredConversation): Conversation {
  return {
    id: stored.id,
    title: stored.title,
    updated_at: new Date(stored.updatedAt).toISOString(),
    messages: stored.messages.map((message) => {
      if (message.role === "user") return message;
      const turn = stored.turns.get(message.id);
      return turn ? resolveTurn(turn) : message;
    }),
  };
}

function append(stored: StoredConversation, sent: SendMessageInput): void {
  const now = new Date().toISOString();
  // An answer to "what should it show?" is the rest of the request the agent asked about.
  const input = sent.app === null && stored.asked ? { ...sent, app: stored.asked } : sent;
  const cast = castFor(input, stored.home?.scope ?? null);
  stored.messages.push({ id: id("msg"), role: "user", text: input.text, cast, agent_model: input.agent_model ?? null, created_at: now });
  const planned = plan(input, cast, stored.home?.scope ?? null);
  // Only a request to make something waits for its answer; a video to watch arrives as an attachment.
  stored.asked = planned.asks && /^(text|image)-to-video$/.test(planned.asks) ? planned.asks : null;
  const { reply, generate, analysis = null } = planned;
  // Planning is done by the language model the user picked, when they picked one.
  const script = input.agent_model ? planned.script.map((entry) => (entry.kind === "plan" ? { ...entry, app: input.agent_model ?? null } : entry)) : planned.script;
  const generateIndex = script.findIndex((entry) => entry.kind === "tool" && /-to-video$/.test(entry.app ?? ""));
  const generateAt = script.slice(0, Math.max(0, generateIndex)).reduce((total, entry) => total + entry.ms, 0);
  const picture = listStoredMedia({}, stored.home?.scope ?? null).find((item) => item.kind === "image" && input.attachment_ids?.includes(item.id));
  const firstFrame = cast?.image ?? picture?.image ?? null;
  const generationIds = Array.from({ length: generate }, (_, index) =>
    createStoredGeneration({
      kind: "video",
      app: cast || picture ? "image-to-video" : (input.app ?? "text-to-video"),
      ...(firstFrame ? { first_frame: firstFrame } : {}),
      prompt: generate > 1 ? `${input.text} — shot ${index + 1}` : input.text,
      aspect: input.aspect,
      duration_seconds: input.duration_seconds,
      resolution: "720p",
    }, generateAt, stored.home).id,
  );
  const message: AgentMessage = {
    id: id("msg"),
    role: "agent",
    state: "working",
    steps: [],
    text: null,
    generation_ids: generationIds,
    analysis: null,
    elapsed_ms: 0,
    created_at: now,
  };
  stored.messages.push(message);
  stored.turns.set(message.id, { message, script, reply, analysis, startedAt: Date.now(), generateAt });
  stored.updatedAt = Date.now();
}

export function createStoredConversation(input: SendMessageInput, home: ConversationHome | null = null): Conversation {
  const stored: StoredConversation = {
    id: id("cnv"),
    title: titleFor(input.text),
    updatedAt: Date.now(),
    messages: [],
    turns: new Map(),
    asked: null,
    home,
  };
  conversations.set(stored.id, stored);
  append(stored, input);
  return snapshot(stored);
}

/** A conversation only exists for the person it belongs to, in the account they made it in. */
function owned(conversationId: string, home: ConversationHome | null): StoredConversation | undefined {
  const stored = conversations.get(conversationId);
  return stored && sameHome(stored.home, home) ? stored : undefined;
}

export function sendStoredMessage(conversationId: string, input: SendMessageInput, home: ConversationHome | null = null): Conversation | null {
  const stored = owned(conversationId, home);
  if (!stored) return null;
  append(stored, input);
  return snapshot(stored);
}

export function readStoredConversation(conversationId: string, home: ConversationHome | null = null): Conversation | null {
  const stored = owned(conversationId, home);
  return stored ? snapshot(stored) : null;
}

export function listStoredConversations(home: ConversationHome | null = null): ConversationSummary[] {
  return [...conversations.values()]
    .filter((stored) => sameHome(stored.home, home))
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map(({ id: conversationId, title, updatedAt }) => ({
      id: conversationId,
      title,
      updated_at: new Date(updatedAt).toISOString(),
    }));
}

export function deleteStoredConversation(conversationId: string, home: ConversationHome | null = null): boolean {
  return owned(conversationId, home) ? conversations.delete(conversationId) : false;
}
