import { NextResponse, type NextRequest } from "next/server";

import { apiFor } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * A library item's still, by its id. It sits under /api so it is served whichever surfaces are on and
 * without the page guard: the apps load it with no cookie. The id is long and random and is only ever given to the person whose
 * library it is in, so the address is the permission, as it is for the instance's other pictures: an
 * `<img>` on the web and an image view in the apps load it without a token.
 */
export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const file = (await apiFor(null).readMediaFile((await context.params).id)).data;
  if (!file) return new NextResponse(null, { status: 404 });
  return new NextResponse(Buffer.from(file.bytes), {
    headers: { "Content-Type": file.content_type, "Cache-Control": "private, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" },
  });
}
