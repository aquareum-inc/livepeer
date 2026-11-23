"use client";

import type { AgentModel, Character, CharacterCast, MediaItem, Offering, SendMessageInput } from "@livepeer/api-client/types";
import { Chip, EASE_OUT_EXPO, Sheet, cn } from "@livepeer/ui";
import { ArrowUp, Check, Film, ImageIcon, Mic, Plus, Upload, UserRound, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type Ref } from "react";

import { CharacterPortrait } from "../characters/character-portrait";
import { MediaStill } from "../media/media-still";

import { isVideoApp } from "../lib/offering";
import { AgentModelPicker } from "./agent-model-picker";

export type Aspect = "16:9" | "9:16" | "1:1";

export interface ComposerValue {
  /** Library items attached to the request, for the agent to watch or work from. */
  attachments: MediaItem[];
  /** A character to put on screen, starting from their portrait. */
  cast: CharacterCast | null;
  prompt: string;
  /**
   * A capability hint for the agent, set by a starting point or a cast character; `null` leaves it
   * to the agent. Not chosen here directly: capabilities are picked in the studio.
   */
  app: string | null;
  /** The language model that runs the agent; `null` is Auto. */
  model: string | null;
  aspect: Aspect;
  durationSeconds: number;
}

export interface ComposerProps {
  value: ComposerValue;
  onChange: (value: ComposerValue) => void;
  onSubmit: (value: ComposerValue) => void | Promise<void>;
  offerings: ReadonlyArray<Offering>;
  /** The language models the agent can run on, for its model menu. */
  agentModels: ReadonlyArray<AgentModel>;
  textareaRef?: Ref<HTMLTextAreaElement>;
  placeholder?: string;
  /** Loads the user's library for attaching. */
  loadLibrary?: () => Promise<MediaItem[]>;
  /** Loads the characters the user can put on screen. Without it and without `guest`, the cast button is hidden. */
  loadCharacters?: () => Promise<Character[]>;
  /** Sends a photo or video from this device to the library and answers with the item. Throws an Error whose message says why not. */
  upload?: (file: File) => Promise<MediaItem>;
  /**
   * For someone not signed in: attaching and casting are still offered, and using either sends them to
   * sign in. `characters` says whether the instance has characters switched on.
   */
  guest?: { signIn: () => void; characters: boolean };
  /** One line tall until typed in, for the foot of a conversation. */
  compact?: boolean;
}

/** What can be attached: something to watch or something to start a shot from. */
const attachable = (item: MediaItem) => item.kind === "video" || item.kind === "image";

/** The file types an upload accepts, as the instance's media store does. */
const UPLOAD_TYPES = "image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm";

/**
 * The message a composer sends. With only attachments, it asks for a video to be understood, or for a
 * picture to be brought to life.
 */
export function messageFrom(value: ComposerValue): SendMessageInput {
  const fallback = value.attachments.some((item) => item.kind === "video") ? "Summarise this and list the key moments." : "Bring this picture to life.";
  return {
    text: value.prompt.trim() || fallback,
    app: value.app,
    aspect: value.aspect,
    duration_seconds: value.durationSeconds,
    ...(value.attachments.length > 0 ? { attachment_ids: value.attachments.map((item) => item.id) } : {}),
    ...(value.cast ? { character_slug: value.cast.slug } : {}),
    ...(value.model ? { agent_model: value.model } : {}),
  };
}

const ASPECTS: Aspect[] = ["16:9", "9:16", "1:1"];
const DURATIONS = [5, 10, 15];

function cycle<T>(options: ReadonlyArray<T>, current: T): T {
  const next = options[(options.indexOf(current) + 1) % options.length];
  return next ?? current;
}

/**
 * The one object on the home screen. Video parameters appear only when the request is a video,
 * and the send button is the only ink in view.
 */
