import "server-only";

import http from "node:http";
import https from "node:https";
import { Readable } from "node:stream";
import type { ReadableStream as NodeWebStream } from "node:stream/web";

/** What is sent on to storage with a file, and what is sent back with one. Nothing else crosses. */
const SENT = ["content-type", "content-length", "range"];
const RETURNED = ["content-type", "content-length", "content-range", "accept-ranges", "etag", "last-modified"];

/**
 * Passes one signed request on to a storage service that clients can't reach themselves, and its answer
 * back: the Compose bundle, where storage has no address outside the Docker network. Storage checks the
 * signature exactly as if the client had called it, so this adds no permission of its own. The file is
 * piped through as it arrives, never held; the length the client declared is sent on unchanged, since the
 * signature covers it.
 */
export function forwardToStorage(target: URL, request: { method: "GET" | "PUT"; headers: Headers; body: ReadableStream<Uint8Array> | null; signal: AbortSignal }): Promise<Response> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {};
    for (const name of SENT) {
      const value = request.headers.get(name);
      if (value !== null) headers[name] = value;
    }
    const outgoing = (target.protocol === "https:" ? https : http).request(target, { method: request.method, headers, signal: request.signal }, (answer) => {
      const returned = new Headers({ "Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff" });
      for (const name of RETURNED) {
        const value = answer.headers[name];
        if (typeof value === "string") returned.set(name, value);
      }
      const status = answer.statusCode ?? 502;
      // A file comes back as storage sends it. Anything else comes back as its status alone: storage's own
      // words about a refusal are for the operator's logs, not for a client.
      if (request.method === "GET" && (status === 200 || status === 206)) return resolve(new Response(Readable.toWeb(answer) as unknown as ReadableStream<Uint8Array>, { status, headers: returned }));
      answer.resume();
      resolve(new Response(null, { status: status === 204 ? 200 : status }));
    });
    outgoing.on("error", reject);
    if (request.method === "PUT" && request.body) Readable.fromWeb(request.body as unknown as NodeWebStream<Uint8Array>).on("error", (cause) => outgoing.destroy(cause)).pipe(outgoing);
    else outgoing.end();
  });
}
