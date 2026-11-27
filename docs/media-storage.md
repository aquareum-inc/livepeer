# Media storage: files go to object storage, not through the app

27 November 2026. The plan `docs/database.md` (D7, section 8.1 and 8.3) pointed to. Built in the slices of
section 11; what is not built or not verified is in section 12.

## 1. What was wrong

An upload was a ticket held in one process's memory, then a PUT of the whole file to
`/api/v1/uploads/{id}` on the instance, which read the body into memory. The newest 24 pictures were kept in
a `Map` and served from memory at `/api/media/{id}`; a video's bytes were dropped on arrival. So a file was
lost on restart, a second server could not see it, and a host that refuses large request bodies (Vercel, at
4.5 MB) could not take one at all.

## 2. Decisions

| # | Decision | Why |
| --- | --- | --- |
| M1 | **One interface, `ObjectStorage`, reached through the S3 API only** (`packages/storage`). Configured by environment variables. Nothing host-specific: no Vercel Blob, no provider SDK. | Cloudflare R2, AWS S3, Backblaze B2 and any S3-compatible server are then the same code path, and an operator moves between them by changing five values. |
| M2 | **The request signing is written here, with no dependency.** About 100 lines of Signature Version 4 over `node:crypto`, checked against the worked example in AWS's own documentation and against a real server. | The app needs four calls (signed PUT, signed GET, HEAD, DELETE). The AWS SDK is several megabytes to do that; a small file we can read is easier to trust and keeps the image small. |
| M3 | **Files go from the browser or phone straight to storage** with a signed PUT address that lasts 15 minutes. The app's server never receives the bytes. | The point of the work. It also removes the host's body limit from the question. |
| M4 | **A signed PUT, not a browser POST form.** The signature covers the file's exact length and media type. | PUT with a signed address works on every S3-compatible service; POST policies do not (Backblaze B2 has none). A PUT has no "at most N bytes" rule, so the length the client declared is signed instead: storage refuses any other. |
| M5 | **Two steps become three:** `request_upload` (a ticket), the PUT to storage, then `complete_upload`, where the server asks storage what arrived, checks it and adds it to the library. | Storage cannot tell the app a file has arrived in a way that works on every provider. The client can. The server still checks for itself. |
| M6 | **The bucket is private. A read is `/api/media/{id}` on the instance, which redirects to a signed GET address that lasts 5 minutes.** | A library item needs an address that does not expire; a signed address does. The redirect costs one small request and no bytes pass through the app. The id is 128 random bits given only to the library's owner, as before. |
| M7 | **A ticket and the record of each stored file are a row in Postgres** (`media_files`), not memory. | A ticket asked of one server has to be good on the next. The row is also how abandoned uploads are found and how a file is deleted with its library item. It holds the provider's opaque ids, never a name. |
| M8 | **With no storage configured, the app keeps files on its own disk in `DATA_DIR`,** behind the same interface and the same three steps. The "signed address" is then a route on the instance (`/api/storage/...`), signed with `SESSION_SECRET`, that streams to and from disk. | `pnpm dev`, tests and a first look still need nothing installed, and they run the code production runs. This is the same choice the database made (an embedded Postgres in `DATA_DIR`). |
| M9 | **`MOCK_ONLY=1` does not change where files are kept.** It still forces every engine and provider function to its mock. | Storage is infrastructure, like the database. A mock-only instance on the Compose bundle or on Vercel must take a large upload and find it on the next server, or the demo lies about the product. |
| M10 | **The uploaded part of the library is now real.** `listMedia` reads uploads from the media store and merges them with the mocked library. | Otherwise a file would outlive its only record at the first restart. The rest of the library stays mocked until generations are live (`docs/database.md` D8). |
| M11 | **Abandoned uploads are removed by the round that already runs every minute** (the server's timer, or `/api/cron/alerts` on a host with none), and a few at a time whenever a new upload is asked for. | No new moving part, and it works on a host with no scheduler at all. |

## 3. The interface

`packages/storage`:

```ts
interface ObjectStorage {
  kind: "s3" | "disk" | "memory";
  signPut(key, { contentType, contentLength, expiresInSeconds }): Promise<SignedUpload>; // { url, method, headers }
  signGet(key, { expiresInSeconds }): Promise<string>;
  head(key): Promise<{ size: number; contentType: string } | null>;
  remove(key): Promise<void>;
  check(): Promise<"ok" | string>; // for /api/health and `livepeer doctor`
}
```

Three drivers:

- **`s3Storage`**: any S3-compatible service. Path-style addresses when an endpoint is given (every
  provider and server accepts them), virtual-hosted on AWS with none. HEAD, DELETE and the health check are
  signed addresses the server fetches itself, so there is one signing path.
- **`diskStorage`**: files under `DATA_DIR/media`, each with a small file beside it recording its media
  type. It signs addresses under `/api/storage/` with an HMAC keyed by `SESSION_SECRET`, covering the
  method, key, length, type and expiry. The route streams the body to a temporary file, counts the bytes,
  stops at the signed length, and renames into place.
- **`memoryStorage`**: for unit tests only.

The media store (`createMediaStore` in `packages/api-client/src/media.ts`) holds the rules: what may be
sent, tickets, completion, listing, deletion, the sweep. It is given an `ObjectStorage` and an
`UploadRecords` (Postgres in the app, memory in the package's own tests), so the rules are tested once and
each driver is tested against one contract.

## 4. Configuration

| Variable | What it is |
| --- | --- |
| `S3_BUCKET` | The bucket. Setting it is what turns object storage on. |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | A key that can read, write and delete objects in that bucket and nothing else. Server-side only. |
| `S3_REGION` | `auto` on R2, the region on AWS and B2. Defaults to `us-east-1`, which S3-compatible servers accept. |
| `S3_ENDPOINT` | The service's address. Empty means AWS. |
| `S3_PUBLIC_ENDPOINT` | Only when browsers and phones reach storage at a different address than the app's server does (the Compose bundle: the app uses the service's name on the Docker network, a browser uses the published port or your media domain). Signed addresses are made for this one. |
| `S3_FORCE_PATH_STYLE` | `true` or `false`, to override the default above. |

A signature covers the host name, so a proxy in front of storage must pass the `Host` header through
unchanged.

Storage credentials never leave the server. A client only ever sees a signed address for one object, one
method and a few minutes.

**Browsers need the bucket to allow the instance's origin** (CORS): methods `PUT` and `GET`, header
`Content-Type`. Phones do not. `deploy/README.md` has the rule to paste for each provider.

## 5. What runs where

| Where | Database | Files |
| --- | --- | --- |
| `pnpm dev`, a first look | Embedded Postgres in `DATA_DIR` | Disk, in `DATA_DIR/media` |
| `pnpm test`, CI | Postgres in memory | Memory driver for the rules; the disk driver on a temporary directory; the S3 driver against signatures worked out by hand, and against a real server when `S3_TEST_ENDPOINT` is set |
| `MOCK_ONLY=1` | Unchanged by it | Unchanged by it (M9) |
| Compose bundle | Its own Postgres | Disk, in the `app-data` volume, until its storage service is chosen (section 9); `S3_*` in `.env` to use object storage now |
| Fly, a VPS | `DATABASE_URL` | `S3_*`, or disk on a volume for one machine |
| Vercel | `DATABASE_URL` (Neon) | `S3_*` (R2, S3, B2). Required: there is no disk to keep files on. |

On a host with no disk and no `S3_BUCKET`, `request_upload` answers 503 with the code `uploads_unavailable`
and says so, `/api/health` reports `storage: "unavailable"` and `doctor` names the fix. Until slice 8 of
`docs/database.md` merges with this, that is what Vercel without storage does; its temporary 4 MB cap
(`UPLOAD_LIMIT_MB`) then applies only to the disk driver, where the file does pass through the app.

## 6. The flow

```
client                         instance                                storage
  | request_upload {kind,name,type,size}                                  |
  |------------------------------>| check the rules, insert a pending row |
  |   ticket {id,url,method,headers,max_bytes,expires_at}                 |
  |<------------------------------|                                       |
  | PUT url, with exactly those headers, no sign-in ---------------------->|
  | complete_upload {id}          |                                       |
  |------------------------------>| HEAD the object: size and type as declared?
  |                               |-------------------------------------->|
  |   MediaItem                   | mark the row stored                   |
  |<------------------------------|                                       |
  | GET /api/media/{id} --------->| 302 to a signed GET (5 minutes) ----->|
```

- The ticket's `url` is absolute, or starts with `/` when the instance itself is standing in for storage
  (M8); a client resolves it against the instance.
- **A client sends no sign-in with the file.** The address is the permission, and a session token must
  never reach another host.
- `complete_upload` is safe to repeat: a second call answers with the same item.
- If what arrived is not what was declared, the object and the row are removed and the answer says why.

### Limits and types (unchanged)

| Kind | Types | Largest |
| --- | --- | --- |
| Picture | `image/jpeg`, `image/png`, `image/webp` | 20 MB |
| Video | `video/mp4`, `video/quicktime`, `video/webm` | 200 MB |

Checked three times: when the ticket is asked for (declared type and size), by storage (the signature
covers both), and at completion (what storage says it holds). A single PUT is enough at these sizes;
multipart uploads are not used, so there are no half-finished parts to clean up.

A video is now kept. Before, only the fact that it arrived was.

### Cleanup

- A ticket's address is good for 15 minutes. Its row is good for an hour, so a slow upload can still be
  completed.
- A pending row past its hour is abandoned: the sweep deletes its object, if one arrived, and then the row.
  A storage error leaves the row for the next round.
- Deleting a library item deletes its object and row. Deleting an account deletes the person's own
  uploads; a workspace's stay with the workspace.

## 7. API client and operations

| Function | Operation | Was |
| --- | --- | --- |
| `requestUpload` | `request_upload` `POST /uploads` | Same name; the ticket has `url`, `method` and `headers` in place of `path` |
| `completeUpload` | `complete_upload` `POST /uploads/{id}/complete` (new) | `receiveUpload` and the route `PUT /api/v1/uploads/{id}`, both removed |
| `getMediaUrl` | `GET /api/media/{id}` (a redirect, not a JSON operation) | `readMediaFile`, which returned bytes |
| `listMedia`, `deleteMedia` | unchanged | Now include uploads from the media store |

The three upload functions stay "mock" in the data-source map because the library they add to is still
mocked and how a job takes an input file is still open (engine question Q17). The files and their records
are real on every host. `docs/data-sources.md` says this in the row.

This is a breaking change to `request_upload`: a phone app built before it cannot upload until it is
rebuilt. Nothing else in the API changed.

## 8. iOS and Android

Both apps did `request_upload`, then a PUT to a path under `/api/v1/` with the session token. Now:

1. `requestUpload` (generated).
2. Send the file to `ticket.url` with `ticket.headers` and **no `Authorization` header**. The transport
   resolves a `/`-relative address against the instance and refuses any scheme but `http` and `https`.
3. `completeUpload(id)` (generated), which answers with the `MediaItem`.

`complete_upload` is added to `operations.ts` first, then `corepack pnpm mobile:generate`. No generated file
is edited by hand. No screen changes, so there are no new screenshots.

Development builds reach storage at the instance's own address (the disk driver), so the cleartext
exceptions both apps already have for a local instance cover it. A release build needs storage on https,
which every hosted provider is.

## 9. The Compose bundle

The brief asked for a MinIO service. **MinIO can no longer be that.** On 27 November 2026 its official
images do not pull from Docker Hub ("repository does not exist") or Quay ("unauthorized"), and Homebrew
marks the formula deprecated "because it has an archived upstream repository", to be disabled on
17 February 2027. Builds of it by third parties exist; depending on one means depending on an abandoned
project and on whoever rebuilds it.

So the bundle needs a different S3-compatible server with an image from its own maintainers. Because of M1
that choice touches only `deploy/compose.yaml`. The candidates, in the order I would pick them:

1. **Garage** (`dxflrs/garage`): small, built for self-hosting, maintained. It needs a one-shot step to
   lay out its single node and create the bucket and key, which can be a second service from the same image.
2. **SeaweedFS** (`chrislusf/seaweedfs`): one command to start with S3 on, but a larger system than one
   bucket needs.
3. A third-party build of MinIO, if the project owner prefers to keep MinIO for now.

**This is the project owner's call and has been asked.** Until it is made, the bundle keeps files on the
`app-data` volume through the disk driver: it works with nothing external, files survive restarts and
upgrades, and an operator who wants object storage sets the `S3_*` values in `.env`. What the bundle does
not yet do is exercise the S3 path by itself.

Whatever the server, the shape is the one the database has: the bundle's own service unless `.env` names
another (`S3_ENDPOINT`), a secret `./livepeer setup` generates, a volume, no published port except the one
browsers send files to, and `S3_PUBLIC_ENDPOINT` set to the address your users reach it at.

## 10. Generated media

Nothing generated is stored today: the mocked generations point at static files in `apps/web/public`. When
jobs go live, a result is copied into the same bucket under `generated/` by the server, streamed from the
engine to storage (never buffered, and not a request body), or written there by the engine itself if it can
be handed a signed PUT address. Which one depends on how the engine returns results, and Q17's mirror image:
the instance can now hand the engine a short-lived signed GET address for an input file. Both are noted in
`docs/engine-requests.md`.

## 11. Slices

| # | Slice |
| --- | --- |
| 1 | This plan, and the "runs anywhere" section of `docs/architecture.md`. |
| 2 | `packages/storage`: the interface, the S3, disk and memory drivers, tests. |
| 3 | The media store, the `media_files` table and migration, the API client functions, the operations, the routes, the web client, health and `doctor`. |
| 4 | iOS and Android. |
| 5 | `.env.example`, `deploy/README.md`, the Fly template, `doctor`; the Compose service and the CLI's generated secret once the server is chosen (section 9). |

## 12. Not built, not verified

Built: slices 1 to 4, and of slice 5 the environment variables, `deploy/README.md`, the Fly template and
`doctor`.

**Not built**

- **The Compose bundle's storage service** (section 9): waiting on which server replaces MinIO. The CLI
  therefore generates no storage secret yet.
- **Storing generated media** (section 10): nothing real is generated yet.
- **Range requests on the disk driver's read route.** A browser seeking in a large video needs them; no
  screen plays an uploaded video today. Object storage serves ranges itself.
- **Looking inside a file.** The media type is what the client declared and storage enforced; the bytes are
  not inspected. A file is only ever served back to its own library, from the storage address, with its
  declared type.
- **Uploads with an API key of a personal account.** A file needs a library to go to: a signed-in person's
  (browser or phone) or a workspace's (its key). User API keys are still mocked and name no person, so such
  a key is answered 403 `account_required` rather than filling a shared default library. It follows once
  keys are real.
- **A size cap for a host with a disk and a body limit** (`UPLOAD_LIMIT_MB`, slice 8 of
  `docs/database.md`): where it plugs in is in this work's hand-over note.

**Not verified**

- **The S3 driver against a real server.** Its signing is checked against the worked example in AWS's
  documentation, and the driver against a stand-in for the HTTP answers, but no S3-compatible server was run:
  MinIO could not be had, and running a substitute was not approved. In particular, that a server refuses a
  PUT whose length differs from the signed one is true by the algorithm and untested in practice. The test
  for all of this is written and skipped (`packages/storage/src/s3.test.ts`); it runs when
  `S3_TEST_ENDPOINT`, `S3_TEST_BUCKET`, `S3_TEST_ACCESS_KEY_ID` and `S3_TEST_SECRET_ACCESS_KEY` are set.
- **R2, AWS S3 and B2 themselves**, and the CORS rule in `deploy/README.md` against each: no bucket was
  created in anyone's account.
- **The phone apps uploading for real.** Both build and their unit tests pass (iOS 70, Android 89), and the
  address handling is tested. Picking a photo in the simulator and the emulator and watching it arrive was
  not done.
- **One stall.** The first read of a 30 MB file through the disk route, piped into another program, stalled
  once in development and never again in a dozen tries, before and after the read was changed to a
  file-backed blob. Noted in case it is seen again.

**Verified by running it:** with the disk driver in `pnpm dev` (mock-only): a ticket, a 30 MB upload,
completion, the same answer on a second completion, the redirect and the bytes read back identical;
refusals for a wrong length, a wrong type, a changed address, an unsigned read and completion before the
file arrived; deletion removing the file; an upload from the web composer appearing in the library with its
picture. The same 30 MB round trip inside the built Docker image, with files landing in `/data/media`.
