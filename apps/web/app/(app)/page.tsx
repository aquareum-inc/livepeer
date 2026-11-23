import { DataSourceBadge } from "@livepeer/user-app";

import { Home } from "@/components/home";
import { api } from "@/lib/api";
import { getSession } from "@/lib/auth/session";
import { composerOfferings } from "@/lib/catalogue";
import { adultContent, charactersEnabled } from "@/lib/content";
import { isDev } from "@/lib/env";
import { instance } from "@/lib/instance";
import { moderation } from "@/lib/moderation";

type Props = { searchParams: Promise<{ with?: string | string[] }> };

export default async function HomePage({ searchParams }: Props) {
  const client = await api();
  const session = await getSession();
  const { home } = instance();
  const characters = charactersEnabled();
  // `?with=<slug>` arrives from a character's page and puts them in the composer.
  const slug = (await searchParams).with;
  const [starters, offerings, agentModels, character] = await Promise.all([
    client.listPromptStarters(),
    client.listOfferings(),
    client.listAgentModels(),
    characters && typeof slug === "string" ? client.getCharacter(slug) : null,
  ]);
  const offered = composerOfferings(offerings.data);
  const found = character?.data ?? null;
  const cast = found && (!found.mature || (await adultContent(client)).shown) && moderation().visible(session?.userId ?? null)(found) ? { slug: found.slug, name: found.name, image: found.image } : null;
  return (
    <>
      <Home starters={starters.data} offerings={offered} agentModels={agentModels.data} signedIn={session !== null} characters={characters} cast={cast} backdrop={{ video: home?.backgroundVideo ?? null, poster: home?.backgroundPoster ?? null, image: home?.backgroundImage ?? null, aurora: home?.aurora ?? false }} />
      {isDev ? (
        <DataSourceBadge
          sources={[
            { name: "listOfferings", source: offerings.source },
            { name: "listAgentModels", source: agentModels.source },
            { name: "listPromptStarters", source: starters.source },
            ...(character ? [{ name: "getCharacter", source: character.source }] : []),
          ]}
        />
      ) : null}
    </>
  );
}
