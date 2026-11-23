"use client";

import type { AgentModel, Character, CharacterCast, MediaItem, Offering, PromptStarter } from "@livepeer/api-client/types";
import { Chip } from "@livepeer/ui";
import { Film, ImagePlay, Radio, ScanSearch, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Composer, type ComposerValue } from "./composer";
import { HomeBackdrop } from "./home-backdrop";

export interface HomeScreenProps {
  starters: ReadonlyArray<PromptStarter>;
  offerings: ReadonlyArray<Offering>;
  /** The language models the agent can run on, for its model menu. */
  agentModels: ReadonlyArray<AgentModel>;
  /** Hands the request to the next screen. */
  onSubmit: (value: ComposerValue) => void | Promise<void>;
  /** Footage behind the composer, from the instance config. */
  backdrop?: { video?: string | null; poster?: string | null; image?: string | null; aurora?: boolean };
  /** Absent for guests, who have no library. */
  loadLibrary?: () => Promise<MediaItem[]>;
  /** Absent for guests, and when the instance has characters switched off. */
  loadCharacters?: () => Promise<Character[]>;
  /** A character already put on screen, arriving from their page. */
  cast?: CharacterCast | null;
}

const STARTER_ICONS: Record<string, LucideIcon> = {
  "make-video": Film,
  "animate-image": ImagePlay,
  "understand-video": ScanSearch,
  "restyle-live": Radio,
};

const EMPTY: ComposerValue = { attachments: [], cast: null, prompt: "", app: null, model: null, aspect: "16:9", durationSeconds: 5 };

export function HomeScreen({ starters, offerings, agentModels, onSubmit, loadLibrary, loadCharacters, cast = null, backdrop }: HomeScreenProps) {
  const [value, setValue] = useState<ComposerValue>(() =>
    cast ? { ...EMPTY, cast, app: offerings.some((offering) => offering.app === "image-to-video") ? "image-to-video" : null } : EMPTY,
  );
  // The starting point being sent, so a second tap can't start a second conversation.
  const [starting, setStarting] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  // Arriving with a character cast, the next thing to do is describe the scene.
  const arrivedWithCast = cast !== null;
  useEffect(() => {
    if (arrivedWithCast) textareaRef.current?.focus();
  }, [arrivedWithCast]);
  const known = (app: string) => (offerings.some((offering) => offering.app === app) ? app : null);

  // A starting point is sent as it is: its name is the request, and the agent asks for the rest in the
  // conversation it opens. What is in the composer stays there.
  const start = async (entry: PromptStarter) => {
    setStarting(entry.id);
    try {
      await onSubmit({ ...EMPTY, prompt: entry.label, app: known(entry.app), model: value.model, aspect: value.aspect, durationSeconds: value.durationSeconds });
    } finally {
      setStarting(null);
    }
  };

  return (
    <div className="relative flex flex-1 flex-col overflow-y-auto">
      <HomeBackdrop video={backdrop?.video ?? null} poster={backdrop?.poster ?? null} image={backdrop?.image ?? null} aurora={backdrop?.aurora ?? false} />
      <section className="relative mx-auto flex w-full max-w-[720px] flex-1 flex-col items-center justify-center px-4 pb-[14vh] pt-10 md:px-6">
        <h1 className="text-balance text-center text-[32px] font-semibold leading-[1.1] tracking-[-0.02em] text-foreground md:text-display">
          Direct anything.
        </h1>
        <p className="mt-3 max-w-[460px] text-balance text-center text-lead text-muted-foreground">
          Describe a scene and watch it play out. Then edit it, restyle it, or take it live.
        </p>

        <div className="mt-8 w-full">
          <Composer
            value={value}
            onChange={setValue}
            onSubmit={onSubmit}
            offerings={offerings}
            agentModels={agentModels}
            textareaRef={textareaRef}
            {...(loadLibrary ? { loadLibrary } : {})}
            {...(loadCharacters ? { loadCharacters } : {})}
          />
        </div>

        <div className="mt-4 flex w-full flex-wrap justify-center gap-2">
          {starters.map((entry) => {
            const Icon = STARTER_ICONS[entry.id] ?? Film;
            return (
              <Chip key={entry.id} disabled={starting !== null} onClick={() => void start(entry)} className="glass h-9 border-glass-edge px-3.5 text-body text-foreground/85">
                <Icon aria-hidden />
                {entry.label}
              </Chip>
            );
          })}
        </div>
      </section>
    </div>
  );
}
