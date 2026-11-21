# Data sources

Every API client function, whether it is live or mocked, and what blocks the mocked ones. The map itself is
`packages/api-client/src/data-sources.ts`; `MOCK_ONLY=1` forces every function to its mock.

To switch a function from mock to live: implement it in `packages/api-client/src/live/`, branch on
`resolveSource()` in `src/index.ts`, set its entry to `"live"` in `data-sources.ts`, and update this table.

| Function | Source | Endpoint (used or planned) | Token | Blocked by | Mobile |
|----------|--------|----------------------------|-------|------------|--------|
| `listOfferings` | live | `GET /v1/offerings` | none (public) | — | Slices 2–3 |
| `getCreditBalance` | mock | `GET /v1/allowance` → credits via markup rule | builder key | Needs a signed-in builder key (auth lands in slice a) and the markup rule. | Slices 1, 6 |
| `listShowcase` | mock | instance content (config or library) | — | No engine endpoint; instance-owned. | Built (iOS sample) |
| `listPromptStarters` | mock | instance content (config) | — | No engine endpoint; instance-owned. | Built (iOS sample) |
| `createGeneration` | mock | `POST /v1/jobs` with `mode: "async"` | builder key | Engine returns 501 for async jobs; no video generation capability is on the live network today. | Slice 3 |
| `getGeneration` | mock | `GET /v1/jobs/{id}` + `GET /v1/jobs/{id}/result` | builder key | `/result` returns 501. | Built (iOS sample) |
| `listConversations`, `getConversation`, `createConversation`, `sendMessage`, `deleteConversation` | mock | instance-owned store + agent runtime calling `POST /v1/jobs` per tool step | builder key | No agent runtime yet; it depends on async jobs and results (501). The live `chat` capability can answer text turns once paid jobs are approved. A message's `agent_model` names the language model that runs the agent (the mock echoes it on the user message and its planning steps). A message's `character_slug` casts a character: the mock agent starts an `image-to-video` shot with the portrait as `first_frame` and echoes the cast on the user message; the real agent will pass the portrait as the job's image input, as an absolute URL or an upload, since the engine cannot read the app's relative paths. | Built (slice 2): send with attachments, a cast and a model; list and delete |

This table covers what is built so far. The full client is specified in `docs/architecture.md`.

## Added in slice (d)

| Function | Source | Endpoint (used or planned) | Token | Blocked by | Mobile |
|----------|--------|----------------------------|-------|------------|--------|
| `listMedia`, `deleteMedia` | mock | Instance-owned media store; descriptions and tags from a video understanding capability | builder key | No media store or understanding capability on the network yet. | Built (slice 4) |
| `listAgentModels` | mock | Live: `GET /v1/offerings` plus each language app's runners (`describeApps`, reader token, server-side) | builder key + reader | Mock while the agent is: the model menu picks a model for the mock agent, so it lists the mock agent's models (`mock/agent-models.ts`, real open models with their published context sizes). Switch to live together with `createConversation` and `sendMessage`. The live path is built and tested. | Built (slice 2) |
| `listCharacters`, `getCharacter`, `createCharacter` | mock | Instance-owned store | session | Needs the instance database (not built). | Built (slice 5) |
| `getCreditBalance`, `getAccount`, `buyCreditPack`, `buyCredits`, `changePlan`, `getUsage` | mock, through the provider interface | `budgets.getAllocation` → `GET /v1/allowance?actor_id=`; plans and packs from the provider | reader / builder key | Batteries has no plans, packs, top-ups of the user's own amount (`buyCredits`, limits from `plans.getTopUpRange`) or per-user usage; PymtHouse isn't wired into the engine. The Batteries provider is implemented and unit-tested, but its write request bodies are not verified against a live admin key. | Built (slices 1, 6): balance, plan and usage; nothing is bought on phones |
| `listApiKeys`, `createApiKey`, `revokeApiKey` | mock | `GET/POST /v1/admin/keys`, `…/revoke` | admin token | The `.env` admin token is an actor key (403). | Not on mobile |
| `getPreferences`, `updatePreferences` | mock | Instance-owned store | session | Needs the instance database. | Built (slice 6) |
| `deleteAccount` | mock, through the provider interface (`identity.deleteUser`) | The identity provider's user deletion | session | Batteries can't delete a user (engine question Q14); the mock provider removes the user, their allocation and plan. | Built (slice 6) |
| `runCapability` | mock | `POST /v1/jobs` | builder key | Paid; needs a builder key and the owner's go-ahead. | Not on mobile |

