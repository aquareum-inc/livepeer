import { DataSourceBadge } from "@livepeer/user-app";
import type { Metadata } from "next";

import { Library } from "@/components/library";
import { api } from "@/lib/api";
import { getSession } from "@/lib/auth/session";
import { mediaActions } from "@/lib/catalogue";
import { developerTabs } from "@/lib/developers";
import { isDev } from "@/lib/env";
import { instance } from "@/lib/instance";

export const metadata: Metadata = { title: "Library" };

export default async function LibraryPage() {
  const client = await api();
  // A guest sees the library as it starts: empty. Uploading or searching asks them to sign in.
  const signedIn = (await getSession()) !== null;
  const [media, offerings] = await Promise.all([signedIn ? client.listMedia() : null, client.listOfferings()]);
  // Media tools run from their model page, which lives in the Developers section.
  const actions = developerTabs((await instance()).surfaces).includes("/developers/models") ? await mediaActions(offerings.data) : [];
  return (
    <>
      <Library items={media?.data ?? []} actions={actions} />
      {isDev ? <DataSourceBadge sources={[...(media ? [{ name: "listMedia", source: media.source }] : []), { name: "listOfferings", source: offerings.source }]} /> : null}
    </>
  );
}
