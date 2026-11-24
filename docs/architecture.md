# Architecture plan

## Packages

```
apps/web                    Next.js host: routes, session, role guard, /api/v1, /api/mcp, /api/health
packages/api-client         Types, one function per operation (live + mock), data-source map, provider interface
packages/config             Instance config: JSON Schema, generated types, presets, loader, surface mapping
packages/db                 The instance's Postgres: Drizzle schema, connection pool, SQL migrations, migration runner
packages/ui                 Tokens, primitives, motion
packages/user-app           User-app screens (chat, studio, characters, library, models, developers, settings)
packages/operator-console   Operator screens
packages/cli                `livepeer setup | doctor | upgrade`
deploy/                     Compose bundle, platform templates
release.config.json         { org, repo, engine: { repo, ref } } — the one place the org and engine pin live
```

One host app, two screen packages. The user app and the operator console are separate packages that the host
mounts by config (`surfaces.app`, `surfaces.console`); a disabled surface's routes answer 404 and its
package is not loaded. One origin and one session keep self-hosting to a single container.

## Instance config

`instance.config.json`, validated against `packages/config/schema/instance.schema.json` (TypeScript types
generated from the schema). Environment variables hold secrets and the engine URL only.

```
name, logo { symbol, wordmark, tint }, theme { tokens... }            branding
engine { url }                                                  (overridable by ENGINE_URL)
surfaces { app, console, api, mcp, mobile }                     booleans; mobile is off in both presets
mobile { ios { bundleId, minimumVersion }, android { applicationId, minimumVersion } }   the apps built for it
capabilities { allow: string[], block: string[] }               glob rules on discovered app names
capabilityOverrides { [app]: { surfaces?, enabled?, label? } }
auth { provider: "mock" | "oidc", oidc { issuer, clientId } , signUp: "open" | "invite" | "closed" }
payments { provider: "batteries" | "pymthouse" | "mock" }
pricing { markup: { default: number, perApp: { [app]: number } }, creditsPerUsd: number }
content { characters: boolean, adultContent: boolean }
privacy { retainChats: boolean }
```

Presets: `full` (all surfaces) and `headless` (console + api + mcp, no user app; the console can be switched off). Capability rules are
independent of presets.

## Capability → surface mapping (`packages/config`)

Discovery gives `app` and `modes` only, so the mapping is rule-based on those, with per-instance overrides:

| Rule (first match) | Kind | Surfaces |
|--------------------|------|----------|
| `live-transcode`, `live-delivery`, `*/ffmpeg-live`, `*-publish` | stream support | Live mode output (not listed as a tool) |
| mode `persistent` and name contains `avatar` | real-time character | characters (call) |
| mode `persistent` | real-time session | studio Live |
| `*-understanding`, `transcription`, `translation`, `*-metadata`, `*-extract-frame` | understanding | chat, library |
| `text-to-*`, `image-to-*`, `video-to-video`, `image-edit`, `music`, `*-to-speech` | generation | chat, studio |
| `chat`, `*/chat/*` | language | chat |
| `*transcode*`, `*-scale-*`, `*-trim-*`, `*-merge-*`, `*-compose`, `*-loudnorm` | media action | library actions |
| anything else | unmapped | models catalogue + generic run screen, API, MCP |

Every capability, mapped or not, is in the catalogue, the API and MCP.

## API client

`createApiClient({ engine, tokens, provider, env })`. Each function has a live and a mock implementation
behind one signature, chosen by `DATA_SOURCES` (see `docs/data-sources.md`); `MOCK_ONLY=1` forces mock.
Results carry their source so dev mode can label screens.

Areas: `discovery`, `jobs`, `generations`, `sessions` (live), `conversations`, `library`, `characters`,
`keys`, `costs`, `workspaces` (accounts, members, invitations), `operator.*` (actors, grants, allocations, keys,
capabilities, compute, settings, system, workspaces).

Tokens, least powerful first: builder key (user-app calls, from the sealed session), reader token (operator
reads), admin token (operator writes and sign-up provisioning). All server-side.

### Provider interface (`packages/api-client/src/provider`)

Uses the engine's terms; not coupled to one provider.