## Added in slice (e)

| Function | Source | Endpoint (used or planned) | Token | Blocked by | Mobile |
|----------|--------|----------------------------|-------|------------|--------|
| `analyseVideo` | mock | `POST /v1/jobs` against a video understanding capability | builder key | No such capability is on the network; paid. | Built (slice 2), through the agent |
| `startLiveSession`, `updateLiveSession`, `stopLiveSession` | mock | `POST /v1/sessions` and its update and close calls | builder key | `POST /v1/sessions` returns 501 (engine request R2). | Planned, after live sessions |
| `getLiveHealth` | mock | `GET /v1/events` for the session | builder key | The events feed returns 501. | Planned, after live sessions |
| `listLiveLooks`, `saveLiveLook`, `listLiveDestinations`, `addLiveDestination`, `removeLiveDestination` | mock | Instance-owned store; stream keys sealed server-side | session | Needs the instance database. | Planned, after live sessions |
| `startCall`, `endCall` | mock | `POST /v1/sessions` against a real-time character capability | builder key | Sessions return 501; no avatar capability on the network. | Planned, after live sessions |
| `listExampleApps` | mock | Instance content | — | Instance-owned. | Not on mobile |

## Operator console (slice f)

The map is `OPERATOR_DATA_SOURCES` in `packages/api-client/src/operator/index.ts`; the System page shows it.
Reads use `ENGINE_READER_TOKEN`; writes use `ENGINE_ADMIN_TOKEN`.

| Function | Source | Endpoint | Token | Notes |
|----------|--------|----------|-------|-------|
| `getEngineHealth` | live | `GET /readyz` | none | Verified against the running engine. |
| `listOfferings` | live | `GET /v1/offerings` | none | Verified. The user client lists only what the instance offers (`offers`, from `capabilities.allow`/`block`) and refuses to run anything else (`NotOffered`, 403 `not_offered` on the API); the same holds for `listAgentModels`. |
| `listJobs` | live | `GET /v1/jobs?limit=` | reader | Verified. No filter by state, app or actor (engine request R4). |
| `listActors` | live | `GET /v1/admin/actors` | reader | Verified. |
| `listAccessKeys` | live | `GET /v1/admin/keys` | reader | Verified. |
| `getCostSummary` | live | `GET /v1/costs/summary?start=&end=` | reader | Verified. |
| `listRunners` | live | `GET /v1/runners?app=` | reader | Names the model behind each app (`apps/web/lib/models.ts`, cached 5 minutes; media tools skipped): language models in the agent picker, the others in the studio picker and the agent's steps: `runnerModel` reads both live description shapes (`model.name` / `limits.context_tokens`, and `model_id` / `max_context`). The one user-facing read made with the reader token; it stays on the server and only model names and context sizes reach the page. Goes away when R1 lands. |
| `issueAccessKey`, `revokeAccessKey` | live | `POST /v1/admin/keys`, `…/revoke` | admin | Not verified: the `.env` admin token is an actor key, so the engine answers 403. The console says so. |
| `setActorStatus` | live | `POST …/allocation/status` | admin | Not verified, same reason. |
| `getOverview` | mock (derived) | jobs + cost summary | reader | Counts and wholesale cost are live; revenue is wholesale at the default markup until a provider reports charges. |
| `listComputeOperators` | derived from `listJobs` | — | reader | Live when jobs are live. |
| `setComputeOperatorBlocked` | mock | — | — | The engine has no allow or block list for routing. |
| `retryJob` | mock | — | — | No retry route. |
| `listPayments`, `refundPayment`, `getBillingSettings`, `updateBillingSettings` | mock | provider or card processor | — | Who collects payment is open question Q2. |
| `getCapabilitySetting`, `updateCapabilitySetting` | live (instance config) | `instance.config.json`, through the `CapabilityStore`: switched off is an exact entry in `capabilities.block`, where it appears is `capabilities.overrides[app].surfaces`, markup is `pricing.markup.perApp[app]` | — | Users are served and priced from the same file, so a change applies on their next request. |
| Provider: grants, allocations, plans, credit packs (list, create, edit), usage, users | per `payments.provider` | see the provider interface | reader / admin | `mock` by default; `batteries` reads allocations and grants through the engine. |
| Instance settings | real | writes `instance.config.json`, validated | — | Read-only when the file is mounted read-only (the Compose bundle). |
| Doctor | real | probes engine and tokens | reader, admin | Same checks as `livepeer doctor`. |

