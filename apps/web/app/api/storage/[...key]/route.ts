import { NextResponse, type NextRequest } from "next/server";

import { forwardToStorage } from "@/lib/media/forward";
import { diskInUse, storageBehindApp } from "@/lib/media/storage";

export const dynamic = "force-dynamic";
/** A large video on a slow connection. */
export const maxDuration = 300;

type Params = { params: Promise<{ key: string[] }> };

/**
 * The instance standing in for a storage service, when it was given none and keeps files on its own disk
 * (development, tests, a first look, one machine with a volume). It keeps a storage service's contract: the
 * address is the permission, signed for one key, one method, one length and type, and a few minutes, so no
 * sign-in is read here. The file is streamed to disk, never held in memory.
 *
 * It is also the way in to a storage service clients can't reach themselves (the Compose bundle's, on its
 * private network): the request is passed on as it came and storage checks the signature. With object
 * storage that clients reach directly there is no such page: files go straight there.
 */
const onward = (request: NextRequest): URL | null => storageBehindApp(`${request.nextUrl.pathname}${request.nextUrl.search}`);
const unreachable = () => new NextResponse(null, { status: 502 });

export async function PUT(request: NextRequest, context: Params) {
  const target = onward(request);
  if (target) return forwardToStorage(target, { method: "PUT", headers: request.headers, body: request.body, signal: request.signal }).catch(unreachable);
  const disk = diskInUse();
  if (!disk) return new NextResponse(null, { status: 404 });
  const status = await disk.receive({ key: (await context.params).key.join("/"), query: request.nextUrl.searchParams, contentType: request.headers.get("content-type"), body: request.body });
  return new NextResponse(null, { status });
}

export async function GET(request: NextRequest, context: Params) {
  const target = onward(request);
  if (target) return forwardToStorage(target, { method: "GET", headers: request.headers, body: null, signal: request.signal }).catch(unreachable);
  const disk = diskInUse();
  const file = disk ? await disk.open((await context.params).key.join("/"), request.nextUrl.searchParams) : null;
  if (!file) return new NextResponse(null, { status: 404 });
  return new NextResponse(file.body, { headers: { "Content-Type": file.contentType, "Content-Length": String(file.size), "Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff" } });
}
