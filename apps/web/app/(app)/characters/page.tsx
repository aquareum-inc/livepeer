import { CharactersScreen, DataSourceBadge } from "@livepeer/user-app";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { api } from "@/lib/api";
import { getSession } from "@/lib/auth/session";
import { adultContent, charactersEnabled } from "@/lib/content";
import { isDev } from "@/lib/env";
import { moderation } from "@/lib/moderation";

export const metadata: Metadata = { title: "Characters" };

export default async function CharactersPage() {
  if (!await charactersEnabled()) notFound();
  const client = await api();
  const session = await getSession();
  const signedIn = session !== null;
  const visible = await moderation().visible(session?.userId ?? null);
  const { shown } = await adultContent(client);
  const [mine, shared] = await Promise.all([
    client.listCharacters({ scope: "mine", includeMature: shown }),
    client.listCharacters({ scope: "public", includeMature: shown }),
  ]);
  return (
    <>
      {/* A guest has no characters of their own; they see the public ones. */}
      <CharactersScreen mine={signedIn ? mine.data.filter(visible) : []} publicCharacters={shared.data.filter((entry) => visible(entry) && (!signedIn || !entry.mine))} />
      {isDev ? <DataSourceBadge sources={[{ name: "listCharacters", source: mine.source }]} /> : null}
    </>
  );
}