## Instance API and MCP

`/api/v1/*` and `/api/mcp` call the same API client functions as the interface, so each operation is live or
mocked exactly as its function is above. `verifyApiKey` is mocked: user API keys are held in memory until
the instance has a database, and are checked against the engine's keys once sign-up provisions real ones.

## Native apps

The iOS and Android apps have no data-source map and no mock layer of their own. They call the instance's
`/api/v1`, whose operations call the functions above, so a function that goes live goes live for mobile too.
Development and tests point a build at an instance started with `MOCK_ONLY=1`. The **Mobile** column above
says which slice of `docs/mobile/plan.md` uses each function.

Two reads exist for clients that can't run the web's own code. Neither is in the data-source map: one reads
the instance config, the other is derived.

| Operation | Source | Reads | Token |
|-----------|--------|-------|-------|
| `get_instance` | config | `instance.config.json`: name, logo, theme overrides (resolved to sRGB hex), surfaces, the apps built for it (`mobile`), sign-in methods, content settings, home backdrop | none |
| `list_capability_labels` | derived from `listOfferings`, runner models (`describeApps`, reader token, server-side) and `listAgentModels` | The readable name of each capability and of each model the agent runs on, by the rules in `packages/user-app/src/lib/capability-menu.ts` | none |
| `list_agent_model_menu` | derived from `listAgentModels` | The agent's model menu, one row per model, by `agentModelEntries` in the same file | none |
| `list_studio_mediums` | derived from `listOfferings` | The studio's mediums and modes, by `describeStudio` in `packages/user-app/src/studio/mediums.ts`: each mode's capability, whether it is on offer and whether it needs an input. Modes the operator withdrew (switched off, or not placed in the studio) are left out, and a medium with none left is too | none |
| `get_privacy` | derived from the instance config (`privacy.retainChats`) | Who can see a job, by `describePrivacy` in `packages/user-app/src/settings/privacy-tiers.ts`, the words Settings ▸ Privacy uses on the web | none |
| `quote_generation` | mock (`quoteCredits`, as the web's studio uses) | What one result of a draft costs, in credits. Goes live with pricing from the engine's offerings and the instance's markup (`creditsFor`) when generation does | none |

Every `GET` answers with a weak `ETag` and `Cache-Control: private, no-cache`; a client that sends it back
as `If-None-Match` gets `304` with no body while nothing has changed. Both apps do, so following a long
render costs almost nothing.

**Device sessions** belong to the instance, not the engine or the provider, so they aren't API client
functions either. They are kept by `apps/web/lib/devices` in `DATA_DIR/device-sessions.json` (a database
replaces the file behind the same `DeviceSessionStore` interface when the instance gets one). The file holds
an HMAC of each token keyed with `SESSION_SECRET`, never the token, and the user's builder key sealed as the
browser session cookie holds it.

| Operation | Does | Token |
|-----------|------|-------|
| `create_device_session` | Exchanges the one-time code from a native sign-in, with its PKCE verifier, for a device session | none (the code is the credential) |
| `end_device_session` | Signs the calling device out | its device session |
| `get_me` | The signed-in person, their balance (`getCreditBalance`) and their `role`, so an app knows whether to offer the console | a device, operator device or browser session |
| `list_devices`, `revoke_device` | The person's device sessions; sign one out | a device or browser session |

**Operator device sessions** (`aqo_…`) are what let an operator's phone open the console (`docs/mobile/plan.md`
§18). They are a separate record, token and file from users' device sessions: `apps/web/lib/operator-devices`
keeps sessions, pending sign-ins and pending nonces in `DATA_DIR/operator-device-sessions.json`, and the audit
log (the newest 2,000 entries) in `DATA_DIR/operator-audit.json`, both behind the same `StateStore` interface.
The file holds an HMAC of each token, code and nonce keyed with `SESSION_SECRET`, the phone's P-256 public
key, and no builder key. A session ends after 7 days unused, 30 days after it was made, on sign-out or
revocation, at five refused proofs in a row, when the person is suspended or loses the operator role in the
console, or when `SESSION_SECRET` changes. With `surfaces.mobileConsole` off every request carrying one gets
403 `mobile_console_off`.

