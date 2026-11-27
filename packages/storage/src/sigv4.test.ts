import { describe, expect, it } from "vitest";

import { presign } from "./sigv4";

describe("presigned S3 addresses", () => {
  // The worked example in AWS's "Authenticating Requests: Using Query Parameters (AWS Signature Version 4)".
  const example = { region: "us-east-1", accessKeyId: "AKIAIOSFODNN7EXAMPLE", secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY", now: new Date("2013-05-24T00:00:00Z") };

  it("signs AWS's own example to AWS's own answer", () => {
    const url = new URL(presign({ ...example, method: "GET", url: new URL("https://examplebucket.s3.amazonaws.com/test.txt"), expiresInSeconds: 86400 }));
    expect(url.searchParams.get("X-Amz-Signature")).toBe("aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404");
    expect(url.searchParams.get("X-Amz-Credential")).toBe("AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request");
    expect(url.searchParams.get("X-Amz-Date")).toBe("20130524T000000Z");
    expect(url.searchParams.get("X-Amz-SignedHeaders")).toBe("host");
  });

  it("signs the headers it is given, so a request with others is refused by storage", () => {
    const base = { ...example, method: "PUT" as const, url: new URL("https://storage.example/bucket/uploads/upl_1"), expiresInSeconds: 900 };
    const jpeg = new URL(presign({ ...base, headers: { "content-type": "image/jpeg", "content-length": "1024" } }));
    expect(jpeg.searchParams.get("X-Amz-SignedHeaders")).toBe("content-length;content-type;host");
    const longer = new URL(presign({ ...base, headers: { "content-type": "image/jpeg", "content-length": "1025" } }));
    expect(longer.searchParams.get("X-Amz-Signature")).not.toBe(jpeg.searchParams.get("X-Amz-Signature"));
  });

  it("never puts the secret in the address", () => {
    expect(presign({ ...example, method: "GET", url: new URL("https://examplebucket.s3.amazonaws.com/a b/ü.txt"), expiresInSeconds: 60 })).not.toContain(example.secretAccessKey);
  });
});
