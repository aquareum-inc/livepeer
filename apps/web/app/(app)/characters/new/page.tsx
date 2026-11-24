import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { NewCharacter } from "@/components/character";
import { api } from "@/lib/api";
import { adultContent, charactersEnabled } from "@/lib/content";

export const metadata: Metadata = { title: "New character" };

export default async function NewCharacterPage() {
  if (!await charactersEnabled()) notFound();
  const { shown } = await adultContent(await api());
  return <NewCharacter matureAllowed={shown} />;
}