The engine's reader and admin tokens stay inside `buildOperatorClient()` on the server, as for the web
console. A phone sends its `aqo_` token and, for a change, an `X-Operator-Proof`; it receives JSON.

| Operation | Does | Token | Mobile |
|-----------|------|-------|--------|
| `create_operator_device_session` | Exchanges the one-time code from an operator's native sign-in, with its PKCE verifier and the phone's public key, for an operator device session | none (the code is the credential) | iOS design sample (plan §18.8); Android not yet |
| `delete_operator_device_session` | Signs the phone out of the console | its operator device session | Server built; apps not yet |
| `create_operator_challenge` | A single-use, 60-second nonce: to unlock, or for one named change and the hash of its input | its operator device session | iOS design sample, to unlock; changes not yet. Android not yet |
| `unlock_operator_device_session` | Opens reads for 5 minutes, for the phone key's signature over an unlock nonce | its operator device session | iOS design sample; Android not yet |
| `operator_status` | Health (`getEngineHealth`), today's figures (`getOverview`), failures in the last hour (`listJobs`) and open reports, with the list of what needs attention | the operator role; on a phone, unlocked | iOS design sample: the Status screen; Android not yet |
| `operator_overview`, `operator_health`, `operator_list_jobs`, `operator_list_users`, `operator_list_reports` | The console's reads a phone may make. Jobs take `status` and `before`; users take `query` | the operator role; on a phone, unlocked | iOS design sample uses `operator_list_jobs` (the Jobs list and a job's detail); the others not yet. Android not yet |
| `operator_resolve_report`, `operator_set_user_status` | The two changes a phone may make | the operator role; on a phone, a proof each time | Server built; apps not yet |
| `operator_list_devices`, `operator_revoke_device`, `operator_revoke_all_devices` | The phones enrolled for the console; revoke one or all | the operator role, web or API only | Not on mobile |
| `operator_list_audit` | What operators' phones did and were refused | the operator role, web or API only | Not on mobile |

Every other operator operation has no `mobile` mark and is refused to a phone with 403 `web_only`.
`operator_list_jobs` filters and pages by cutting from the engine's newest 500 jobs, because `GET /v1/jobs`
takes only a limit (see `docs/engine-requests.md`).

**Reports, blocks and characters taken down** belong to the instance too: the app stores require them of an
app where people share characters. `apps/web/lib/moderation` keeps them in `DATA_DIR/moderation.json` behind
the same `StateStore` interface (`apps/web/lib/data`). Who reported is kept, so a second report from the same
person updates the first, and is never sent to anyone. `list_characters`, `get_character`, the web's
characters pages and Home's cast all leave out what the operator took down and what the person blocked.

| Operation | Does | Token |
|-----------|------|-------|
| `report_character` | Files a report of a shared character with a reason and a note | a device or browser session |
| `block_character` | Hides a character and everything by its author from the person | a device or browser session |
| `operator_list_reports`, `operator_resolve_report` | The console's queue; keep a character up or take it down | the operator role |

A mock-only instance still accepts one documented key, `MOCK_ONLY_DEMO_KEY`, for tests and scripts;
`verifyApiKey` refuses it unless `MOCK_ONLY=1`. The apps no longer send it: they sign in.

Suspending a user (`setActorStatus` to paused, from the console or `operator_set_user_status`) also ends their
device sessions and any operator device session they hold.
