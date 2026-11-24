# Data sources

Every API client function, whether it is live or mocked, and what blocks the mocked ones. The map itself is
`packages/api-client/src/data-sources.ts`; `MOCK_ONLY=1` forces every function to its mock.

To switch a function from mock to live: implement it in `packages/api-client/src/live/`, branch on
`resolveSource()` in `src/index.ts`, set its entry to `"live"` in `data-sources.ts`, and update this table.

| Function | Source | Endpoint (used or planned) | Token | Blocked by | Mobile |
|----------|--------|----------------------------|-------|------------|--------|
| `listOfferings` | live | `GET /v1/offerings` | none (public) | — | Slices 2–3 |
| `getCreditBalance` | mock | `GET /v1/allowance` → credits via markup rule | builder key | Needs a signed-in builder key (auth lands in slice a) and the markup rule. | Slices 1, 6 |
| `listShowcase` | mock | instance content (config or library) | — | No engine endpoint; instance-owned. No screen reads it today: the gallery came off Home (decision 105) and waits for a discovery view. | Not used on mobile (decisions 102 and 104) |
| `listPromptStarters` | mock | instance content (config) | — | No engine endpoint; instance-owned. | Built (iOS sample) |
| `createGeneration` | mock | `POST /v1/jobs` with `mode: "async"` | builder key | Engine returns 501 for async jobs; no video generation capability is on the live network today. | Slice 3 |
| `getGeneration` | mock | `GET /v1/jobs/{id}` + `GET /v1/jobs/{id}/result` | builder key | `/result` returns 501. | Built (iOS sample) |
| `listConversations`, `getConversation`, `createConversation`, `sendMessage`, `deleteConversation` | mock | instance-owned store + agent runtime calling `POST /v1/jobs` per tool step | builder key | No agent runtime yet; it depends on async jobs and results (501). The live `chat` capability can answer text turns once paid jobs are approved. A request that names only the kind of thing ("make a video") gets a question back and no generation; the mock agent reads the next message as the rest of that request, which the real agent will do from the conversation itself. A message's `agent_model` names the language model that runs the agent (the mock echoes it on the user message and its planning steps). A message's `character_slug` casts a character: the mock agent starts an `image-to-video` shot with the portrait as `first_frame` and echoes the cast on the user message; the real agent will pass the portrait as the job's image input, as an absolute URL or an upload, since the engine cannot read the app's relative paths. | Built (slice 2): send with attachments, a cast and a model; list and delete |

This table covers what is built so far. The full client is specified in `docs/architecture.md`.

## Added in slice (d)

| Function | Source | Endpoint (used or planned) | Token | Blocked by | Mobile |
|----------|--------|----------------------------|-------|------------|--------|
| `listMedia`, `deleteMedia` | mock | Instance-owned media store; descriptions and tags from a video understanding capability | builder key | No media store or understanding capability on the network yet. | Built (slice 4) |
| `requestUpload`, `receiveUpload`, `readMediaFile` | mock | Instance-owned media store. `request_upload` (POST /api/v1/uploads) checks a file and answers with a ticket; the file itself is PUT to `/api/v1/uploads/{id}` and the library item comes back; an uploaded picture is served at `/api/media/{id}` | builder key | No media store. The mock keeps the newest 24 pictures in memory so they can be shown, and of a video records only that it arrived; both are lost on restart. How the engine takes an input file is open (engine-requests Q17). | Built on iOS and Android (decision 106) |
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

## Workspaces (23 November 2026)

Shared accounts, on mocked data until PymtHouse has them (`docs/workspaces.md`; questions Q18 to Q24 in
`docs/engine-requests.md`). Every function goes through the provider interface's `workspaces` area, so each
switches to live when that provider is connected. The person's role is read from the provider on every call
and checked with `can()` in `packages/api-client/src/workspaces.ts`.

| Function | Source | Endpoint (used or planned) | Token | Blocked by | Mobile |
|----------|--------|----------------------------|-------|------------|--------|
| `listAccounts` | mock, through the provider interface | `workspaces.listForUser`, `workspaces.listInvitationsForUser`, `budgets.getAllocation` per account | session | Q18, Q19 | iOS and Android: `list_accounts`, `switch_account`, and the current account in `get_me` (`docs/mobile/plan.md` §19) |
| `createWorkspace`, `renameWorkspace` | mock, through the provider interface | `workspaces.create`, `workspaces.rename` | session | Q18 | Not on mobile |
| `getWorkspace` | mock, through the provider interface | `workspaces.get`, `listMembers`, `listInvitations`, `usage.getUsageByMember` | session | Q19, Q21 | Not on mobile |
| `inviteMember`, `revokeInvitation`, `getInvitation`, `acceptInvitation`, `declineInvitation` | mock, through the provider interface | `workspaces.invite`, `revokeInvitation`, `getInvitation`, `acceptInvitation`, `declineInvitation` | session | Q20. The mock sends no email; the invitation's link is copied from the page. | Not on mobile |
| `setMemberRole`, `removeMember`, `leaveWorkspace`, `transferOwnership` | mock, through the provider interface | `workspaces.setMemberRole`, `removeMember`, `transferOwnership` | session | Q19 | Not on mobile |
| `getMemberUsage` | mock, through the provider interface | `usage.getUsageByMember` | session | Q21, and the engine recording who a job was run for (R10) | Not on mobile |

