import { createHash, createHmac } from "node:crypto";

/** What a signed address is made from. */
export interface PresignInput {
  method: "GET" | "PUT" | "HEAD" | "DELETE";
  /** The object's address, with no query. */
  url: URL;
  /** Headers the request must carry with exactly these values, besides `host`. */
  headers?: Record<string, string>;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  expiresInSeconds: number;
  now: Date;
}

const hmac = (key: string | Buffer, text: string): Buffer => createHmac("sha256", key).update(text).digest();
const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");

/** RFC 3986 encoding as Signature Version 4 wants it: everything but unreserved characters. */
const encode = (text: string): string => encodeURIComponent(text).replace(/[!'()*]/g, (letter) => `%${letter.charCodeAt(0).toString(16).toUpperCase()}`);

/**
 * A presigned address for one S3 request (AWS Signature Version 4, query-string form, payload unsigned).
 * Every S3-compatible service checks the same signature, which is why this is all the instance needs to
 * know about any of them. The steps and names follow AWS's description of the algorithm.
 */
export function presign(input: PresignInput): string {
  const stamp = input.now.toISOString().replace(/[-:]|\.\d{3}/g, "");
  const day = stamp.slice(0, 8);
  const scope = `${day}/${input.region}/s3/aws4_request`;
  const headers = Object.entries({ ...input.headers, host: input.url.host })
    .map(([name, value]): [string, string] => [name.toLowerCase(), value.trim().replace(/\s+/g, " ")])
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const signedHeaders = headers.map(([name]) => name).join(";");

  const query: Array<[string, string]> = [
    ["X-Amz-Algorithm", "AWS4-HMAC-SHA256"],
    ["X-Amz-Credential", `${input.accessKeyId}/${scope}`],
    ["X-Amz-Date", stamp],
    ["X-Amz-Expires", String(input.expiresInSeconds)],
    ["X-Amz-SignedHeaders", signedHeaders],
  ];
  const canonicalQuery = query.map(([name, value]) => `${encode(name)}=${encode(value)}`).join("&");
  // S3 encodes each part of the path once, and keeps the slashes.
  const canonicalPath = input.url.pathname.split("/").map((part) => encode(decodeURIComponent(part))).join("/");
  const canonicalRequest = [input.method, canonicalPath, canonicalQuery, ...headers.map(([name, value]) => `${name}:${value}`), "", signedHeaders, "UNSIGNED-PAYLOAD"].join("\n");
  const toSign = ["AWS4-HMAC-SHA256", stamp, scope, sha256(canonicalRequest)].join("\n");
  const key = hmac(hmac(hmac(hmac(`AWS4${input.secretAccessKey}`, day), input.region), "s3"), "aws4_request");
  const signature = createHmac("sha256", key).update(toSign).digest("hex");
  return `${input.url.origin}${canonicalPath}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}
