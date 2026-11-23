"use client";

import type { AgentModel, AppModel, Character, CharacterCast, Conversation, Generation, MediaItem, Offering, SendMessageInput, VideoMoment } from "@livepeer/api-client/types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Composer, messageFrom, type ComposerValue } from "../home/composer";
import { AgentTurn } from "./agent-turn";

export interface ChatScreenProps {
  conversation: Conversation;
  offerings: ReadonlyArray<Offering>;
  /** The language models the agent can run on, for its model menu. */
  agentModels: ReadonlyArray<AgentModel>;
  /** The models behind the other apps, named in the agent's steps. */
  models: ReadonlyArray<AppModel>;
  getConversation: (id: string) => Promise<Conversation | null>;
  sendMessage: (id: string, input: SendMessageInput) => Promise<Conversation | null>;
  getGeneration: (id: string) => Promise<Generation | null>;
  onOpenInStudio: (generation: Generation) => void;
  /** Hand a moment the agent found to the studio. */
  onOpenMoment: (moment: VideoMoment) => void;
  loadLibrary: () => Promise<MediaItem[]>;
  /** Absent when the instance has characters switched off. */
  loadCharacters?: () => Promise<Character[]>;
  /** Sends a file from this device to the library. */
  upload: (file: File) => Promise<MediaItem>;
}

const POLL_MS = 700;

/** Who a message put on screen. */
function CastLabel({ cast }: { cast: CharacterCast }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-caption text-muted-foreground">
      {cast.image ? (
        // eslint-disable-next-line @next/next/no-img-element -- a small, already-cached portrait
        <img src={cast.image} alt="" className="size-5 rounded-full object-cover" />
      ) : null}
      With {cast.name}
    </span>
  );
}
const EMPTY: ComposerValue = { attachments: [], cast: null, prompt: "", app: null, model: null, aspect: "16:9", durationSeconds: 5 };

export function ChatScreen({ conversation: initial, offerings, agentModels, models, getConversation, sendMessage, getGeneration, onOpenInStudio, onOpenMoment, loadLibrary, loadCharacters, upload }: ChatScreenProps) {
  const [conversation, setConversation] = useState(initial);
  // Steps name the model that did each piece of work, the agent's own model included.
  const stepModels = useMemo<AppModel[]>(
    () => [...models, ...agentModels.map(({ app, model, context_tokens }) => ({ app, model, context_tokens }))],
    [models, agentModels],
  );
  const [generations, setGenerations] = useState<Record<string, Generation>>({});
  // A conversation carries on as it was: the same model runs the agent, and a cast character stays
  // cast so the next message can direct them further.
  const [value, setValue] = useState<ComposerValue>(() => {
    const last = initial.messages.findLast((message) => message.role === "user");
    return last?.role === "user" ? { ...EMPTY, cast: last.cast, model: last.agent_model } : EMPTY;
  });
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const calls = useRef({ getConversation, getGeneration });
  calls.current = { getConversation, getGeneration };

  const generationIds = useMemo(
    () => conversation.messages.flatMap((message) => (message.role === "agent" ? message.generation_ids : [])),
    [conversation.messages],
  );
  const working = conversation.messages.some((message) => message.role === "agent" && message.state === "working");
  const rendering = generationIds.some((id) => {
    const state = generations[id]?.state;
    return state !== "succeeded" && state !== "failed";
  });

  useEffect(() => {
    if (!working && !rendering) return;
    let cancelled = false;
    const tick = async () => {
      const [next, updates] = await Promise.all([
        working ? calls.current.getConversation(conversation.id) : null,
        Promise.all(generationIds.map((id) => calls.current.getGeneration(id))),
      ]);
      if (cancelled) return;
      if (next) setConversation(next);
      setGenerations((current) => {
        const merged = { ...current };
        for (const update of updates) if (update) merged[update.id] = update;
        return merged;
      });
    };
    const timer = setInterval(tick, POLL_MS);
    void tick();
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [working, rendering, conversation.id, generationIds]);

  const count = conversation.messages.length;
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [count, working]);

  const submit = useCallback(
    async (input: ComposerValue) => {
      setError(null);
      // The character stays cast for the next message, so a follow-up can direct them further.
      setValue({ ...input, prompt: "", attachments: [] });
      const next = await sendMessage(conversation.id, messageFrom(input)).catch(() => null);
      if (next) setConversation(next);
      else {
        setError("That message didn’t send. Try again.");
        setValue(input);
      }
    },
    [conversation.id, sendMessage],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-[760px] flex-col gap-8 px-4 pb-10 pt-8 md:px-6">
          {conversation.messages.map((message) =>
            message.role === "user" ? (
              <div key={message.id} className="ml-auto flex max-w-[80%] flex-col items-end gap-1.5">
                {message.cast ? <CastLabel cast={message.cast} /> : null}
                <p className="whitespace-pre-wrap rounded-card bg-secondary px-4 py-2.5 text-lead text-secondary-foreground">{message.text}</p>
              </div>
            ) : (
              <AgentTurn
                key={message.id}
                message={message}
                generations={message.generation_ids.flatMap((id) => generations[id] ?? [])}
                models={stepModels}
                onOpenInStudio={onOpenInStudio}
                onOpenMoment={onOpenMoment}
              />
            ),
          )}
          <div ref={endRef} />
        </div>
      </div>
      <div className="mx-auto w-full max-w-[760px] px-4 pb-4 md:px-6 md:pb-6">
        {error ? (
          <p role="alert" className="mb-2 px-2 text-caption text-destructive">
            {error}
          </p>
        ) : null}
        <Composer value={value} onChange={setValue} onSubmit={submit} offerings={offerings} agentModels={agentModels} placeholder="Ask for a change, or describe the next shot…" compact loadLibrary={loadLibrary} upload={upload} {...(loadCharacters ? { loadCharacters } : {})} />
      </div>
    </div>
  );
}