In a workspace the existing account functions act on the workspace's account id instead of the person's:
`getCreditBalance`, `getAccount`, `buyCreditPack`, `buyCredits`, `changePlan` (owner only), `getUsage` (a
member sees their own entries), and `listApiKeys`, `createApiKey`, `revokeApiKey` (owner and admins). The mock
library, characters, conversations and keys are kept per account: a workspace's library and private characters
are shared by its members, its chats are each member's own, and a personal account keeps what it had. An API
key made in a workspace calls the instance API in that workspace (`verifyApiKey` answers with its
`workspace_id`).

The session cookie names the current workspace (`workspaceId`); `workspaceOf` in `apps/web/lib/api.ts` asks
the provider whether the person still belongs on every request. A native app's device session record carries
the same pointer (`workspaceId` in `apps/web/lib/devices/store.ts`), written only by `switch_account` and
checked the same way, so on a phone every existing operation acts in the account the app chose.

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
| `getCapabilitySetting`, `updateCapabilitySetting`, `resetCapabilitySettings` | live (the instance's own state) | What the console saved, laid over the config the instance was deployed with (`capability_settings` in Postgres, or `DATA_DIR/instance-settings.json` without a database), through the `CapabilityStore`; reset forgets it. In the effective config: switched off is an exact entry in `capabilities.block`, where it appears is `capabilities.overrides[app].surfaces`, markup is `pricing.markup.perApp[app]` | — | Users are served and priced from the same file, so a change applies on their next request. |
| Provider: grants, allocations, plans, credit packs (list, create, edit), usage, users | per `payments.provider` | see the provider interface | reader / admin | `mock` by default; `batteries` reads allocations and grants through the engine. |
| `listWorkspaces`, `getWorkspace`, `setWorkspaceStatus` | mock | `provider.workspaces.list`, `get`, `listMembers`, `listInvitations`, `setStatus`, with `budgets.getAllocation`, `plans.getUserPlan` and `usage.getUsageByMember` for each | reader / admin | Blocked by Q18 to Q24. A workspace's plan and top-up use the same provider functions as a user's, given the workspace's id. Invitation links are never sent to the console. |
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
functions either. They are kept by `apps/web/lib/devices` behind the `DeviceSessionStore` interface: in Postgres
(`device_sessions`, `device_sign_in_codes`) when the instance has `DATABASE_URL`, and in
`DATA_DIR/device-sessions.json` when it doesn't, which is development and tests. The store holds
an HMAC of each token keyed with `SESSION_SECRET`, never the token, and the user's builder key sealed as the
browser session cookie holds it.

| Operation | Does | Token |
|-----------|------|-------|
| `create_device_session` | Exchanges the one-time code from a native sign-in, with its PKCE verifier, for a device session | none (the code is the credential) |
| `end_device_session` | Signs the calling device out | its device session |
| `list_accounts` | The accounts the person can work in (`listAccounts`): their own and each workspace with their role and its balance, which is current, and invitations waiting, each without the link that answers it | a device, browser session | iOS and Android |
| `accept_invitation`, `decline_invitation` | Answers an invitation waiting for the signed-in person, by its id (`acceptInvitation`, `declineInvitation`). The id is looked up in their own waiting invitations (`listAccounts`), so it can't answer anyone else's, and the link that answers an invitation never leaves the instance. Accepting from a device session also points it at the workspace | a device, browser session | iOS and Android |
| `switch_account` | Works in another of the person's accounts: checks they belong (`listAccounts`), then writes the workspace's id on the device session record. Refused to anything but a device session (`device_only`) and left out of MCP | a device session | iOS and Android |
| `get_me` | The signed-in person, their balance (`getCreditBalance`) and their `role`, so an app knows whether to offer the console; and `account`, the account they are working in | a device, operator device or browser session |
| `list_devices`, `revoke_device` | The person's device sessions; sign one out | a device or browser session |

**Operator device sessions** (`aqo_…`) are what let an operator's phone open the console (`docs/mobile/plan.md`
§18). They are a separate record, token and file from users' device sessions: `apps/web/lib/operator-devices`
keeps sessions, pending sign-ins and pending nonces, and the audit log (the newest 2,000 entries), behind
`OperatorDeviceStore` and `AuditStore`: in Postgres (`operator_device_sessions`, `operator_sign_in_codes`,
`operator_challenges`, `operator_push_tokens`, `operator_audit`), or without a database in
`DATA_DIR/operator-device-sessions.json` and `DATA_DIR/operator-audit.json`. In Postgres a person's name and
email are sealed with `SESSION_SECRET`, never in the clear.
The store holds an HMAC of each token, code and nonce keyed with `SESSION_SECRET`, the phone's P-256 public
key, and no builder key. A session ends after 7 days unused, 30 days after it was made, on sign-out or
revocation, at five refused proofs in a row, when the person is suspended or loses the operator role in the
console, or when `SESSION_SECRET` changes. With `surfaces.mobileConsole` off every request carrying one gets
403 `mobile_console_off`.

