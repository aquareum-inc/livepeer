import { READ_SECONDS } from "@livepeer/api-client";
import { NextResponse, type NextRequest } from "next/server";

import { apiFor } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * A file in someone's library, by its id: the address a library item carries, which never changes. It
 * answers with a redirect to a short-lived signed address on storage, so the bucket stays private and no
 * bytes pass through the app. It sits under /api so it is served whichever surfaces are on and without the
 * page guard: the apps load it with no cookie. The id is long and random and is only ever given to the
 * person whose library it is in, so the address is the permission, as it is for the instance's other
 * pictures: an `<img>` on the web and an image view in the apps load it without a token.
 */
export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const url = (await (await apiFor(null)).getMediaUrl((await context.params).id)).data;
  if (!url) return new NextResponse(null, { status: 404 });
  // Remembered for a little less than the signed address lasts, so a cached redirect never leads to a refusal.
  return new NextResponse(null, { status: 302, headers: { Location: url, "Cache-Control": `private, max-age=${READ_SECONDS - 60}` } });
}
