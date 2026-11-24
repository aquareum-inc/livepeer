import { UPLOAD_RULES } from "@livepeer/api-client";
import { NextResponse, type NextRequest } from "next/server";

import { instance } from "@/lib/instance";
import { authenticate, type Caller } from "@/lib/public-api/auth";
import { requestOrigin } from "@/lib/public-api/instance";
import { ApiError, uploadError } from "@/lib/public-api/operations";

export const dynamic = "force-dynamic";

const error = (status: number, message: string, code?: string) => NextResponse.json({ error: { status, message, ...(code ? { code } : {}) } }, { status });

/** The largest file any ticket allows, so an oversized body is refused before it is read. */
const LARGEST = Math.max(UPLOAD_RULES.image.maxBytes, UPLOAD_RULES.video.maxBytes);

/**
 * Takes the file a `request_upload` ticket was given for and answers with the library item. The body is
 * the file itself, so this sits beside the JSON operations rather than among them. Only a signed-in person
 * may send one: a browser session, the app's device session, or an API key while the API is offered.
 */
export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  let caller: Caller | null;
  try {
    caller = await authenticate(request);
  } catch (cause) {
    if (cause instanceof ApiError) return error(cause.status, cause.message, cause.code);
    throw cause;
  }
  if (!caller) return error(401, "Sign in to add to your library.", "signed_out");
  if (caller.via === "operator_device" || caller.via === "operator_token") return error(403, "The console's session can't do this. Use the app itself.", "operator_session");
  if (caller.via === "api_key" && !(await instance()).surfaces.api) return error(404, "Not found");
  // A browser sends its session by cookie, so the file must come from this instance's own pages.
  if (caller.via === "browser" && request.headers.get("origin") !== requestOrigin(request)) return error(403, "Send the file from this site.");

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > LARGEST) return error(413, UPLOAD_RULES.video.say, "too_large");

  try {
    const bytes = new Uint8Array(await request.arrayBuffer());
    const item = (await caller.client.receiveUpload((await context.params).id, bytes)).data;
    return item ? NextResponse.json(item) : error(404, "That upload wasn't asked for, or it took too long. Choose the file again.", "upload_expired");
  } catch (cause) {
    const refused = uploadError(cause);
    if (refused instanceof ApiError) return error(refused.status, refused.message, refused.code);
    return error(500, "The file didn't arrive. Try again.");
  }
}
