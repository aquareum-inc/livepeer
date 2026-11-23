"use client";

import type { MediaItem, MediaKind, Offering } from "@livepeer/api-client/types";
import { Badge, Button, Chip, EmptyState, Input, Page, Sheet, cn } from "@livepeer/ui";
import { AudioLines, Clapperboard, FolderOpen, Image as ImageIcon, MessageCircle, Play, Search, Trash2, Wrench } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { offeringLabel } from "../lib/offering";
import { MediaStill } from "../media/media-still";
import { useAccount } from "../shell/account";

export interface LibraryScreenProps {
  initialItems: MediaItem[];
  /** Capabilities that act on existing media: convert, trim, export and so on. */
  mediaActions: ReadonlyArray<Offering>;
  search: (filter: { query: string; kind?: MediaKind }) => Promise<MediaItem[]>;
  remove: (id: string) => Promise<boolean>;
  onOpenInStudio: (item: MediaItem) => void;
  onUseInChat: (item: MediaItem) => void;
  onRunAction: (item: MediaItem, app: string) => void;
}

const KINDS: Array<{ value: MediaKind | "all"; label: string }> = [
  { value: "all", label: "All" },
  { value: "video", label: "Video" },
  { value: "image", label: "Image" },
  { value: "audio", label: "Audio" },
];
const KIND_ICON = { video: Play, image: ImageIcon, audio: AudioLines } as const;
const ASPECT = { "16:9": "aspect-video", "9:16": "aspect-[9/16]", "1:1": "aspect-square" } as const;

export function LibraryScreen({ initialItems, mediaActions, search, remove, onOpenInStudio, onUseInChat, onRunAction }: LibraryScreenProps) {
  const account = useAccount();
  // In a workspace the library is everyone's there, and the words say so.
  const workspace = account?.kind === "workspace" ? account.name : null;
  const [items, setItems] = useState(initialItems);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<MediaKind | "all">("all");
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<MediaItem | null>(null);
  const [confirming, setConfirming] = useState(false);
  const first = useRef(true);
  const searchRef = useRef(search);
  searchRef.current = search;

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const next = await searchRef.current({ query, ...(kind === "all" ? {} : { kind }) });
        if (!cancelled) {
          setItems(next);
          setFailed(false);
        }
      } catch {
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 220);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, kind]);

  const close = () => {
    setSelected(null);
    setConfirming(false);
  };
  const filtered = query.trim() !== "" || kind !== "all";

  return (
    <Page title="Library" description="Everything you've made or uploaded. Search by what's in it, not just what it's called." width="wide">
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[240px] flex-1 sm:max-w-[420px]">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-subtle-foreground" aria-hidden />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="A runner at night, neon, harbour…"
            aria-label="Search your library by content"
            className="rounded-full pl-10"
          />
        </div>
        <div className="flex gap-1.5" role="group" aria-label="Media type">
          {KINDS.map((entry) => (
            <Chip key={entry.value} selected={kind === entry.value} aria-pressed={kind === entry.value} onClick={() => setKind(entry.value)}>
              {entry.label}
            </Chip>
          ))}
        </div>
      </div>

      {failed ? (
        <EmptyState icon={FolderOpen} title="The library didn't load" body="Check your connection and try the search again." action={<Button onClick={() => setQuery((value) => `${value} `.trimStart())}>Try again</Button>} />
      ) : items.length === 0 ? (
        filtered ? (
          <EmptyState icon={Search} title="Nothing matches" body="Try describing what's on screen: a place, an action, a colour, a time of day." />
        ) : (
          <EmptyState
            icon={FolderOpen}
            title={workspace ? `${workspace}'s library is empty` : "Your library is empty"}
            body={workspace ? "Shots anyone here generates in chat or the studio are saved here for everyone in the workspace, along with anything uploaded." : "Shots you generate in chat or the studio are saved here, along with anything you upload."}
          />
        )
      ) : (
        <ul className={cn("columns-2 gap-3 transition-opacity duration-200 md:columns-3 xl:columns-4 [&>li]:mb-3", loading && "opacity-60")}>
          {items.map((item) => {
            const Icon = KIND_ICON[item.kind];
            return (
              <li key={item.id} className="break-inside-avoid">
                <button
                  type="button"
                  onClick={() => setSelected(item)}
                  className={cn("group relative block w-full overflow-hidden rounded-media text-left ring-1 ring-hairline transition-transform duration-300 ease-out-expo active:scale-[0.985]", item.kind === "audio" ? "aspect-[16/7]" : ASPECT[item.aspect])}
                >
                  <MediaStill image={item.image} artwork={item.artwork} still />
                  <span className="absolute left-2.5 top-2.5 inline-flex h-6 items-center gap-1 rounded-full bg-black/45 px-2 font-mono text-[11px] text-white backdrop-blur-md">
                    <Icon className="size-3" aria-hidden />
                    {item.duration_seconds ? `${item.duration_seconds}s` : item.kind}
                  </span>
                  <span className="absolute inset-x-0 bottom-0 p-3 text-body font-medium leading-5 text-white">{item.title}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <Sheet open={selected !== null} onOpenChange={(open) => !open && close()} title={selected?.title ?? ""}>
        {selected ? (
          <div className="flex flex-col gap-4">
            <div className={cn("relative w-full overflow-hidden rounded-media ring-1 ring-hairline", selected.kind === "audio" ? "aspect-[16/7]" : "aspect-video")}>
              <MediaStill image={selected.image} artwork={selected.artwork} eager />
            </div>
            <div>
              <p className="text-caption font-medium text-subtle-foreground">What's in it</p>
              <p className="mt-1 text-body text-foreground">{selected.description}</p>
              {selected.tags.length > 0 ? (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {selected.tags.map((tag) => (
                    <Badge key={tag}>{tag}</Badge>
                  ))}
                </div>
              ) : null}
              {selected.made_by ? <p className="mt-2.5 text-caption text-muted-foreground">{selected.source === "upload" ? "Added" : "Made"} by {selected.made_by}</p> : null}
            </div>
            {confirming ? (
              <div className="flex flex-col gap-3">
                <p className="text-body text-foreground">{workspace ? `Delete this from ${workspace}'s library? It goes for everyone, and can't be brought back.` : "Delete this from your library? It can't be brought back."}</p>
                <div className="flex gap-2">
                  <Button className="flex-1" onClick={() => setConfirming(false)}>Keep it</Button>
                  <Button
                    variant="destructive" className="flex-1"
                    onClick={async () => {
                      if (await remove(selected.id)) setItems((current) => current.filter((item) => item.id !== selected.id));
                      close();
                    }}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap gap-2">
                  <Button variant="primary" onClick={() => onOpenInStudio(selected)}><Clapperboard />Open in studio</Button>
                  <Button onClick={() => onUseInChat(selected)}><MessageCircle />Ask about it</Button>
                  <Button variant="ghost" size="icon" aria-label="Delete" onClick={() => setConfirming(true)}><Trash2 /></Button>
                </div>
                {mediaActions.length > 0 && selected.kind !== "image" ? (
                  <div>
                    <p className="mb-2 text-caption font-medium text-subtle-foreground">Convert or export</p>
                    <div className="flex flex-wrap gap-1.5">
                      {mediaActions.map((action) => (
                        <Chip key={action.app} onClick={() => onRunAction(selected, action.app)} title={action.app}>
                          <Wrench aria-hidden />
                          {offeringLabel(action.app)}
                        </Chip>
                      ))}
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </div>
        ) : null}
      </Sheet>
    </Page>
  );
}
