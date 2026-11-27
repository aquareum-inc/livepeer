import "server-only";

import path from "node:path";

import { diskStorage, s3Storage, type DiskStorage, type ObjectStorage } from "@livepeer/storage";

import { sessionSecret } from "../auth/secret";
import { env } from "../env";

/** The instance's route that takes and serves files when the instance keeps them on its own disk. */
export const DISK_ROUTE = "/api/storage";

const S3 = ["S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "S3_REGION", "S3_ENDPOINT", "S3_PUBLIC_ENDPOINT", "S3_FORCE_PATH_STYLE"] as const;

// One driver per process and configuration, shared by pages, routes and the alerts timer.
const held = globalThis as typeof globalThis & { livepeerStorage?: { made: string; storage: ObjectStorage }; livepeerStorageChecked?: { at: number; answer: Promise<"ok" | string> } };

/**
 * Where the instance keeps files. Object storage through the S3 API when S3_BUCKET names a bucket: Cloudflare
 * R2, AWS S3, Backblaze B2 or a server you run, all the same to the app. With none, the instance's own disk
 * in DATA_DIR, so development, tests and a first look need nothing installed. The credentials are read here,
 * on the server, and are never sent anywhere but to storage as a signature.
 */
export function storage(): ObjectStorage {
  const values = Object.fromEntries(S3.map((name) => [name, env(name)]));
  const secret = values.S3_BUCKET ? "" : sessionSecret();
  const made = JSON.stringify([values, env("DATA_DIR"), secret]);
  if (held.livepeerStorage?.made === made) return held.livepeerStorage.storage;

  const pathStyle = values.S3_FORCE_PATH_STYLE;
  const built = values.S3_BUCKET
    ? s3Storage({
        bucket: values.S3_BUCKET,
        accessKeyId: values.S3_ACCESS_KEY_ID ?? "",
        secretAccessKey: values.S3_SECRET_ACCESS_KEY ?? "",
        ...(values.S3_REGION ? { region: values.S3_REGION } : {}),
        ...(values.S3_ENDPOINT ? { endpoint: values.S3_ENDPOINT } : {}),
        ...(values.S3_PUBLIC_ENDPOINT ? { publicEndpoint: values.S3_PUBLIC_ENDPOINT } : {}),
        ...(pathStyle === "true" || pathStyle === "false" ? { forcePathStyle: pathStyle === "true" } : {}),
      })
    : diskStorage({ dir: path.resolve(/* turbopackIgnore: true */ process.cwd(), "../..", env("DATA_DIR") || ".data", "media"), secret, basePath: DISK_ROUTE });
  held.livepeerStorage = { made, storage: built };
  delete held.livepeerStorageChecked;
  return built;
}

/** The disk driver, when that is what the instance uses. Null with object storage, and its route then serves nothing. */
export function diskInUse(): DiskStorage | null {
  const current = storage();
  return current.kind === "disk" ? (current as DiskStorage) : null;
}

/** How long one answer about storage is trusted, so a health check every few seconds isn't a request to storage each time. */
const CHECK_MS = 30_000;

/** Which storage the instance uses and whether it can be used, for the health check, `doctor` and the System page. */
export async function storageStatus(): Promise<{ kind: ObjectStorage["kind"]; status: "ok" | "unavailable"; detail: string }> {
  const current = storage();
  if (!held.livepeerStorageChecked || Date.now() - held.livepeerStorageChecked.at > CHECK_MS) held.livepeerStorageChecked = { at: Date.now(), answer: current.check() };
  const answer = await held.livepeerStorageChecked.answer;
  return { kind: current.kind, status: answer === "ok" ? "ok" : "unavailable", detail: answer };
}
