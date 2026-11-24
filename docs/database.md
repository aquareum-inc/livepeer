# A Postgres database for the instance: plan

Status: **approved on 24 November 2026 with every recommendation in section 0 as written. Slices 1 to 3 are
built; slices 4 to 8 are not.** What slice 1 changed from the plan is listed under the slices table in section 10.

The instance keeps its own state as JSON files in `DATA_DIR`, and the operator console writes
`instance.config.json` to disk. That ties an instance to a host with a persistent disk and one server
process. This plan moves that state into Postgres so the same codebase runs two ways:

- **Self-hosted:** Postgres is one more service in `deploy/compose.yaml`.
- **Hosted on Vercel:** a Next.js project with a managed Postgres such as Neon, and nothing written to disk.

Already decided, and not reopened here: Postgres (not SQLite or a key-value store); real tables for anything
looked up per request; pooled connections for serverless; the JSON-file store stays for local development,
tests and `MOCK_ONLY`, so `pnpm dev` and `pnpm test` need no database. PymtHouse holds user records, so this
database holds opaque ids only. There is no ledger or plan system in it. Media goes to object storage.

## 0. Decisions I need from you

Each has a recommendation; the rest of the plan assumes it.

| # | Decision | Recommendation |
| --- | --- | --- |
| D1 | Device sessions and the audit log store people's **names and emails** today (section 1.3). That breaks the "opaque ids only" rule the moment they become rows. | Keep one sealed, unreadable-without-`SESSION_SECRET` snapshot per session, as the browser cookie already does, and no plaintext name or email column anywhere. Drop it when the provider can answer `getUser`. The alternative is ids only now, with the console showing ids until PymtHouse is connected. |
| D2 | Where the console's changes to settings live. | In the database, as state, layered over a config file the app never writes. The same rule in JSON-file mode (section 5). |
| D3 | Alerts on Vercel need something to call the instance once a minute. | Vercel Cron, which needs the **Pro plan** for anything more often than daily. On Hobby, alerts are off or need an outside pinger (section 6). |
| D4 | Query layer. | `pg` with Drizzle, SQL migrations committed to the repo (section 3). |
| D5 | Existing `DATA_DIR` files on instances already running. | Import them once on `./livepeer upgrade`, so enrolled phones stay signed in (section 4.4). |
| D6 | Testing the Postgres code without a database in CI. | PGlite (Postgres in-process) in `pnpm test`, plus the Compose job that already runs, now with a real Postgres (section 9). |
| D7 | **Uploads pass through the app's own server** and are kept in memory, with limits of 20 MB and 200 MB. Vercel refuses anything over 4.5 MB. | A separate plan for object storage (`docs/media-storage.md`), with files sent straight from the browser or phone to storage. Not part of this build; until it lands, uploads on Vercel are capped at 4 MB pictures (section 8.1). |
| D8 | Most of the product is still **mock data held in one process's memory** (generations, library, conversations, characters, API keys, workspaces). On Vercel, requests land on different instances, so a render started on one can be "not found" on the next. Postgres does not fix this, and by the rules above it shouldn't. | Don't put mock data in the database. Treat the Vercel deployment in this plan as proof that the instance's own state works with no disk, and say plainly in the template that mocked features are unreliable there until they go live (section 8.4). |

## 1. Inventory: every piece of state that moves

### 1.1 Files in `DATA_DIR`

All five go through `jsonFileStore` (`apps/web/lib/data/json-file.ts`) behind `StateStore`
(`apps/web/lib/data/store.ts`): the whole file is read, changed and rewritten on every update.