export function Composer({
  value,
  onChange,
  onSubmit,
  offerings,
  agentModels,
  textareaRef,
  placeholder = "A slow push along a harbour at first light…",
  compact = false,
  loadLibrary,
  loadCharacters,
  upload,
  guest,
}: ComposerProps) {
  const [picking, setPicking] = useState(false);
  const [library, setLibrary] = useState<MediaItem[] | null>(null);
  const [libraryFailed, setLibraryFailed] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const openPicker = async () => {
    if (!loadLibrary) return guest?.signIn();
    setPicking(true);
    setLibraryFailed(false);
    setUploadError(null);
    try {
      setLibrary((await loadLibrary()).filter(attachable));
    } catch {
      setLibraryFailed(true);
    }
  };

  // A file from this device goes to the library first, then onto the request like anything else in it.
  const sendFile = async (file: File | undefined) => {
    if (!file || !upload) return;
    setUploading(true);
    setUploadError(null);
    try {
      const item = await upload(file);
      onChange({ ...value, attachments: [...value.attachments, item] });
      setPicking(false);
      localRef.current?.focus();
    } catch (cause) {
      setUploadError(cause instanceof Error && cause.message ? cause.message : "That file didn't upload. Try again.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const [casting, setCasting] = useState(false);
  const [characters, setCharacters] = useState<Character[] | null>(null);
  const [charactersFailed, setCharactersFailed] = useState(false);

  const openCasting = async () => {
    if (!loadCharacters) return guest?.signIn();
    setCasting(true);
    setCharactersFailed(false);
    try {
      setCharacters(await loadCharacters());
    } catch {
      setCharactersFailed(true);
    }
  };

  // A character is put on screen by starting the shot from their portrait, so the request becomes
  // image-to-video when the network offers it.
  const cast = (character: Character) => {
    const imageToVideo = offerings.some((offering) => offering.app === "image-to-video");
    onChange({ ...value, cast: { slug: character.slug, name: character.name, image: character.image }, app: imageToVideo ? "image-to-video" : value.app });
    setCasting(false);
    localRef.current?.focus();
  };

  const toggleAttachment = (item: MediaItem) => {
    const attached = value.attachments.some((entry) => entry.id === item.id);
    onChange({ ...value, attachments: attached ? value.attachments.filter((entry) => entry.id !== item.id) : [...value.attachments, item] });
  };
  const localRef = useRef<HTMLTextAreaElement | null>(null);
  const canSend = value.prompt.trim().length > 0 || value.attachments.length > 0;
  const showVideoParams = value.app !== null && isVideoApp(value.app);

  useEffect(() => {
    const element = localRef.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, 220)}px`;
  }, [value.prompt]);

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    if (canSend) void onSubmit(value);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <motion.form
      layout
      onSubmit={submit}
      transition={{ layout: { duration: 0.32, ease: EASE_OUT_EXPO } }}
      className="w-full glass rounded-sheet border border-glass-edge p-2 transition-[border-color] duration-200 focus-within:border-input"
    >
      {value.attachments.length > 0 || value.cast ? (
        <motion.ul layout="position" className="flex flex-wrap gap-1.5 px-2 pt-2">
          {value.cast ? (
            <li className="inline-flex h-8 items-center gap-1.5 rounded-full bg-secondary pl-1 pr-1 text-caption font-medium text-secondary-foreground">
              <span className="relative size-6 shrink-0 overflow-hidden rounded-full bg-muted">
                {value.cast.image ? (
                  // eslint-disable-next-line @next/next/no-img-element -- a small, already-cached portrait
                  <img src={value.cast.image} alt="" className="size-full object-cover" />
                ) : (
                  <span aria-hidden className="flex size-full items-center justify-center text-[11px]">{value.cast.name.charAt(0)}</span>
                )}
              </span>
              <span className="max-w-[180px] truncate">With {value.cast.name}</span>
              <button type="button" aria-label={`Take ${value.cast.name} out`} onClick={() => onChange({ ...value, cast: null, app: value.app === "image-to-video" ? null : value.app })} className="inline-flex size-6 items-center justify-center rounded-full text-muted-foreground hover:bg-hover hover:text-foreground">
                <X className="size-3.5" />
              </button>
            </li>
          ) : null}
          {value.attachments.map((item) => (
            <li key={item.id} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-secondary pl-2.5 pr-1 text-caption font-medium text-secondary-foreground">
              {item.kind === "image" ? <ImageIcon className="size-3.5 text-muted-foreground" aria-hidden /> : <Film className="size-3.5 text-muted-foreground" aria-hidden />}
              <span className="max-w-[180px] truncate">{item.title}</span>
              <button type="button" aria-label={`Remove ${item.title}`} onClick={() => toggleAttachment(item)} className="inline-flex size-6 items-center justify-center rounded-full text-muted-foreground hover:bg-hover hover:text-foreground">
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </motion.ul>
      ) : null}
      <motion.textarea
        layout="position"
        ref={(element) => {
          localRef.current = element;
          if (typeof textareaRef === "function") textareaRef(element);
          else if (textareaRef) textareaRef.current = element;
        }}
        value={value.prompt}
        onChange={(event) => onChange({ ...value, prompt: event.target.value })}
        onKeyDown={onKeyDown}
        rows={compact ? 1 : 2}
        aria-label="Describe what you want to make"
        placeholder={value.cast ? `Put ${value.cast.name} in a scene: where, doing what, in what light…` : placeholder}
        className={cn(
          "block max-h-[220px] w-full resize-none bg-transparent px-4 pb-1 pt-3 text-lead text-foreground outline-none placeholder:text-subtle-foreground",
          compact ? "min-h-[36px]" : "min-h-[56px]",
        )}
      />
      <motion.div layout="position" className="flex items-center gap-1 pl-1">
        {loadLibrary || guest ? (
        <button
          type="button"
          onClick={openPicker}
          aria-label="Attach a photo or video"
          className="inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition-[background-color,color,transform] duration-200 ease-out-expo hover:bg-hover hover:text-foreground active:scale-[0.92]"
        >
          <Plus className="size-[18px]" />
        </button>
        ) : null}
        {loadCharacters || guest?.characters ? (
          <button
            type="button"
            onClick={openCasting}
            aria-label="Put a character in it"
            aria-pressed={value.cast !== null}
            className="inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition-[background-color,color,transform] duration-200 ease-out-expo hover:bg-hover hover:text-foreground active:scale-[0.92] aria-pressed:text-foreground"
          >
            <UserRound className="size-[18px]" />
          </button>
        ) : null}
        <AgentModelPicker models={agentModels} value={value.model} onValueChange={(model) => onChange({ ...value, model })} />
        <AnimatePresence initial={false}>
          {showVideoParams ? (
            <motion.div
              key="video-params"
              initial={{ opacity: 0, x: -8, filter: "blur(4px)" }}
              animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, x: -6, filter: "blur(2px)", transition: { duration: 0.15 } }}
              transition={{ duration: 0.24, ease: EASE_OUT_EXPO }}
              className="flex items-center gap-1"
            >
              <Chip
                aria-label={`Aspect ratio ${value.aspect}. Press to change.`}
                onClick={() => onChange({ ...value, aspect: cycle(ASPECTS, value.aspect) })}
                className="font-mono"
              >
                {value.aspect}
              </Chip>
              <Chip
                aria-label={`Duration ${value.durationSeconds} seconds. Press to change.`}
                onClick={() => onChange({ ...value, durationSeconds: cycle(DURATIONS, value.durationSeconds) })}
                className="font-mono"
              >
                {value.durationSeconds}s
              </Chip>
            </motion.div>
          ) : null}
        </AnimatePresence>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            aria-label="Dictate"
            className="inline-flex size-10 items-center justify-center rounded-full text-muted-foreground transition-[background-color,color,transform] duration-200 ease-out-expo hover:bg-hover hover:text-foreground active:scale-[0.92]"
          >
            <Mic className="size-[18px]" />
          </button>
          <button
            type="submit"
            aria-label="Send"
            disabled={!canSend}
            className={cn(
              "inline-flex size-10 items-center justify-center rounded-full transition-[background-color,color,transform,opacity] duration-200 ease-out-expo active:scale-[0.92]",
              canSend ? "bg-primary text-primary-foreground" : "bg-active text-subtle-foreground",
            )}
          >
            <ArrowUp className="size-[18px]" strokeWidth={2.25} />
          </button>
        </div>
      </motion.div>
      <Sheet open={picking} onOpenChange={setPicking} title="Attach a photo or video" description="The agent can watch a video and work from it, or start a shot from a picture.">
        {upload ? (
          <div className="mb-4">
            <input ref={fileRef} type="file" accept={UPLOAD_TYPES} className="sr-only" tabIndex={-1} aria-hidden onChange={(event) => void sendFile(event.target.files?.[0])} />
            <button
              type="button"
              disabled={uploading}
              aria-busy={uploading}
              onClick={() => fileRef.current?.click()}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-field border border-border bg-card text-body font-medium text-foreground transition-[background-color,transform] duration-200 ease-out-expo hover:bg-hover active:scale-[0.97] disabled:opacity-60"
            >
              <Upload className={cn("size-4", uploading && "animate-breathe")} aria-hidden />
              {uploading ? "Uploading…" : "Upload from this device"}
            </button>
            {uploadError ? <p role="alert" className="mt-2 text-caption text-destructive">{uploadError}</p> : null}
            <p className="mt-4 text-caption font-medium text-muted-foreground">From your library</p>
          </div>
        ) : null}
        {libraryFailed ? (
          <p role="alert" className="text-body text-destructive">Your library didn't load. Close this and try again.</p>
        ) : library === null ? (
          <div className="grid grid-cols-3 gap-2" aria-busy>
            {Array.from({ length: 6 }, (_, index) => (
              <span key={index} className="aspect-video animate-breathe rounded-field bg-secondary" />
            ))}
          </div>
        ) : library.length === 0 ? (
          <p className="text-body text-muted-foreground">Nothing in your library yet. Shots you generate and files you upload are saved there.</p>
        ) : (
          <ul className="grid max-h-[50dvh] grid-cols-3 gap-2 overflow-y-auto">
            {library.map((item) => {
              const attached = value.attachments.some((entry) => entry.id === item.id);
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    aria-pressed={attached}
                    aria-label={item.title}
                    onClick={() => toggleAttachment(item)}
                    className={cn("relative block aspect-video w-full overflow-hidden rounded-field ring-1 ring-hairline transition-transform duration-200 active:scale-[0.97]", attached && "ring-2 ring-foreground")}
                  >
                    <MediaStill image={item.image} artwork={item.artwork} still />
                    <span className="absolute inset-x-1.5 bottom-1 truncate text-left text-[11px] font-medium text-white">{item.title}</span>
                    {attached ? (
                      <span className="absolute right-1.5 top-1.5 inline-flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <Check className="size-3" strokeWidth={3} />
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Sheet>
      <Sheet open={casting} onOpenChange={setCasting} title="Put a character in it" description="Their portrait becomes the first frame, so they look like themselves in every shot.">
        {charactersFailed ? (
          <p role="alert" className="text-body text-destructive">Characters didn't load. Close this and try again.</p>
        ) : characters === null ? (
          <div className="grid grid-cols-3 gap-2" aria-busy>
            {Array.from({ length: 6 }, (_, index) => (
              <span key={index} className="aspect-[3/4] animate-breathe rounded-field bg-secondary" />
            ))}
          </div>
        ) : characters.length === 0 ? (
          <p className="text-body text-muted-foreground">No characters yet. Make one on the Characters page and it shows up here.</p>
        ) : (
          <ul className="grid max-h-[55dvh] grid-cols-3 gap-2 overflow-y-auto">
            {characters.map((character) => {
              const chosen = value.cast?.slug === character.slug;
              return (
                <li key={character.slug}>
                  <button
                    type="button"
                    aria-pressed={chosen}
                    aria-label={`Put ${character.name} in it`}
                    onClick={() => cast(character)}
                    className={cn("relative block aspect-[3/4] w-full overflow-hidden rounded-field ring-1 ring-hairline transition-transform duration-200 active:scale-[0.97]", chosen && "ring-2 ring-foreground")}
                  >
                    <CharacterPortrait character={character} still initialClassName="text-title" />
                    <span aria-hidden className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/70 to-transparent" />
                    <span className="absolute inset-x-2 bottom-1.5 truncate text-left text-caption font-medium text-white">{character.name}</span>
                    {chosen ? (
                      <span className="absolute right-1.5 top-1.5 inline-flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <Check className="size-3" strokeWidth={3} />
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Sheet>
    </motion.form>
  );
}
