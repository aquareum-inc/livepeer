import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CharacterCallView } from "@/components/character";
import { api } from "@/lib/api";
import { adultContent, charactersEnabled } from "@/lib/content";

export const metadata: Metadata = { title: "Call" };

export default async function CallPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ mode?: string }>;
}) {
  if (!await charactersEnabled()) notFound();
  const client = await api();
  const [{ slug }, { mode }] = await Promise.all([params, searchParams]);
  const character = await client.getCharacter(slug);
  if (!character.data?.calls) notFound();
  if (character.data.mature && !(await adultContent(client)).shown) notFound();
  return <CharacterCallView character={character.data} mode={mode === "video" ? "video" : "voice"} />;
}
