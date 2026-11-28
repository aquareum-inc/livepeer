import { presign } from "./sigv4";
import { StorageUnavailable, type ObjectStorage } from "./types";

export interface S3Config {
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** "auto" on Cloudflare R2; the bucket's region on AWS and Backblaze B2. */
  region?: string;
  /** The service's address as the instance's server reaches it. None means AWS. */
  endpoint?: string;
  /** The same service as browsers and phones reach it, when that differs. Signed addresses are made for this one. */
  publicEndpoint?: string;
  /** Bucket in the path, not the host name. The default with an endpoint, which every S3-compatible service accepts. */
  forcePathStyle?: boolean;
  fetch?: typeof fetch;
  now?: () => Date;
}

/** How long the server waits for storage to answer a question about one object. */
const ANSWER_MS = 10_000;
/** How long an address the server uses itself is good for. */
const OWN_SECONDS = 60;

/**
 * Any service that speaks the S3 API: Cloudflare R2, AWS S3, Backblaze B2, or a server you run. Nothing here
 * is particular to one of them. The server's own questions (what is under this key, remove it, is the bucket
 * there) are signed addresses it fetches itself, so there is one way of signing.
 */
export function s3Storage(config: S3Config): ObjectStorage {
  const region = config.region || "us-east-1";
  const now = config.now ?? (() => new Date());
  const ask = config.fetch ?? fetch;
  const pathStyle = config.forcePathStyle ?? Boolean(config.endpoint);
  const inside = config.endpoint || `https://s3.${region}.amazonaws.com`;
  const outside = config.publicEndpoint || inside;

  /** The address of an object, or of the bucket itself with no key, at one of the two endpoints. */
  const address = (endpoint: string, key: string): URL => {
    const url = new URL(endpoint);
    const base = url.pathname.replace(/\/+$/, "");
    const path = key.split("/").map(encodeURIComponent).join("/");
    if (pathStyle) url.pathname = `${base}/${config.bucket}${key ? `/${path}` : ""}`;
    else {
      url.hostname = `${config.bucket}.${url.hostname}`;
      url.pathname = `${base}/${path}`;
    }
    return url;
  };
  const sign = (method: "GET" | "PUT" | "HEAD" | "DELETE", url: URL, expiresInSeconds: number, headers?: Record<string, string>): string =>
    presign({ method, url, region, accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey, expiresInSeconds, now: now(), ...(headers ? { headers } : {}) });
  const own = async (method: "HEAD" | "DELETE", key: string): Promise<Response> => {
    try {
      return await ask(sign(method, address(inside, key), OWN_SECONDS), { method, signal: AbortSignal.timeout(ANSWER_MS), cache: "no-store" });
    } catch (cause) {
      throw new StorageUnavailable("Object storage can't be reached.", { cause });
    }
  };

  return {
    kind: "s3",
    async signPut(key, { contentType, contentLength, expiresInSeconds }) {
      const url = sign("PUT", address(outside, key), expiresInSeconds, { "content-type": contentType, "content-length": String(contentLength) });
      return { url, method: "PUT", headers: { "Content-Type": contentType } };
    },
    async signGet(key, { expiresInSeconds }) {
      return sign("GET", address(outside, key), expiresInSeconds);
    },
    async head(key) {
      const response = await own("HEAD", key);
      if (response.status === 404) return null;
      if (!response.ok) throw new StorageUnavailable(`Object storage answered ${response.status} when asked about a file.`);
      return { size: Number(response.headers.get("content-length") ?? 0), contentType: (response.headers.get("content-type") ?? "").split(";")[0]?.trim().toLowerCase() ?? "" };
    },
    async remove(key) {
      const response = await own("DELETE", key);
      if (!response.ok && response.status !== 404) throw new StorageUnavailable(`Object storage answered ${response.status} when asked to remove a file.`);
    },
    async check() {
      try {
        const response = await own("HEAD", "");
        if (response.ok) return "ok";
        if (response.status === 404) return `the bucket ${config.bucket} doesn't exist`;
        if (response.status === 403) return "the access key was refused, or may not use this bucket";
        return `storage answered ${response.status}`;
      } catch {
        return "storage can't be reached";
      }
    },
  };
}
