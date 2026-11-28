import "server-only";

import path from "node:path";

import { diskStorage, s3Storage, type DiskStorage, type ObjectStorage } from "@livepeer/storage";

import { sessionSecret } from "../auth/secret";
import { env } from "../env";

/**
 * The instance's route that files pass through when clients can't be sent to storage directly: when the
 * instance keeps them on its own disk, and when storage is on a private network (THROUGH_APP).
 */
export const DISK_ROUTE = "/api/storage";

/**
 * What S3_PUBLIC_ENDPOINT is set to when browsers and phones can't reach storage at all, as in the Compose
 * bundle, where it has no address outside the Docker network. Signed addresses then lead to this instance,
 * which passes each request on to storage unchanged.
 */
const THROUGH_APP = "app";

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
  const throughApp = values.S3_PUBLIC_ENDPOINT === THROUGH_APP;
  const s3 = values.S3_BUCKET
    ? s3Storage({
        bucket: values.S3_BUCKET,
        accessKeyId: values.S3_ACCESS_KEY_ID ?? "",
        secretAccessKey: values.S3_SECRET_ACCESS_KEY ?? "",
        ...(values.S3_REGION ? { region: values.S3_REGION } : {}),
        ...(values.S3_ENDPOINT ? { endpoint: values.S3_ENDPOINT } : {}),
        ...(values.S3_PUBLIC_ENDPOINT && !throughApp ? { publicEndpoint: values.S3_PUBLIC_ENDPOINT } : {}),
        ...(pathStyle === "true" || pathStyle === "false" ? { forcePathStyle: pathStyle === "true" } : {}),
      })
    : null;
  /** An address signed for storage as the server reaches it, as an address on this instance. */
  const here = (address: string): string => {
    const url = new URL(address);
    return `${DISK_ROUTE}${url.pathname}${url.search}`;
  };
  const built: ObjectStorage = s3
    ? throughApp
      ? {
          ...s3,
          signPut: async (key, options) => {
            const leave = await s3.signPut(key, options);
            return { ...leave, url: here(leave.url) };
          },
          signGet: async (key, options) => here(await s3.signGet(key, options)),
        }
      : s3
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

/**
 * Where a request to this instance's route is passed on to, when files pass through the app to a storage
 * service on a private network. Null otherwise. The path and query are the signed address's own.
 */
export function storageBehindApp(pathAndQuery: string): URL | null {
  const endpoint = env("S3_ENDPOINT");
  if (!env("S3_BUCKET") || env("S3_PUBLIC_ENDPOINT") !== THROUGH_APP || !endpoint || !pathAndQuery.startsWith(`${DISK_ROUTE}/`)) return null;
  const target = new URL(endpoint);
  const onward = new URL(pathAndQuery.slice(DISK_ROUTE.length), target);
  // Only ever storage itself: a path can't lead to another host.
  return onward.origin === target.origin ? onward : null;
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
