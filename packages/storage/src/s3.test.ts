import { describe, expect, it, vi } from "vitest";

import { s3Storage } from "./s3";

const key = { bucket: "media", accessKeyId: "AKIDEXAMPLE", secretAccessKey: "secret-for-this-test-only", now: () => new Date("2026-11-27T12:00:00Z") };

describe("the S3 driver", () => {
  it("signs for the address clients reach, and asks its own questions at the one the server reaches", async () => {
    const ask = vi.fn(async () => new Response(null, { status: 200, headers: { "content-length": "2048", "content-type": "image/png; charset=binary" } }));
    const storage = s3Storage({ ...key, endpoint: "http://storage:9000", publicEndpoint: "https://media.example.com", fetch: ask as unknown as typeof fetch });

    const leave = await storage.signPut("uploads/upl_1", { contentType: "image/png", contentLength: 2048, expiresInSeconds: 900 });
    const put = new URL(leave.url);
    expect(`${put.origin}${put.pathname}`).toBe("https://media.example.com/media/uploads/upl_1");
    expect(put.searchParams.get("X-Amz-SignedHeaders")).toBe("content-length;content-type;host");
    expect(put.searchParams.get("X-Amz-Expires")).toBe("900");
    expect(leave.headers).toEqual({ "Content-Type": "image/png" });
    expect(new URL(await storage.signGet("uploads/upl_1", { expiresInSeconds: 300 })).searchParams.get("X-Amz-SignedHeaders")).toBe("host");

    expect(await storage.head("uploads/upl_1")).toEqual({ size: 2048, contentType: "image/png" });
    const [asked, how] = ask.mock.calls[0] as unknown as [string, RequestInit];
    expect(asked.startsWith("http://storage:9000/media/uploads/upl_1?")).toBe(true);
    expect(how.method).toBe("HEAD");
    expect(leave.url + asked).not.toContain(key.secretAccessKey);
  });

  it("puts the bucket in the host name on AWS, and in the path anywhere else unless told", async () => {
    const aws = s3Storage({ ...key, region: "eu-west-1" });
    expect(new URL(await aws.signGet("uploads/a", { expiresInSeconds: 60 })).host).toBe("media.s3.eu-west-1.amazonaws.com");
    const r2 = s3Storage({ ...key, region: "auto", endpoint: "https://account.r2.cloudflarestorage.com" });
    expect(new URL(await r2.signGet("uploads/a", { expiresInSeconds: 60 })).pathname).toBe("/media/uploads/a");
    const hosted = s3Storage({ ...key, endpoint: "https://s3.example.net", forcePathStyle: false });
    expect(new URL(await hosted.signGet("uploads/a", { expiresInSeconds: 60 })).host).toBe("media.s3.example.net");
  });

  it("tells nothing there from storage being wrong", async () => {
    const answers = [404, 500, 204, 404, 403];
    const storage = s3Storage({ ...key, endpoint: "http://storage:9000", fetch: (async () => new Response(null, { status: answers.shift() ?? 200 })) as typeof fetch });
    expect(await storage.head("uploads/missing")).toBeNull();
    await expect(storage.head("uploads/broken")).rejects.toMatchObject({ name: "StorageUnavailable" });
    await storage.remove("uploads/there");
    await storage.remove("uploads/gone");
    await expect(storage.remove("uploads/refused")).rejects.toMatchObject({ name: "StorageUnavailable" });
  });

  it("says why storage can't be used, in words for an operator", async () => {
    const answering = (status: number) => s3Storage({ ...key, endpoint: "http://storage:9000", fetch: (async () => new Response(null, { status })) as typeof fetch });
    expect(await answering(200).check()).toBe("ok");
    expect(await answering(404).check()).toBe("the bucket media doesn't exist");
    expect(await answering(403).check()).toMatch(/refused/);
    const down = s3Storage({ ...key, endpoint: "http://storage:9000", fetch: (async () => { throw new TypeError("fetch failed"); }) as typeof fetch });
    expect(await down.check()).toBe("storage can't be reached");
    await expect(down.head("uploads/a")).rejects.toMatchObject({ name: "StorageUnavailable" });
  });
});

/**
 * The same driver against a real S3-compatible server, when one is named: S3_TEST_ENDPOINT, S3_TEST_BUCKET,
 * S3_TEST_ACCESS_KEY_ID and S3_TEST_SECRET_ACCESS_KEY (and S3_TEST_REGION). Skipped otherwise, so `pnpm test`
 * needs nothing running.
 */
const live = process.env.S3_TEST_ENDPOINT && process.env.S3_TEST_BUCKET && process.env.S3_TEST_ACCESS_KEY_ID && process.env.S3_TEST_SECRET_ACCESS_KEY;
describe.skipIf(!live)("the S3 driver against a real server", () => {
  const storage = s3Storage({ bucket: process.env.S3_TEST_BUCKET ?? "", accessKeyId: process.env.S3_TEST_ACCESS_KEY_ID ?? "", secretAccessKey: process.env.S3_TEST_SECRET_ACCESS_KEY ?? "", endpoint: process.env.S3_TEST_ENDPOINT ?? "", ...(process.env.S3_TEST_REGION ? { region: process.env.S3_TEST_REGION } : {}) });
  const name = `uploads/test_${Date.now()}`;
  const file = new Uint8Array([137, 80, 78, 71, 1, 2, 3, 4]);

  it("reaches the bucket", async () => {
    expect(await storage.check()).toBe("ok");
  });

  it("takes exactly the file an address was signed for, and nothing else", async () => {
    const leave = await storage.signPut(name, { contentType: "image/png", contentLength: file.byteLength, expiresInSeconds: 300 });
    const longer = await fetch(leave.url, { method: "PUT", headers: leave.headers, body: new Uint8Array([...file, 9]) });
    expect(longer.ok).toBe(false);
    const wrongType = await fetch(leave.url, { method: "PUT", headers: { "Content-Type": "text/html" }, body: file });
    expect(wrongType.ok).toBe(false);
    expect(await storage.head(name)).toBeNull();

    expect((await fetch(leave.url, { method: "PUT", headers: leave.headers, body: file })).ok).toBe(true);
    expect(await storage.head(name)).toEqual({ size: file.byteLength, contentType: "image/png" });
  });

  it("serves it only at a signed address, then removes it", async () => {
    const address = await storage.signGet(name, { expiresInSeconds: 300 });
    const served = await fetch(address);
    expect([...new Uint8Array(await served.arrayBuffer())]).toEqual([...file]);
    expect((await fetch(address.split("?")[0] ?? "")).ok).toBe(false);
    await storage.remove(name);
    expect(await storage.head(name)).toBeNull();
    expect((await fetch(address)).ok).toBe(false);
  });
});
