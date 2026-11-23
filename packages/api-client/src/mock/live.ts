import type {
  CharacterCall,
  ExampleApp,
  LiveDestination,
  LiveDestinationInput,
  LiveLook,
  LiveSession,
  LiveSessionInput,
  MediaItem,
  VideoAnalysis,
} from "../types";

let sequence = 0;
const id = (prefix: string) => `${prefix}_${Date.now().toString(36)}${(sequence += 1).toString(36)}`;

const looks: LiveLook[] = [
  { id: "lok_gouache", name: "Gouache", prompt: "Hand-painted gouache, warm palette, visible brushwork", artwork: { hues: [38, 14, 60], seed: 3 } },
  { id: "lok_film", name: "1970s film print", prompt: "1970s film print, soft halation, faded teal shadows, light grain", artwork: { hues: [180, 30, 210], seed: 8 } },
  { id: "lok_ink", name: "Ink and wash", prompt: "Black ink line with grey wash, paper texture, minimal detail", artwork: { hues: [220, 240, 200], seed: 13 } },
  { id: "lok_neon", name: "Neon night", prompt: "Rain-slick neon night, magenta and cyan rim light, deep blacks", artwork: { hues: [310, 190, 270], seed: 21 } },
];

export function listStoredLooks(): LiveLook[] {
  return looks.map((look) => ({ ...look }));
}

export function saveStoredLook(name: string, prompt: string): LiveLook {
  let hash = 0;
  for (const char of prompt) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  const look: LiveLook = { id: id("lok"), name, prompt, artwork: { hues: [hash % 360, (hash + 70) % 360, (hash + 190) % 360], seed: hash % 97 } };
  looks.push(look);
  return { ...look };
}

const destinations: LiveDestination[] = [
  { id: "dst_youtube", platform: "youtube", label: "YouTube", url: "rtmp://a.rtmp.youtube.com/live2", key_hint: "x4pq", enabled: true },
];

export function listStoredDestinations(): LiveDestination[] {
  return destinations.map((destination) => ({ ...destination }));
}

export function addStoredDestination(input: LiveDestinationInput): LiveDestination {
  const destination: LiveDestination = {
    id: id("dst"),
    platform: input.platform,
    label: input.label,
    url: input.url,
    key_hint: input.stream_key.slice(-4),
    enabled: true,
  };
  destinations.push(destination);
  return { ...destination };
}

export function removeStoredDestination(destinationId: string): boolean {
  const index = destinations.findIndex((destination) => destination.id === destinationId);
  if (index < 0) return false;
  destinations.splice(index, 1);
  return true;
}

const sessions = new Map<string, LiveSession>();

export function startStoredSession(input: LiveSessionInput): LiveSession {
  const session: LiveSession = {
    id: id("ses"),
    app: input.app,
    state: "live",
    prompt: input.prompt,
    destination_ids: input.destination_ids,
    recording: input.record,
    started_at: new Date().toISOString(),
    recording_media_id: null,
  };
  sessions.set(session.id, session);
  return { ...session };
}

export function updateStoredSessionPrompt(sessionId: string, prompt: string): LiveSession | null {
  const session = sessions.get(sessionId);
  if (!session || session.state !== "live") return null;
  session.prompt = prompt;
  return { ...session };
}

/** Ends a session. A recorded session becomes a library item, returned for the caller to store. */
export function stopStoredSession(sessionId: string): { session: LiveSession; recording: MediaItem | null } | null {
  const session = sessions.get(sessionId);
  if (!session) return null;
  session.state = "ended";
  let recording: MediaItem | null = null;
  if (session.recording) {
    const seconds = Math.max(1, Math.round((Date.now() - Date.parse(session.started_at)) / 1000));
    recording = {
      id: `med_${session.id}`,
      kind: "video",
      source: "recording",
      title: `Live session, ${new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(session.started_at))}`,
      description: `A recorded live session, restyled as: ${session.prompt}`,
      tags: ["live", "recording"],
      app: session.app,
      prompt: session.prompt,
      aspect: "16:9",
      duration_seconds: seconds,
      created_at: session.started_at,
      image: null,
      artwork: { hues: [38, 14, 60], seed: seconds % 97 },
      made_by: null,
    };
    session.recording_media_id = recording.id;
  }
  return { session: { ...session }, recording };
}

const calls = new Map<string, CharacterCall>();

export function startStoredCall(characterSlug: string, mode: CharacterCall["mode"]): CharacterCall {
  const call: CharacterCall = { id: id("cal"), character_slug: characterSlug, mode, state: "connected", started_at: new Date().toISOString() };
  calls.set(call.id, call);
  return { ...call };
}

