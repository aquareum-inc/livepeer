import { createHash } from "node:crypto";

import { EngineError, NotOffered, UnsupportedByProvider } from "@livepeer/api-client";
import { NextResponse, type NextRequest } from "next/server";

import { instance } from "@/lib/instance";
import { authenticate, carriesDeviceToken, guest, requestContext, type Caller } from "@/lib/public-api/auth";
import { runOperation } from "@/lib/public-api/dispatch";
import { ApiError, matchOperation } from "@/lib/public-api/operations";

export const dynamic = "force-dynamic";

const error = (status: number, message: string, code?: string) => NextResponse.json({ error: { status, message, ...(code ? { code } : {}) } }, { status });

/**
 * A read, with an ETag. A client following work in progress sends it back as If-None-Match and, while
 * nothing has changed, gets 304 with no body. `no-cache` means "check every time", not "don't keep".
 */
function read(request: NextRequest, value: unknown) {
  const body = JSON.stringify(value);
  const etag = `W/"${createHash("sha1").update(body).digest("base64url")}"`;
  const headers = { ETag: etag, "Cache-Control": "private, no-cache", Vary: "Authorization, Cookie" };
  if (request.headers.get("if-none-match") === etag) return new NextResponse(null, { status: 304, headers });
  return new NextResponse(body, { status: 200, headers: { ...headers, "Content-Type": "application/json" } });
}

/** The instance's REST API: one route per operation in the registry. */
async function handle(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const match = matchOperation(request.method, (await context.params).path);
  const bearer = request.headers.has("authorization");
  // With the API surface off, the instance still answers its native apps: their device sessions, and what
  // a guest can see before signing in.
  if (!instance().surfaces.api && !(carriesDeviceToken(request) || (!bearer && match?.operation.public))) return error(404, "Not found");

  let caller: Caller | null;
  try {
    caller = await authenticate(request);
  } catch (cause) {
    if (cause instanceof ApiError) return error(cause.status, cause.message, cause.code);
    throw cause;
  }
  // A guest can call what a guest can see on the web; it runs as the instance's default account.
  caller ??= match?.operation.public && !bearer ? guest() : null;
  if (!caller) return error(401, bearer ? "That token isn't valid, or it has been revoked." : "Send an API key as a bearer token: Authorization: Bearer <key>", "signed_out");
  if (!match) return error(404, "No such operation. GET /api/v1 lists them.");

  let body: Record<string, unknown> = {};
  if (request.method !== "GET" && request.method !== "DELETE") {
    try {
      const text = await request.text();
      body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      return error(400, "The request body isn't valid JSON.");
    }
  }
  // A phone's changes are signed over the body it sends, so nothing in the address may add to or alter it.
  const query = request.method === "GET" || request.method === "DELETE" || caller.via !== "operator_device" ? Object.fromEntries(request.nextUrl.searchParams) : {};
  const input = { ...query, ...body, ...match.params };

  const schema = match.operation.input as { required?: string[] };
  const missing = (schema.required ?? []).filter((key) => input[key] === undefined || input[key] === "");
  if (missing.length > 0) return error(400, `Missing: ${missing.join(", ")}`);

  try {
    const value = await runOperation(match.operation, requestContext(request, caller), input, request.headers.get("x-operator-proof"));
    return request.method === "GET" ? read(request, value) : NextResponse.json(value);
  } catch (cause) {
    if (cause instanceof ApiError) return error(cause.status, cause.message, cause.code);
    if (cause instanceof NotOffered) return error(403, cause.message, "not_offered");
    if (cause instanceof UnsupportedByProvider) return error(501, cause.message);
    if (cause instanceof EngineError) return error(cause.status === 401 || cause.status === 403 ? 502 : cause.status, "The engine refused or failed this request.");
    return error(500, cause instanceof Error ? cause.message : "The request failed.");
  }
}

export { handle as DELETE, handle as GET, handle as PATCH, handle as POST, handle as PUT };