The engine's reader and admin tokens stay inside `buildOperatorClient()` on the server, as for the web
console. A phone sends its `aqo_` token and, for a change, an `X-Operator-Proof`; it receives JSON.

| Operation | Does | Token | Mobile |
|-----------|------|-------|--------|
| `create_operator_device_session` | Exchanges the one-time code from an operator's native sign-in, with its PKCE verifier and the phone's public key, for an operator device session | none (the code is the credential) | iOS and Android (plan §18.8) |
| `delete_operator_device_session` | Signs the phone out of the console | its operator device session | iOS and Android |
| `create_operator_challenge` | A single-use, 60-second nonce: to unlock, or for one named change and the hash of its input | its operator device session | iOS and Android, to unlock and for each change |
| `unlock_operator_device_session` | Opens reads for 5 minutes, for the phone key's signature over an unlock nonce | its operator device session | iOS and Android |
| `operator_status` | Health (`getEngineHealth`), today's figures (`getOverview`), failures in the last hour (`listJobs`) and open reports, with the list of what needs attention | the operator role; on a phone, unlocked | iOS and Android: the Status screen |
| `operator_overview`, `operator_health`, `operator_list_jobs`, `operator_list_users`, `operator_list_reports` | The console's reads a phone may make. Jobs take `status` and `before`; users take `query` | the operator role; on a phone, unlocked | iOS and Android use `operator_list_jobs` (Jobs and a job's page), `operator_list_users` (Users, a user's page) and `operator_list_reports` (Reports, a report's page). Stage 2 also uses `operator_overview` (Revenue and margin) and `operator_health` (System); |
| `operator_costs`, `operator_list_grants`, `operator_list_plans`, `operator_list_compute`, `operator_list_capabilities` | Stage 2's reads: network cost by outcome and capability (`getCostSummary`), grants (`provider.budgets.listGrants`), plans (`provider.plans.listPlans`), compute operators from recent jobs (`listComputeOperators`, mocked), and every discovered capability with whether the instance offers it (`listOfferings` with `getCapabilitySetting` and the capability labels) | the operator role; on a phone, unlocked | iOS stage 2 (More); |
| `operator_resolve_report`, `operator_set_user_status` | The two changes a phone may make | the operator role; on a phone, a proof each time | iOS and Android |
| `operator_list_devices`, `operator_revoke_device`, `operator_revoke_all_devices` | The phones enrolled for the console, each with whether alerts reach it; revoke one or all | the operator role, web or API only | Not on mobile |
| `operator_list_audit` | What operators' phones did and were refused, and each alert sent to one | the operator role, web or API only | Not on mobile |
| `operator_get_alerts` | This phone's alerts: whether the instance can send to its platform, which kinds are on, when they end. Never the push token | its operator device session, unlocked | iOS and Android: More ▸ Alerts (plan §18.8) |
| `operator_set_alerts` | Chooses the kinds and where to send them (`kinds`, `push_token`, on iOS `environment`); no kinds turns alerts off | its operator device session, a proof each time, bound to the push token | iOS and Android: More ▸ Alerts |
| `operator_test_alert` | Sends this phone "Alerts reach this phone.", three an hour | its operator device session, a proof each time | iOS and Android: More ▸ Alerts |

**Alerts to operators' phones** (plan §18.9) are sent by the instance itself, straight to Apple and Google
with the publisher's own credentials (`APNS_KEY`, `APNS_KEY_ID`, `APNS_TEAM_ID`, `FCM_SERVICE_ACCOUNT`), from
`apps/web/lib/push`. They are not API client functions and have no mock in the data-source map: in mock-only
mode the sender only records what it would have sent, in `push_outbox` or `DATA_DIR/push-outbox.json`, and offers both
platforms. What triggers an alert is read through the operator client's existing functions (`getEngineHealth`
every minute and `listJobs` every five, on a client holding the reader token and no admin token) and from the
instance's own reports. Neither real sender has been run against Apple or Google yet.

Every other operator operation has no `mobile` mark and is refused to a phone with 403 `web_only`.
`operator_list_jobs` filters and pages by cutting from the engine's newest 500 jobs, because `GET /v1/jobs`
takes only a limit (see `docs/engine-requests.md`).

**Reports, blocks and characters taken down** belong to the instance too: the app stores require them of an
app where people share characters. `apps/web/lib/moderation` keeps them behind `ModerationStore`: in Postgres
(`character_reports`, `character_blocks`, `hidden_characters`), or without a database in
`DATA_DIR/moderation.json`. Who reported is kept, so a second report from the same
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