export function endStoredCall(callId: string): CharacterCall | null {
  const call = calls.get(callId);
  if (!call) return null;
  call.state = "ended";
  return { ...call };
}

/** What a video understanding capability returns for a video and a question. */
export function analyseStoredVideo(subject: string, question: string): VideoAnalysis {
  const find = /find|where|every|when/i.test(question);
  return {
    summary: find
      ? `Three moments in ${subject} match what you asked for. The clearest is the second, where the subject is centred and unobstructed.`
      : `${subject} opens wide to establish the place, moves in on the subject through the middle section, and ends on a held close shot. The camera movement is slow and continuous; there are no cuts.`,
    moments: [
      { at_seconds: 0, label: "Wide establishing shot" },
      { at_seconds: 2.4, label: "Subject enters and the camera begins to move" },
      { at_seconds: 5.1, label: "Closest framing; strongest light" },
      { at_seconds: 8.6, label: "Held final frame" },
    ],
    tags: ["slow movement", "single take", "natural light"],
  };
}

export const EXAMPLE_APPS: ExampleApp[] = [
  {
    id: "live-avatar",
    name: "Live avatar",
    description: "A character that listens and answers on video in real time. Opens a persistent session, sends microphone audio in and plays the returned video.",
    app: "live-avatar",
    language: "TypeScript",
    artwork: { hues: [320, 280, 20], seed: 5 },
    code: `import { createClient } from "@livepeer/api-client";

const client = createClient({ baseUrl: process.env.INSTANCE_URL, apiKey: process.env.API_KEY });

// A persistent session: it stays open until you close it and is billed by the second.
const session = await client.sessions.open({
  app: "live-avatar",
  input: { character: "juno-live", voice: "warm" },
});

const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
session.publish(mic);                       // your audio goes in
video.srcObject = await session.subscribe(); // the avatar's video comes back

window.addEventListener("beforeunload", () => session.close());`,
  },
  {
    id: "interactive-world",
    name: "Interactive world",
    description: "A scene you steer as it renders. Keyboard input changes the prompt while the session is running, so the world responds without restarting.",
    app: "live-video-to-video",
    language: "TypeScript",
    artwork: { hues: [150, 200, 90], seed: 17 },
    code: `const session = await client.sessions.open({
  app: "live-video-to-video",
  input: { prompt: "A forest path at dusk, first person, walking forward" },
});

video.srcObject = await session.subscribe();

const directions = { ArrowLeft: "turning left", ArrowRight: "turning right", ArrowUp: "walking faster" };
window.addEventListener("keydown", (event) => {
  const change = directions[event.key];
  // Steering is a prompt update on the open session, not a new job.
  if (change) session.update({ prompt: \`A forest path at dusk, first person, \${change}\` });
});`,
  },
  {
    id: "live-restyle",
    name: "Restyle a camera",
    description: "The loop behind Live mode: publish a camera, apply a look, switch looks on air and send the result to an RTMP destination.",
    app: "live-video-to-video",
    language: "TypeScript",
    artwork: { hues: [38, 14, 60], seed: 29 },
    code: `const camera = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });

const session = await client.sessions.open({
  app: "live-video-to-video",
  input: { prompt: "Hand-painted gouache, warm palette" },
  outputs: [{ rtmp: process.env.RTMP_URL, key: process.env.STREAM_KEY }],
  record: true,
});

session.publish(camera);
preview.srcObject = await session.subscribe();

// Change the look without going off air.
lookButtons.forEach((button) =>
  button.addEventListener("click", () => session.update({ prompt: button.dataset.prompt })),
);`,
  },
];

/** A plausible reading for a running session: steady, with small drift and an occasional dip. */
export function readStoredSessionHealth(sessionId: string): import("../types").LiveHealth | null {
  const session = sessions.get(sessionId);
  if (!session || session.state !== "live") return null;
  const t = (Date.now() - Date.parse(session.started_at)) / 1000;
  const dip = Math.sin(t / 7) > 0.96 ? 900 : 0;
  return {
    at: new Date().toISOString(),
    bitrate_kbps: Math.round(4500 + Math.sin(t / 3) * 180 + Math.sin(t * 1.7) * 60 - dip),
    fps: Math.round((30 - (dip ? 4 : 0) + Math.sin(t) * 0.4) * 10) / 10,
    dropped_frames: Math.floor(t / 40),
    latency_ms: Math.round(180 + Math.sin(t / 5) * 25 + (dip ? 60 : 0)),
  };
}