```
identity:   getSession, listUsers, getUser, setUserStatus, setUserRole
budgets:   listGrants, createGrant, fundGrant, getAllocation, provisionAllocation, topUpAllocation, getBalance
plans:     listPlans, createPlan, updatePlan, assignPlan, getUserPlan, listCreditPacks
usage:     listUsage, getUsageSummary, getUsageByMember
workspaces: list, listForUser, get, create, rename, setStatus, listMembers, setMemberRole, removeMember,
           transferOwnership, listInvitations, listInvitationsForUser, getInvitation, invite,
           revokeInvitation, acceptInvitation, declineInvitation
features:  supports { plans, allowances, invoices, oidc, ... }
```

Implementations: `batteries` (budgets and usage live through engine routes; plans and identity report
unsupported) and `mock` in PymtHouse's shape (plans, allowances, invoices, OIDC users). A credit balance is
the allocation balance converted by the markup rule; a credit pack is a one-off allocation top-up.

## Workspaces

People often share one budget: a studio, an agency, a company. A **workspace** is a shared account several
people belong to, each with a role. The plan, with what was decided and why, is `docs/workspaces.md`; the web
user app and the web console have it, on mocked data.

- **A workspace is a billing account.** To the provider it is an account id used wherever a user id is, so it
  owns an allocation (the credit balance), a plan, usage and API keys; to the engine it is one actor. None of
  the money model changes and there is no second ledger. A personal account stays what it was, and is not a
  workspace.
- **Membership is the provider's.** `provider.workspaces` (`packages/api-client/src/provider/types.ts`) holds
  workspaces, members with a role (owner, admin, member), and invitations by email. The app stores none of it.
  The mock implements it in the shape PymtHouse is expected to expose (questions Q18 to Q24 in
  `docs/engine-requests.md`); Batteries reports `features.workspaces: false`.
- **The app acts in one account at a time.** The session cookie names the current workspace (`workspaceId`),
  and `workspaceOf` (`apps/web/lib/api.ts`) asks the provider on every request whether the person still
  belongs, falling back to their personal account. `createApiClient({ workspaceId })` then reads and charges
  the workspace's account.
- **Roles are one rule.** `can(role, action)` in `packages/api-client/src/workspaces.ts`: the owner handles
  money, admins handle people and keys, members make things. The API client refuses with it (`NotAllowed`) and
  the screens hide with it. The role is read from the provider on each call, never from the cookie. The
  instance roles `user | operator` are separate.
- **What is the workspace's:** credit, plan, usage (each entry names the member or key that ran it), API keys,
  the library and private characters. Chats are each member's own inside the workspace. Profile, sign-in,
  devices and preferences stay the person's.
- **In the operator console,** Workspaces lists them beside Users; suspending one pauses its allocation and
  leaves its members' own accounts alone.

Not built: member spending limits, deleting a workspace, per-seat pricing, the public `/api/v1` operations,
and the native apps, which work in the personal account only.

## Auth

OIDC-shaped interface (`getSession`, `signIn`, `signOut`, roles `user | operator`). The session is an
AES-256-GCM sealed, httpOnly, SameSite=Lax cookie keyed by `SESSION_SECRET`, holding the user id, role and
builder key. `BUILDER_API_KEY` is a dev shortcut. The mock provider and role switcher exist in dev only.
`/operator/*` is guarded in `proxy.ts` and again in the layout.