| File | Written by | Holds | Read per request? |
| --- | --- | --- | --- |
| `device-sessions.json` | `lib/devices` | Users' device sessions (token hash, user id, **name, email**, role, device name, platform, sealed builder key, workspace pointer, timestamps) and pending sign-in codes (60 s, single use; they hold the same identity and the sealed builder key). | Yes: every request from a phone. |
| `operator-device-sessions.json` | `lib/operator-devices` | Operator device sessions (token hash, user id, **name, email**, device name, public key, unlock window, failed-proof count, and the phone's alerts: kinds, sealed push token, push-token hash, environment, timestamps), pending sign-in codes, pending nonces (60 s, single use). | Yes: every request from an operator's phone, plus the watcher each minute. |
| `operator-audit.json` | `lib/operator-devices/audit.ts` | The newest 2,000 audit entries: event, user id, **user name**, device id and name, operation, target, detail. | No: written on operator actions and every alert sent; read by the console's System page. |
| `moderation.json` | `lib/moderation` | Reports of shared characters (with the reporter's user id), each person's blocks, and the slugs the operator took down. | Yes: every character read filters through `visible(userId)`. |
| `operator-alerts.json` | `lib/alerts` | The watcher's lease, what phones have been told (`AlertState`), and when Apple or Google last refused the instance's credentials. | No: the watcher each minute, and the System page. |
| `push-outbox.json` | `lib/push/recording.ts` | The last 50 notifications mock-only mode would have sent. | No. Mock-only. |

### 1.2 The config file

`apps/web/lib/operator/settings.ts` writes `instance.config.json` in two places:

- `saveSettings`: name, domain, sign-up, surfaces, content and privacy switches, the two primary colours, the
  logo marks (up to 100 KB each, as cleaned SVG or a data URL).
- `configCapabilityStore().write`: per capability, whether it is switched off (`capabilities.block`), where
  it appears (`capabilities.overrides[app].surfaces`) and its markup (`pricing.markup.perApp[app]`).

`apps/web/lib/instance.ts` re-reads the file when its modification time changes. In the Compose bundle the
file is mounted read-only, so the console's Settings page is already read-only there
(`docs/data-sources.md`, "Instance settings").

### 1.3 Names and emails (D1)

`DeviceRecord` and `OperatorDeviceRecord` carry `name` and `email`, and `OperatorAuditEntry` carries
`user_name`. They are there because a phone's request has no cookie to carry them: `lib/public-api/auth.ts`
builds the caller's `{ id, name, email }` from the device record, the phones list shows whose phone each one
is, and the audit log says who did what. Batteries answers `getUser` with "unsupported"
(`packages/api-client/src/provider/batteries.ts`), so today there is nowhere else to read a name from.

The browser session solves the same problem by sealing the identity into the cookie with `SESSION_SECRET`.
The recommendation is the same thing at rest: one `identity_sealed` column holding `{ name, email }` sealed
with `SESSION_SECRET`. There is no plaintext name or email column, nothing can be searched or joined by
them, and rotating the secret makes every snapshot unreadable, as it already ends every session. This is
still personal data in the database, in ciphertext, so it needs your sign-off rather than my reading of the
rule. It goes the day the provider answers `getUser`: the column is dropped and names are read at display
time.

Two smaller things in the same area, which I'd leave as they are unless you say otherwise:

- A report stores the reported character's name and its author's handle. That is content shown on the
  instance, not a user record, and the Reports page needs it after a character is deleted.
- A device name ("iPhone", or whatever the phone calls itself) is stored in plain text.

### 1.4 State held in one process's memory

These work today only because there is one long-running process. On Vercel each of them is silently wrong.

| Where | What | Moves to |
| --- | --- | --- |
| `operator-devices/sessions.ts`, `windows` | Requests per operator session per minute (limit 120). | Two columns on the session row, counted in the same statement that finds the session. |
| `alerts/service.ts`, `tests` | Test alerts per phone per hour (limit 3). | Counted from the audit log's `alert` entries for that phone. |
| `alerts/service.ts`, `background()` | Sends started without holding up the request (`reportFiled`, `phoneAdded`). | Next's `after()`, so a serverless function isn't frozen before the send finishes. |
| `alerts/watcher.ts` | The timer, the lease holder id, `jobsReadAt`. | Section 6. |
| `lib/instance.ts`, `lib/push/index.ts`, the `devices()` / `moderation()` singletons | Caches of things built from config or env. | Stay; they are caches, not state. The config cache gets a time limit (section 5). |

The sign-in flow needs nothing: its state and PKCE verifier are in a sealed cookie
(`app/auth/start/route.ts`). There is no idempotency store; engine writes send a fresh `operation_ref`.
The mock data the API client keeps in memory is a separate matter, in section 8.4.

### 1.5 What does not move

- The browser session: a sealed cookie, no server state.
- The engine's own database (`engine-data`) and Clearinghouse's state (`paid-state`): theirs, untouched.
- Everything the API client mocks (jobs, library, characters, conversations, plans, workspaces): mock data
  in memory, replaced by the engine or the provider when they go live, never by this database.
- Credentials: environment variables only.

## 2. Schema

One schema, `public`. Ids are the text ids the code already makes (`dev_…`, `opd_…`, `aud_…`, `rep_…`).
Times are `timestamptz`. Every hash is the existing HMAC keyed with `SESSION_SECRET`; every `_sealed` column
is the existing AES-256-GCM seal. No foreign key points at a user: `user_id` and `workspace_id` are the
provider's opaque ids.

**Device sessions (users' phones)**

| Table | Columns | Keys and indexes |
| --- | --- | --- |
| `device_sessions` | `id`, `token_hash`, `user_id`, `role`, `device_name`, `platform`, `builder_key_sealed` null, `identity_sealed` (D1), `workspace_id` null, `created_at`, `last_used_at` | PK `id`; unique `token_hash`; index `user_id` |
| `device_sign_in_codes` | `code_hash`, `challenge`, `platform`, `user_id`, `role`, `builder_key_sealed` null, `identity_sealed`, `expires_at` | PK `code_hash`; index `expires_at` |

**Operator device sessions**

| Table | Columns | Keys and indexes |
| --- | --- | --- |
| `operator_device_sessions` | `id`, `token_hash`, `user_id`, `identity_sealed`, `device_name`, `platform`, `public_key`, `created_at`, `last_used_at`, `last_unlocked_at` null, `unlocked_until` null, `failed_proofs`, `window_start`, `window_count` | PK `id`; unique `token_hash`; index `user_id` |
| `operator_sign_in_codes` | `code_hash`, `challenge`, `platform`, `user_id`, `identity_sealed`, `expires_at` | PK `code_hash` |
| `operator_challenges` | `nonce_hash`, `session_id`, `operation` null, `input_hash` null, `expires_at` | PK `nonce_hash`; FK `session_id` → sessions, cascade; index `session_id` |
| `operator_push_tokens` | `session_id`, `kinds` text[], `push_sealed` null, `push_hash`, `environment`, `set_at`, `last_alert_at` null, `warned_at` null, `told_engine_down` bool | PK and FK `session_id` → sessions, cascade; unique `push_hash` |
| `operator_audit` | `id`, `at`, `event`, `user_id`, `actor_sealed` (D1), `device_id` null, `device_name` null, `operation` null, `target` null, `detail` null | PK `id`; index `at` desc |

Users' and operators' sessions stay in separate tables on purpose: the code's rule is that neither can stand
in for the other. The cascades are the existing rule "a push token ends with the record, however that ends"
made structural. The unique `push_hash` is the rule "a push token belongs to one phone".
`told_engine_down` replaces the `engine.told` list of session ids.

**Moderation**

| Table | Columns | Keys and indexes |
| --- | --- | --- |
| `character_reports` | `id`, `character_slug`, `character_name`, `author`, `reason`, `note` null, `state`, `reporter_id`, `created_at` | PK `id`; unique (`reporter_id`, `character_slug`) where `state = 'open'`; index (`state`, `created_at`) |
| `character_blocks` | `user_id`, `character_slug`, `author` | PK (`user_id`, `character_slug`) |
| `hidden_characters` | `character_slug`, `hidden_at` | PK `character_slug` |

**Alerts**

| Table | Columns | Keys and indexes |
| --- | --- | --- |
| `alert_state` | One row: `engine_down`, `engine_streak`, `jobs_failing`, `jobs_last_seen_at`, `jobs_read_at`, `reports_last_sent_at`, `reports_unannounced`, `round_claimed_at` | PK a constant |
| `push_refusals` | `platform`, `at`, `detail` | PK `platform` |
| `push_outbox` | `id`, `at`, `platform`, `environment`, `payload` jsonb | PK `id`. Mock-only; newest 50 kept |

**Settings**

| Table | Columns | Keys and indexes |
| --- | --- | --- |
| `instance_settings` | One row: `settings` jsonb, `version` int, `updated_at` | PK a constant |
| `capability_settings` | `app`, `enabled`, `markup` null, `surfaces` text[] null, `updated_at` | PK `app` |

`instance_settings.settings` and `push_outbox.payload` are the two JSON columns, and both are deliberate.
Settings is a document validated whole against the config's JSON Schema, read whole and written whole, never
searched by field; turning it into columns would be a second copy of that schema. Per-capability settings
*are* rows, so two operators changing different capabilities no longer overwrite each other, which the file
allows today.

Expired codes and nonces are deleted when used and swept by the alerts round (section 6). The audit log is
trimmed to its newest 2,000 entries the same way.

What gets better than the file: a nonce or code is taken with one `DELETE … RETURNING`, so two requests can
never both use it; a token lookup is one indexed read instead of parsing a file; `last_used_at` no longer
rewrites every session.

## 3. Query layer

**A new package, `packages/db`**, holding the Drizzle schema, the connection, the migrations and the
migration runner. The app depends on it; nothing in it knows about Next.js.

- **Driver:** `pg` (node-postgres) with a `Pool`. It speaks to the Compose Postgres and to Neon alike, and it
  is what both Vercel and Neon recommend for Node functions. No Neon-specific driver.
- **Typed queries:** Drizzle. The schema file is the source of the row types; no hand-kept copies.
- **Two addresses.** `DATABASE_URL` is what the app queries through; on Neon it is the pooled address
  (PgBouncer in transaction mode). `DATABASE_URL_UNPOOLED` is a direct connection, used only by migrations,
  which need a session-level lock. These are the names Neon's Vercel integration sets. In Compose both are
  the same address and the second may be left empty.
- **Pool:** created once per process. On Vercel it is registered with `attachDatabasePool` from
  `@vercel/functions`, so idle connections close before an instance is suspended. Because the pooled address
  is transaction-mode, the app uses no session state: no `LISTEN`, no session advisory locks, no `SET`.
  Anything that must be atomic is one statement or one transaction.
- **Which store runs** is decided in one place by whether `DATABASE_URL` is set, not by `MOCK_ONLY`: set means
  Postgres, unset means the JSON files. A mock-only demo on Vercel therefore still gets a database, because
  it still has no disk.

**Stores become asynchronous and say what they mean.** `StateStore<T>` is "read the whole thing, change it,
write it back", synchronously. A database can be neither whole-document nor synchronous. Each domain gets its
own store interface with a method per intent, for example:

```ts
interface DeviceSessionStore {
  putCode(code: PendingCode): Promise<void>;
  takeCode(codeHash: string): Promise<PendingCode | null>;      // single use
  createSession(record: DeviceRecord): Promise<void>;
  findByTokenHash(tokenHash: string): Promise<DeviceRecord | null>;
  touch(id: string, at: Date): Promise<void>;
  listForUser(userId: string): Promise<DeviceRecord[]>;
  setWorkspace(id: string, workspaceId: string | null): Promise<boolean>;
  remove(by: { id: string; userId: string } | { userId: string }): Promise<number>;
}
```

Each interface has two implementations: one over the existing JSON file (and over memory, for tests), one
over Postgres. The services that hold the rules (`deviceSessions`, `operatorDeviceSessions`, `moderation`,
`auditLog`, `alertsService`) keep their rules and become `async`; about 50 call sites gain an `await`. The
constant-time comparison of hashes goes: an indexed equality lookup on a keyed HMAC gives an attacker nothing
to time.

## 4. Migrations

### 4.1 Files and runner

SQL files generated by `drizzle-kit` from the schema, reviewed and committed in `packages/db/migrations`.
`packages/db` has one entry point, `migrate`, which connects with `DATABASE_URL_UNPOOLED` (falling back to
`DATABASE_URL`), takes a Postgres advisory lock so two runs can't overlap, applies what hasn't been applied,
and exits non-zero on failure. Root scripts: `pnpm db:generate` (after a schema change) and `pnpm db:migrate`.

Migrations are **expand, then contract**: a release only adds (tables, nullable columns, indexes); removing
something waits for the release after the code stopped using it. On Vercel the previous deployment keeps
serving while the new one builds, so a migration must never break the code already running.

### 4.2 Self-hosted: `./livepeer setup` and `upgrade`

- `setup` generates `POSTGRES_PASSWORD` once (as it does `SESSION_SECRET`) and writes `DATABASE_URL` for the
  bundle's own Postgres, unless `DATABASE_URL` is already set to something else.
- The bundle gets a one-shot `migrate` service (the app image, running the migrate entry point). `app` waits
  for it to finish successfully, and it waits for `db` to be healthy. So migrations run on `setup`, on
  `upgrade`, and on a plain `docker compose up`, with no extra step to remember, and a failed migration
  stops the app from starting on a half-moved schema.
- `upgrade` is unchanged in what it does (move the pins, `up -d --build`); the migrate service is what makes
  it apply migrations. It reports "migrations applied: n" in its output and its `--json`.
- `doctor` gains two checks: the database is reachable, and the schema is at the version this checkout
  expects. `/api/health` reports `database: "ok" | "unreachable" | "behind" | "none"`, and "unreachable" or
  "behind" make it 503.

### 4.3 Vercel

The project's build command becomes `pnpm db:migrate && pnpm build`, using `DATABASE_URL_UNPOOLED`. Preview
deployments get their own database branch from the Neon integration, so a preview's migration never touches
production.

### 4.4 Importing existing files (D5)

The migrate entry point, after migrating, looks in `DATA_DIR`. If it finds the JSON files and the matching
tables are empty, it imports them in one transaction (sealing names and emails on the way, per D1) and
renames each file to `*.imported`. Phones stay signed in, reports and blocks survive. It runs once and is
removed, with the `app-data` volume, two releases later.

## 5. Operator settings move off the config file (D2)

**The rule.** The config file is what you deploy with; what the console changes is state. The app never
writes the file again.

- **Base:** `instance.config.json`, or `INSTANCE_CONFIG`, or the built-in preset, exactly as now. New: an
  `INSTANCE_CONFIG_JSON` environment variable holding the config itself, for hosts with no file to mount
  (Vercel). It wins over the file when set.
- **Overrides:** the one `instance_settings` row and the `capability_settings` rows.
- **Effective config** = the base with the overrides applied, validated against the schema. If a saved
  override no longer validates (the schema moved on), it is ignored, the base is served, and the console's
  Settings page says so. A bad row can never take an instance down.
- **What the console may override** is exactly what it edits today: the fields of `saveSettings` and the
  three per-capability fields. Everything else (`auth`, `mobile`, `engine`, `surfaces.console`) stays
  deploy-time config, so nobody can lock themselves out or repoint sign-in from a web form.
- **Settings gets a "Reset to the config file" action** per section, which deletes the override. It needs an
  operation in `operations.ts` and a row in `docs/ui-actions.md`.
- **In JSON-file mode** the same rule holds: overrides go to `DATA_DIR/instance-settings.json` instead of
  rewriting the config. `pnpm dev` stops dirtying `instance.config.json`, and there is one behaviour to test.
- **A side effect worth having:** Settings becomes writable in the Compose bundle, where it is read-only
  today because the file is mounted read-only.

**`instance()` becomes asynchronous.** It is synchronous today and called from 57 places in 41 files,
including `proxy.ts` on every page. A database read can't be synchronous, and preloading it in the proxy
doesn't help on Vercel, where the proxy and the page can run in different instances. So: `await instance()`,
deduplicated per request with React's `cache()`, over a per-process cache that is trusted for 10 seconds and
dropped immediately in the process that saved a change. "A change applies on users' next request" becomes
"within 10 seconds", which the Settings and Capabilities pages will say. The change is mechanical but wide,
so it is its own slice.

`instance.ts` and `env.ts` find the repository root as `process.cwd()/../..`. That holds in `pnpm dev` and
the Docker image and is not guaranteed on Vercel; with `INSTANCE_CONFIG_JSON` or the built-in preset nothing
needs to be found on disk there, and slice 8 verifies it on a real deployment.

## 6. Alerts without a long-running server (D3)

Today `instrumentation.ts` starts a timer in the server process: each minute it reads the engine's health,
every five minutes recent jobs, counts waiting reports, and tells phones whose alerts are about to end. A
lease in a file keeps a second process quiet. A serverless function has no "between requests".

**One round, two ways to trigger it.**

- `runAlertRound()` is today's `check()` with nothing kept in memory: `jobsReadAt` moves to `alert_state`,
  and the lease becomes a claim: one `UPDATE alert_state SET round_claimed_at = now() WHERE round_claimed_at
  < now() - interval '50 seconds' RETURNING …`. Whoever gets a row back runs the round; anyone else does
  nothing. That is safe for two replicas, a retried cron call, or both triggers at once.
- **Long-running server (Compose, Fly, a VPS):** the timer stays and calls `runAlertRound()`. Nothing new to
  run, which is what decision 18 in `docs/mobile/plan.md` wanted.
- **Vercel:** a route, `GET /api/cron/alerts`, runs one round. Vercel Cron calls it every minute and sends
  `Authorization: Bearer $CRON_SECRET`; the route answers 404 unless that header matches, and when
  `CRON_SECRET` is unset. When `CRON_SECRET` is set the in-process timer isn't started, so the two never
  race for no reason and no host has to be detected by name.
- The round also does the sweeping: expired codes and nonces, and the audit log's trim.

**The engine rule survives the move.** "Not ready on two checks a minute apart" needs a check a minute.
Vercel Cron runs per minute on Pro; on Hobby a cron may run only once a day, so alerts there need either Pro
or an outside scheduler calling the same route with the secret. `doctor` and the System page will say
"alerts: no schedule" when the mobile console is on, `CRON_SECRET` is set and no round has run in five
minutes, rather than leaving a silent gap.

**Sends raised by a request** (`report_character`, a phone being enrolled) move from a detached promise to
`after()`, which keeps a function alive until the send is done.

Decision 18 in `docs/mobile/plan.md` and the line in `deploy/README.md` ("alerts need the long-running
server") are amended to say this.

## 7. Compose and `.env.example`

**`deploy/compose.yaml`**

- New `db` service: `postgres:17-alpine`, not behind a profile (the app-only bundle needs it too), data in a
  new `db-data` volume, a `pg_isready` health check, no published port.
- New one-shot `migrate` service (section 4.2); `app` depends on it.
- `app` gets `DATABASE_URL` from `.env`. Its `instance.config.json` mount stays read-only, which is now
  correct rather than a limitation. The `app-data` volume stays for the import and is removed two releases
  later.
- To use a Postgres you already run, set `DATABASE_URL` in `.env`; `deploy/README.md` will show the override
  that leaves the bundled `db` out.
- `deploy/README.md` gains backup and restore (`pg_dump` / `psql` through `docker compose exec db`).

**`Dockerfile`:** the image also carries `packages/db`'s migrations and migrate entry point. `DATA_DIR=/data`
stays until the import is retired.

**`.env.example`** (each with its one-line description):

| Variable | Meaning |
| --- | --- |
| `DATABASE_URL` | Postgres the instance keeps its state in. Pooled address on a serverless host. Empty: JSON files in `DATA_DIR` (development and tests only). |
| `DATABASE_URL_UNPOOLED` | Direct address for migrations when `DATABASE_URL` is pooled. Empty: `DATABASE_URL` is used. |
| `POSTGRES_PASSWORD` | Password for the bundle's own Postgres. Written by `livepeer setup`. |
| `INSTANCE_CONFIG_JSON` | The instance config itself, for hosts with no file to mount. Wins over `INSTANCE_CONFIG`. |
| `CRON_SECRET` | Lets a scheduler run the alerts round at `/api/cron/alerts`. Set it only on hosts with no long-running server. |
| `DATA_DIR` | Description changes: used only when `DATABASE_URL` is empty. |

**Templates:** `deploy/templates/fly/fly.toml` gains the `DATABASE_URL` secret in its instructions. New
`deploy/templates/vercel/`: a README (project root `apps/web`, the build command, the Neon integration, the
environment variables, the Pro-plan note for alerts) and the `crons` entry that goes in `apps/web/vercel.json`.

## 8. Uploads, live sessions and media on Vercel (D7, D8)

Vercel refuses a request or response body over 4.5 MB (streamed responses are exempt), and a function runs
for at most 300 seconds by default, 800 at most on Pro. Nothing can hold a socket open beyond that. I checked
each path that could run into those limits.

### 8.1 Uploads: yes, through the app's server

An upload is two steps. The client asks for a ticket (`request_upload`; on the web,
`requestUploadAction`), then PUTs the file to `/api/v1/uploads/{id}` on the instance itself. That route
(`app/api/v1/uploads/[id]/route.ts`) reads the whole body into memory and hands it to the API client. The
web (`lib/upload.ts`), iOS (`APITransport.swift`) and Android (`ComposerSupport.kt`) all do this; there is no
direct-to-storage path. The limits are 20 MB for a picture and 200 MB for a video
(`packages/api-client/src/mock/uploads.ts`).

It is all mock today: tickets and the newest 24 pictures live in a `Map` in memory, a video's bytes are
dropped on arrival, and the engine has no upload endpoint (question Q17 in `docs/engine-requests.md` is
still open; a job's `raw_body` takes at most 8 MiB).

On Vercel this fails three ways: a file over 4.5 MB is refused before the route runs; the ticket made by one
instance may not exist on the instance that receives the file; and the stored picture may not be on the
instance asked to serve it.

**What this plan does about it:** nothing structural, because the fix is object storage, not this database,
and it depends on Q17. It needs its own plan (`docs/media-storage.md`): an S3-compatible storage interface;
the ticket becomes a signed address the client sends the file straight to; `/api/media/{id}` becomes a
redirect to a signed address; a storage service joins the Compose bundle. Both phone apps need a change,
since they only accept a ticket path under `/api/v1/` today. I'll propose that as its own piece of work if
you approve this plan.

**In the meantime**, slice 8 makes the limit honest instead of mysterious: on a host that declares a body
limit (one new config value, not a host name), `request_upload` refuses anything larger with the existing
"too large" answer and the composer says what the limit is.

### 8.2 Live sessions and streaming: no, because none are connected

Live sessions, calls and chat are mocked, and nothing in `apps/web` or `packages` opens a WebSocket, a
WebRTC connection or a streamed response. The camera preview is local to the browser. Chat, Studio and Live
poll short server actions (every 700 ms to 1 s); no request is held open. The MCP endpoint
(`app/api/mcp/route.ts`) is stateless: POST answers with JSON, GET is 405, and no session is kept.

So nothing breaks on Vercel today. Two things will matter when these go live, and belong in
`docs/engine-requests.md` when this plan is approved:

- **Live sessions must not go through the app.** The engine's sessions expose a `proxy_path` that forwards
  HTTP, SSE and WebSocket (`docs/research/engine.md`). A Vercel function can't hold that open, and a builder
  key can't go to the browser. The browser or phone needs to connect to the engine directly with a
  short-lived, session-scoped credential the instance mints. Whether the engine can issue one is a question
  for Mike.
- **Synchronous jobs hold the request open.** `POST /v1/jobs` waits for the runner, 300 seconds by default
  and up to 3,600. Called through a Vercel function, anything past the function's limit is cut off. The app
  should use asynchronous jobs and polling (which is what the screens already do against the mock) and never
  the long synchronous call from a serverless host.

### 8.3 Media: only uploaded pictures

`/api/media/{id}` returns an uploaded picture's bytes from memory, up to 20 MB, which is over the response
limit too. Generated media is static files in `apps/web/public` today. No engine media is proxied. This is
fixed by the same storage plan as 8.1.

### 8.4 Mock data in memory (D8)

Nearly every API function is still mocked, and the mocks keep what you do in the process's memory:
generations and their progress, the library, conversations, user-made characters, live sessions and calls,
API keys (including the table `verifyApiKey` checks a `/api/v1` key against), preferences, and the whole
mock provider (users, allocations, plans, workspaces, members, invitations). `workspaceOf` reads the mock
provider even in live mode (`lib/api.ts`).

With one long-running process that is fine. On Vercel, a render started on one instance can be missing on
the instance that receives the next poll, and a key or workspace you just created can vanish. Vercel reuses
warm instances, so it will often appear to work, which is worse than failing.

This state is not the instance's to keep: jobs and the library belong to the engine, and users, balances and
workspaces to PymtHouse. Putting it in Postgres would be the ledger and user database this plan rules out,
so the recommendation is to leave it and be plain about it. If you want a hosted demo to behave before
those functions go live, the honest options are a single long-running machine (Fly, or the Compose bundle),
not a mock-data table.

## 9. Tests

- **Contract tests.** One suite per store interface, run against the memory implementation and against
  Postgres, so the two can't drift. Postgres in `pnpm test` is PGlite (Postgres compiled to run in-process),
  migrated with the real migration files: no Docker, no service, nothing for a contributor to start.
- **Service tests** (`sessions.test.ts`, `moderation.test.ts`, `service.test.ts`, `alerts.test.ts` and the
  rest) keep running against memory, now with `await`.
- **Concurrency**, against PGlite: two redemptions of one sign-in code, two uses of one nonce and two claims
  of one alerts round each succeed exactly once.
- **Migrations:** from empty to head; and the JSON import, from fixture files written by today's code, with a
  check that no name or email is readable in any column afterwards.
- **Settings:** base and overrides merge to the expected config; an invalid override falls back to the base;
  reset removes it; per-capability writes don't disturb each other.
- **Alerts:** a round with no claim does nothing; the cron route refuses a missing or wrong secret; the timer
  doesn't start when `CRON_SECRET` is set.
- **Real Postgres:** the Compose job in `ci.yml` already runs `./livepeer setup --mock-only` and `doctor` for
  both presets. With this plan that job starts Postgres, runs the migrate service and passes the new
  `doctor` checks, which covers the real driver, the real migrations and the CLI path end to end.
- `pnpm dev`, `pnpm test`, `pnpm build` and the mobile CI jobs (an instance started with `MOCK_ONLY=1` and no
  `DATABASE_URL`) keep using files and need no database.

## 10. Slices

Each ends with a commit, passing tests, and updated docs. Screenshots in dark, light and mobile width where a
screen changes (slices 5 and 6).

| # | Slice | What is true at the end |
| --- | --- | --- |
| 1 | **Foundation.** `packages/db` (connection, Drizzle, migration runner, empty first migration), the `db` and `migrate` services, `setup` / `upgrade` / `doctor`, `/api/health`, `.env.example`. | The bundle starts with a migrated, empty database. Nothing reads it yet. |
| 2 | **Async stores.** Replace `StateStore` with the per-domain store interfaces over JSON and memory; services and call sites become `async`. No database code. | Behaviour unchanged, every existing test passing with `await`. The refactor is reviewable on its own. |
| 3 | **Sessions.** Tables and Postgres stores for device sessions, operator device sessions, codes, nonces, push tokens and the audit log; D1; the two rate limits move into the database; contract and concurrency tests. | With `DATABASE_URL` set, phones sign in, unlock, prove and are revoked against Postgres. |
| 4 | **Moderation.** Tables and store for reports, blocks and takedowns. | Reports and blocks are rows. |
| 5 | **Settings.** Async `instance()`, `INSTANCE_CONFIG_JSON`, `instance_settings` and `capability_settings`, the reset action, the JSON-mode override file. | The app never writes the config file; Settings works in the Compose bundle. |
| 6 | **Alerts.** `alert_state`, `push_refusals`, `push_outbox`, `runAlertRound()`, the claim, the cron route, `after()`, the System page's "no schedule" state. | Alerts work with the timer or with a scheduler, and nothing about them lives in memory or on disk. |
| 7 | **Import and clean-up.** The one-time JSON import; docs sweep (`architecture.md`, `data-sources.md`, `README.md`, `deploy/README.md`, `mobile/plan.md` decision 18). | An existing instance upgrades without losing a session. |
| 8 | **Vercel.** The template, `vercel.json`, path fixes, the declared upload limit (8.1), the two engine questions (8.2), and a real deployment against Neon walked through end to end. Needs your Vercel and Neon accounts; I'll ask before creating anything. | A hosted instance keeps all of its own state with nothing on disk. Mocked features and large uploads are still limited there, as sections 8.1 and 8.4 say. |

Object storage for uploads is not a slice here; it is the separate plan in 8.1.

**Slice 1 as built (24 November 2026).** Three things differ from the sections above:

- `setup` does not write `DATABASE_URL` to `.env` (section 4.2). `deploy/compose.yaml` gives the app and
  `migrate` the bundle's own address, built from `POSTGRES_PASSWORD`, unless `.env` sets `DATABASE_URL`.
  The same `.env` also runs `pnpm dev`, where an address on the Compose network would be unreachable.
  `upgrade` generates `POSTGRES_PASSWORD` for an instance set up before this release.
- The migration runner is bundled into one file (`packages/db/dist/migrate.cjs`, built by esbuild) so the
  image runs it without the build's `node_modules`. `pnpm db:migrate` runs the same file.
- `attachDatabasePool` (section 3) is left to slice 8, where it can be tried on a real Vercel deployment.

**Slice 2 as built (24 November 2026).** The store interfaces are `DeviceSessionStore`, `OperatorDeviceStore`,
`AuditStore`, `ModerationStore`, `AlertsStore` and `OutboxStore`, each with a `document…Store` implementation
over a JSON file or memory. Two things are left exactly as they were, for the slices that own them: the two
rate limits are still counted in process memory (slice 3, though `allow` is already asynchronous so its
callers won't change again), and the alerts lease and timer are untouched (slice 6). Hashes are now looked up
by equality, as section 3 says. Sweeping of expired codes and nonces still happens when a sign-in or a
challenge is made, through a `sweep` method on each store, until the alerts round takes it over in slice 6.

**Slice 3 as built (24 November 2026).** Tables: `device_sessions`, `device_sign_in_codes`,
`operator_device_sessions`, `operator_sign_in_codes`, `operator_challenges`, `operator_push_tokens`,
`operator_audit` (migration `0001_sessions`). D1 is in: `identity_sealed` and `actor_sealed`, opened only with
`SESSION_SECRET`; with the secret changed a person is shown by their id. Differences from section 2:

- `operator_audit` has a `seq` identity column, because entries written in the same millisecond need an
  order. The log is trimmed to its newest 2,000 when an entry is written, not by the alerts round.
- `operator_push_tokens.told_engine_down` is not there yet. It belongs to the alerts state and arrives with
  slice 6, as a column added then.
- `device_name` is kept in the clear, as section 2 lists it. It is what the person called their phone
  ("Sam's iPhone"), so it often contains a first name. Sealing it too is a small change if you want it.
- Test alerts are limited by counting the audit log (three an hour per phone), and requests by two columns
  on the session row. Neither is held in memory any more, except request counts in JSON mode.
- Until slice 7's import, a phone enrolled on an instance that kept sessions in files signs in again once
  that instance gets `DATABASE_URL`.

**Found while testing the bundle, and fixed.** The bundle's `.env` carries `DATA_DIR=` empty, and Compose
passed that to the app in place of the image's own `DATA_DIR=/data`. The app then tried to write its JSON
files beside the server, where its user may not write (checked in a running container: `mkdir` is refused).
So in the Compose bundle nothing the instance kept in files could be written: phone sign-in, reports and
alerts state. `compose.yaml` now sets `DATA_DIR: /data` itself. For slice 7 this means a Compose instance has
no session files to import; the import matters for instances run some other way with `DATA_DIR` set.

Slices 3, 4 and 6 are independent of each other once 2 is in; 5 is independent of all three.

## 11. What this plan does not do

- No users table, no names, emails or membership beyond D1's sealed snapshot, no ledger, no plans.
- No media in the database, and no object storage: that is its own plan (8.1).
- No mock data in the database (8.4).
- No change to the engine. Two questions for Mike come out of section 8.2 and are added to
  `docs/engine-requests.md` in slice 8.
- No new `/api/v1` operation except "reset settings", so the native apps and their generated clients are
  untouched unless D1 is decided as "ids only", which would change `user_name` in two outputs.
