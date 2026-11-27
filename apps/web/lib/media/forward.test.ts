import http from "node:http";
import type { AddressInfo } from "node:net";

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { forwardToStorage } from "./forward";
import { storage, storageBehindApp } from "./storage";

/** A stand-in for a storage service on a private network: it records what reached it. */
const seen: Array<{ method: string; url: string; headers: http.IncomingHttpHeaders; body: Buffer }> = [];
let answer: { status: number; headers?: Record<string, string>; body?: string } = { status: 200 };
const server = http.createServer((request, response) => {
  const parts: Buffer[] = [];
  request.on("data", (part: Buffer) => parts.push(part));
  request.on("end", () => {
    seen.push({ method: request.method ?? "", url: request.url ?? "", headers: request.headers, body: Buffer.concat(parts) });
    response.writeHead(answer.status, answer.headers);
    response.end(answer.body ?? "");
  });
});
let endpoint = "";
beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise((resolve) => server.close(resolve)));
afterEach(() => {
  seen.length = 0;
  answer = { status: 200 };
  vi.unstubAllEnvs();
});

const never = new AbortController().signal;

describe("passing a signed request on to storage clients can't reach", () => {
  it("sends the file on as it came, with the length that was signed, and nothing of the caller's", async () => {
    const file = new Uint8Array(300_000).fill(7);
    const response = await forwardToStorage(new URL(`${endpoint}/media/uploads/upl_1?X-Amz-Signature=abc`), {
      method: "PUT",
      headers: new Headers({ "content-type": "video/mp4", "content-length": String(file.byteLength), cookie: "aq_session=secret", authorization: "Bearer secret" }),
      body: new Blob([file]).stream() as ReadableStream<Uint8Array>,
      signal: never,
    });
    expect(response.status).toBe(200);
    expect(seen[0]).toMatchObject({ method: "PUT", url: "/media/uploads/upl_1?X-Amz-Signature=abc" });
    expect(seen[0]?.headers["content-length"]).toBe("300000");
    expect(seen[0]?.headers["content-type"]).toBe("video/mp4");
    expect(seen[0]?.headers["transfer-encoding"]).toBeUndefined();
    expect(seen[0]?.headers.cookie ?? seen[0]?.headers.authorization).toBeUndefined();
    expect(seen[0]?.body.byteLength).toBe(300_000);
  });

  it("gives back a file, or part of one, and only the status of a refusal", async () => {
    answer = { status: 206, headers: { "content-type": "video/mp4", "content-range": "bytes 0-3/10", "set-cookie": "a=b" }, body: "abcd" };
    const part = await forwardToStorage(new URL(`${endpoint}/media/uploads/upl_1`), { method: "GET", headers: new Headers({ range: "bytes=0-3" }), body: null, signal: never });
    expect(part.status).toBe(206);
    expect(seen[0]?.headers.range).toBe("bytes=0-3");
    expect(part.headers.get("content-range")).toBe("bytes 0-3/10");
    expect(part.headers.get("set-cookie")).toBeNull();
    expect(await part.text()).toBe("abcd");

    answer = { status: 403, headers: { "content-type": "application/xml" }, body: "<Error><Code>AccessDenied</Code></Error>" };
    const refused = await forwardToStorage(new URL(`${endpoint}/media/uploads/upl_1`), { method: "GET", headers: new Headers(), body: null, signal: never });
    expect(refused.status).toBe(403);
    expect(await refused.text()).toBe("");
  });

  it("fails when storage isn't there, for the route to answer", async () => {
    await expect(forwardToStorage(new URL("http://127.0.0.1:9/media/x"), { method: "GET", headers: new Headers(), body: null, signal: never })).rejects.toBeInstanceOf(Error);
  });
});

describe("where files go when storage is on a private network", () => {
  const through = () => {
    vi.stubEnv("S3_BUCKET", "media");
    vi.stubEnv("S3_ENDPOINT", "http://storage:3900");
    vi.stubEnv("S3_ACCESS_KEY_ID", "GKexample");
    vi.stubEnv("S3_SECRET_ACCESS_KEY", "secret-for-this-test-only");
    vi.stubEnv("S3_PUBLIC_ENDPOINT", "app");
  };

  it("hands out addresses on this instance, signed for storage as the server reaches it", async () => {
    through();
    const leave = await storage().signPut("uploads/upl_1", { contentType: "image/png", contentLength: 12, expiresInSeconds: 900 });
    expect(leave.url.startsWith("/api/storage/media/uploads/upl_1?X-Amz-Algorithm=")).toBe(true);
    expect(leave.url).not.toContain("storage:3900");
    expect(storageBehindApp(leave.url)?.href).toBe(`http://storage:3900${leave.url.slice("/api/storage".length)}`);
    expect((await storage().signGet("uploads/upl_1", { expiresInSeconds: 300 })).startsWith("/api/storage/media/uploads/upl_1?")).toBe(true);
  });

  it("passes on to storage and nowhere else", () => {
    through();
    expect(storageBehindApp("/api/storage//example.com/x")).toBeNull();
    expect(storageBehindApp("/api/other/media/x")).toBeNull();
    vi.stubEnv("S3_PUBLIC_ENDPOINT", "https://media.example.com");
    expect(storageBehindApp("/api/storage/media/uploads/upl_1")).toBeNull();
  });
});