The native apps sign in through the same `/auth/start` and `/auth/callback`, opened in the system's auth
session with `client`, a PKCE `challenge` and their own `state`. The callback sets no cookie for them: it
redirects to `<bundle id>://auth` with a 60-second one-time code, only for an app named in the config's
`mobile` block. The app exchanges the code and its verifier at `POST /api/v1/auth/device` for a device session
(`aqd_…`; it never does operator work, whatever the person's role), sent as a bearer token. Sessions live in `apps/web/lib/devices` behind a
`DeviceSessionStore` (a JSON file in `DATA_DIR` for now), stored as an HMAC keyed with `SESSION_SECRET`. They
end after 90 days unused, on sign-out or revocation, when the user is suspended, or when `SESSION_SECRET`
changes. With `surfaces.mobile` off, a device session gets 403 `mobile_off`. Sign-in addresses are built from
the configured domain, or else the address the request came in on, so a phone reaching a development server
at another address comes back to it.

**The console on phones** (`surfaces.mobileConsole`, off in both presets; `docs/mobile/plan.md` §18) has its
own session, so that a phone alone is never enough to administer an instance. `apps/web/lib/operator-devices`
holds it:

- *Sign-in.* `/auth/start` with `purpose=operator` asks the provider for a new sign-in (`prompt=login`,
  `max_age=0`). The callback gives a one-time code only if the provider says the sign-in happened in the last
  5 minutes (`auth_time`) and marks the identity an operator; otherwise the app gets `not_fresh` or
  `not_operator`. `POST /api/v1/auth/operator-device` exchanges the code, the PKCE verifier and the phone's
  P-256 public key for an operator device session (`aqo_…`): 7 days idle, 30 days absolute, no builder key.
- *Proofs.* The token alone does nothing. The phone asks for a nonce (`POST /operator/device/challenge`:
  single use, 60 seconds) and signs it with the key in its secure hardware, which it does only after a face
  or fingerprint. An unlock signature (`livepeer-operator-unlock\n<nonce>`) opens reads for 5 minutes. A
  change needs its own signature over `livepeer-operator-confirm\n<nonce>\n<operation>\n<input hash>`, sent
  as `X-Operator-Proof: <nonce>.<signature>`; the input hash is base64url SHA-256 of the whole input as
  canonical JSON, and the instance recomputes it from what arrived. Test vectors for the apps are in
  `docs/mobile/fixtures/operator_proof_vectors.json`.
- *One gate.* `authenticate()` (`lib/public-api/auth.ts`) recognises `aqo_` before `aqd_` and returns a caller
  with `via: "operator_device"`. `runOperation` (`lib/public-api/dispatch.ts`) is the only place a request
  reaches an operation's `run`, for REST and MCP both, and for that caller it checks in order: the flag; a
  per-session rate limit; the operation is an operator operation marked `mobile` in `operations.ts` (an
  allow-list: no mark is 403 `web_only`) or one of five the session itself needs (`get_instance`, `get_me`,
  challenge, unlock, sign out; anything else a user can do is 403 `operator_session`); a read needs the
  session unlocked (401 `locked`); a change needs a valid unused proof for exactly this operation and input
  (401 `proof_required`), and five refused proofs in a row revoke the session. A phone's change takes its
  input from the body and path only, never the query string. MCP refuses an `aqo_` token outright. The
  `operator(context)` guard inside each operator operation stays as the second line, and `checkAccess` (the
  web role guard) is unchanged: an `aqo_` token never opens `/operator` pages and never becomes a cookie.
- *Record.* Every sign-in, unlock, change, refusal and revocation is written to the audit log
  (`DATA_DIR/operator-audit.json`), shown with the enrolled phones on the web console's System page, where
  phones are revoked. Every console page says so for two days after a phone is enrolled.
- *Clients.* `pnpm api:openapi` writes these operations with `x-operator` and `x-mobile`;
  `packages/mobile-codegen` generates them into a separate `OperatorAPI` (Swift) and `OperatorApi` (Kotlin)
  that take an operator transport, and every change takes an `OperatorProof` argument.

**Alerts to operators' phones** (`docs/mobile/plan.md` §18.9; the server half is built, the apps are not) tell
a phone that something needs its operator and where to look. Nothing can be done from a notification.

- *What triggers one.* `apps/web/lib/alerts/decide.ts` is the rules as one pure step: what was known, one
  observation, what to send. The engine not ready on two checks a minute apart (and "ready again" after two
  good ones, to the phones that were told); Status's own failing-jobs rule starting; a report being filed;
  a phone being enrolled. The sentences are Status's (`ATTENTION` in `operations.ts`), and
  `alerts/compose.ts` builds every notification from a closed list of them, with at most a count.
- *Who notices.* `apps/web/instrumentation.ts` starts one watcher per server process
  (`alerts/watcher.ts`): the only thing in the instance that runs between requests. Each minute, while the
  console is offered on phones and some phone has alerts on, it reads the engine's health, and every five
  minutes recent jobs, through `buildReaderClient()`: the operator client with the reader token and no admin
  token. A lease in `DATA_DIR/operator-alerts.json` keeps a second process quiet. Reports and enrolments are
  raised where they happen (`report_character`, `create_operator_device_session`) and sent without holding
  up the request.
- *Where a push token lives.* On the phone's operator device session record, sealed with `SESSION_SECRET`,
  set only by `operator_set_alerts`, which needs a proof bound to that push token. It is never answered,
  logged or written to the audit log, and it ends with the record, however that ends. A phone whose console
  has idled out is kept, signed out, to its 30-day end while alerts still reach it.
- *Sending.* `apps/web/lib/push` has one `PushSender` interface and three implementations with no
  dependency: APNs over `node:http2` with a signed ES256 token, Firebase Cloud Messaging's HTTP v1 API as a
  service account, and one that only records to `DATA_DIR/push-outbox.json`, which mock-only mode always
  uses. Credentials are environment variables (`APNS_KEY`, `APNS_KEY_ID`, `APNS_TEAM_ID`,
  `FCM_SERVICE_ACCOUNT`); the Android app's public Firebase values are config (`mobile.android.firebase`) and
  are served in `get_instance`. A dead push token is dropped and the phone shows as not reached; refused
  credentials are remembered for the System page; every send is an `alert` entry in the audit log.

The instance has a Postgres database (`packages/db`, plan and progress in `docs/database.md`). `DATABASE_URL`
decides whether it is used: set, `apps/web/lib/data/database.ts` hands out one connection pool per process;
empty, the instance keeps its state in files, which is how `pnpm dev`, tests and CI run. Migrations are SQL
files generated by `pnpm db:generate` from `packages/db/src/schema.ts` and committed; `pnpm db:migrate`, the
bundle's `migrate` service and a serverless host's build all run the same bundled runner, under an advisory
lock, in one transaction. `/api/health` reports the database as `ok`, `behind`, `unreachable` or `none`. The
database is migrated and empty so far: no state has moved into it yet.

Each kind of state the instance keeps has its own store interface, asynchronous, with one method per thing
asked of it: `DeviceSessionStore`, `OperatorDeviceStore`, `AuditStore`, `ModerationStore`, `AlertsStore` and
`OutboxStore`, each beside the service that holds its rules. Each has an implementation over a document
read and written whole (`apps/web/lib/data`: a JSON file in `DATA_DIR`, or memory in tests), and the session
and audit stores have one over Postgres (`postgres.ts` beside each); `chosenStore` picks by whether the
instance has a database, so nothing above a store knows which it has. One contract test suite per store runs
against both. In Postgres a person's name and email are one sealed value per row (`lib/data/identity.ts`,
encrypted with `SESSION_SECRET`), kept only because the provider can't yet answer `getUser`; no column reads
as a person. The remaining stores (moderation, alerts, outbox) are files until their slices. Device sessions use it, and so does
`apps/web/lib/moderation`: reports of shared characters, what each person blocked, and what the operator took
down. Every character read (`list_characters`, `get_character`, the web's pages and Home's cast) filters
through `moderation().visible(userId)`; the console's Reports page decides reports.

## Self-hosting

`deploy/compose.yaml` references published images by `${REGISTRY}/${ORG}/...` tags read from
`release.config.json`: app, engine (pinned ref), Clearinghouse Batteries, node remote signer, discovery.
`livepeer setup --preset full|headless [--config file] [--json]` writes `.env` (generated secrets),
`instance.config.json` and starts the bundle; it is idempotent. `livepeer doctor` checks engine, provider,
config and keys, with exit codes. `livepeer upgrade` moves app and engine pins together. Because the engine
and Batteries publish no images today (engine request R6), the bundle builds them from pinned Git contexts
until they do, and mock-only mode needs neither. The app keeps its own state (device sessions) in the
`app-data` volume at `/data`.

## Live versus mocked (summary; full table in `docs/data-sources.md`)

Live: discovery, runners, jobs (sync run, list, get, cost), cost summary and projections, allowance,
actors, keys, grants and allocations (with a real admin key), readiness.
Mocked: async jobs and results, sessions, events, conversations, library, characters, plans, billing,
retail revenue, compute performance, instance content.
