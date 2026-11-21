# UI actions and their API functions

Every action a user can take maps to an API client function. Client-only actions (changing a draft, opening
a popover, switching theme) change local state and are not listed.

The **Mobile** column says where the native apps stand on each action (`docs/mobile/plan.md`). The apps reach
every function through the instance's `/api/v1`, so an action is only possible on mobile once its operation is
in `apps/web/lib/public-api/operations.ts`.

| Screen | Action | API function | Mobile |
|--------|--------|--------------|--------|
| Home | Load capability list for the picker | `listOfferings` | Not on mobile: the agent picks; casting reads `list_capability_labels` to know image to video is on offer |
| Home | Load starting points | `listPromptStarters` | Built (iOS sample) |
| Home | Load example gallery | `listShowcase` | Built (iOS sample) |
| Home | Send a request | `createConversation` | Built (iOS sample) |
| Shell | List recent conversations (open sidebar) | `listConversations` | Built (slice 2): History, from Home, with search by title |
| Chat | Open a conversation | `getConversation` | Built (iOS sample); from History by its id in slice 2 |
| Chat | Send a follow-up | `sendMessage` | Built (iOS sample) |
| Chat | Follow the agent's steps | `getConversation` | Built (iOS sample) |
| Chat | Follow a shot rendering | `getGeneration` | Built (iOS sample) |
| Chat | Open a shot in the studio | Navigation with the shot's prompt; `getGeneration` in the studio from slice (c). | Built (slice 3) |
| Sign-in | Choose a method (Google, Apple, Discord, wallet, email, passkey), sign out | Auth provider (`authorizationUrl` with the method, `exchange`); see `apps/web/lib/auth`. On mobile: the same flow in the system auth session, then `create_device_session`; sign out is `end_device_session`. Wallet and Coinbase aren't offered on phones yet (engine question Q12). | Built (slice 1) |
| Shell (mobile) | Open the account tray: name, email, credits | `get_me` (session identity and `getCreditBalance`) | Built (slice 1) |
| Shell (mobile) | Choose the theme (system, dark, light) | Kept on the device; no API function | Built (slice 1) |
| History (mobile) | Delete a conversation (swipe, then confirm) | `deleteConversation` (`delete_conversation`) | Built (slice 2) |
| Settings · Devices | List signed-in phones and tablets, sign one out | `list_devices`, `revoke_device` (device sessions, `apps/web/lib/devices`); on the web `revokeDeviceAction` | Built (slice 6); this phone signs out from the account tray instead |
| Shell | Show credit balance | `getCreditBalance` | Built (slice 1): the account tray, through `get_me` |
| Studio (video, image, audio) | Load capabilities for the medium and mode | `listOfferings` | Built (slice 3): `list_studio_mediums`, the web's mediums resolved against the network, less what the operator withdrew |
| Studio | Generate (once per variant) | `createGeneration`, priced first with `quote_generation` | Built (slice 3) |
| Studio | Follow a render | `getGeneration` | Built (slice 3) |
| Studio | Improve prompt, attach frames/references, download, open in chat | Not wired in the sample; `enhancePrompt`, `uploadMedia`, `getMediaUrl`, `createConversation` in slices (b)–(c). | Not on mobile until `uploadMedia` exists: modes that need an input (References, Edit) aren't offered on phones |
| Library | List, search by content, filter by type | `listMedia` | Built (slice 4) |
| Library | Delete | `deleteMedia` | Built (slice 4) |
| Library | Open in studio | Navigation with the item's prompt | Built (slice 4) |
| Library | Ask about it | `createConversation` with the item in `attachment_ids` | Built (slice 4) |
| Library | Convert or export | Opens the capability's run screen → `runCapability` | Not on phones: it opens the Developers pages, which stay on the web |
| Characters | List mine and shared, search | `listCharacters` (shared ones open to guests; nothing for adults only, taken down or blocked) | Built (slice 5) |
| Characters | Open one | `getCharacter` | Built (slice 5) |
| Characters | Create | `createCharacter` | Built (slice 5); always private-or-shared, never for adults only, on phones |
| Characters | Start chatting | `createConversation` | Not on phones: conversations have no in-character mode yet, so the web's button starts an ordinary conversation (plan, slice 5) |
| Characters | Report a shared character, with a reason | `report_character` (instance-owned, `apps/web/lib/moderation`); on the web `reportCharacterAction` | Built (slice 5) |
| Characters | Block a shared character and its author | `block_character` (instance-owned); on the web `blockCharacterAction` | Built (slice 5) |
| Developers | List capabilities | `listOfferings` | Not on mobile |
| Developers | Run a capability | `runCapability` | Not on mobile |
| Developers | List, create, revoke keys | `listApiKeys`, `createApiKey`, `revokeApiKey` | Not on mobile |
| Settings | Change a preference, confirm age, switch adult content | `updatePreferences` | Built (slice 6): shape, length, saving conversations and asking before spending. Adult content is shown, never switched: the API refuses it from a device session (`web_only`) |
| Settings | See plan, packs and balance | `getAccount`, `getCreditBalance` | Built (slice 6): balance and plan only; packs aren't shown, since nothing is bought on phones (plan §11, option A) |
| Settings | Add credits (a pack) | `buyCreditPack` | Not yet: purchasing is undecided |
| Settings | Add credits (an amount of their own, within the operator's limits) | `buyCredits` | Not yet: purchasing is undecided |
| Settings | Choose, switch or cancel a plan | `changePlan` | Not yet: purchasing is undecided |
| Settings | See usage | `getUsage` | Built (slice 6) |
| Settings | Read who can see a job | `get_privacy` (`describePrivacy`, the instance's `privacy.retainChats`) | Built (slice 6) |
| Settings | Delete the account | `deleteAccount` (`delete_account`: also signs out every device and forgets the person's blocks); on the web `deleteAccountAction` | Built (slice 6) |
| Settings | Sign out | `POST /auth/sign-out`; on phones `end_device_session` from the account tray | Built (slice 1) |
| Chat, Home | Attach a video from the library | `listMedia`, then `createConversation` / `sendMessage` with `attachment_ids` | Built (slice 2) |
| Chat, Home | Pick the model that runs the agent | `listAgentModels`, then `createConversation` / `sendMessage` with `agent_model` | Built (slice 2): `list_agent_model_menu`, the same rows as the web |
| Chat, Home | Put a character in a video (cast picker in the composer) | `listCharacters` (own, then public; mature only if shown), then `createConversation` / `sendMessage` with `character_slug` | Built (slice 2); mature characters aren't listed on phones (section 12 of the plan) |
| Characters | Make a video with this character (opens Home with `?with=<slug>`) | `getCharacter`, then `createConversation` with `character_slug` | Built (slice 5): "Cast them in a scene" puts them in Home's composer |
| Chat | Summarise, find moments, ask about a video | `sendMessage` (the agent calls a video understanding capability) | Built (slice 2) |
| Chat | Open a found moment in the studio | Navigation with the moment as the prompt | Built (slice 3) |
| Studio Live | Load looks and destinations | `listLiveLooks`, `listLiveDestinations` | Planned, after live sessions |
| Studio Live | Save a look | `saveLiveLook` | Planned, after live sessions |
| Studio Live | Add or remove a destination | `addLiveDestination`, `removeLiveDestination` | Planned, after live sessions |
| Studio Live | Go live, with recording on or off | `startLiveSession` | Planned, after live sessions |
| Studio Live | Change the look or prompt on air | `updateLiveSession` | Planned, after live sessions |
| Studio Live | Watch stream health | `getLiveHealth` | Planned, after live sessions |
| Studio Live | End the stream | `stopLiveSession` (a recorded session is saved to the library) | Planned, after live sessions |
| Characters | Call, end call | `startCall`, `endCall` | Planned, after live sessions |
| Developers | Run a video analysis in the playground | `analyseVideo` | Not on mobile |
| Developers | Open and close a session in the playground | `startLiveSession`, `stopLiveSession` | Not on mobile |
| Developers | Browse example apps | `listExampleApps` | Not on mobile |
| Operator · Overview | See users, jobs, revenue, cost, margin, engine status | `getOverview`, `getEngineHealth`, `listJobs` | iOS design sample: Status reads `operator_status` (plan §18.8). `operator_overview` and `operator_health` are served but not used by the app. Android not yet |
| Operator · Users | List users with email, budget, spent, remaining, plan | `provider.identity.listUsers`, `listActors`, `provider.budgets.getAllocation`, `provider.plans.getUserPlan` | Server built (`operator_list_users` with `query`); app screens not yet |
| Operator · User | Suspend or resume | `setActorStatus` | Server built (`operator_set_user_status`, a proof from the phone each time); app screens not yet |
| Operator · User | Change role | `provider.identity.setUserRole` | Not on mobile |
| Operator · User | Assign or remove a plan | `provider.plans.assignPlan` | Not on mobile |
| Operator · User | Add credit (manual adjustment) | `provider.budgets.topUpAllocation` | Not on mobile |
| Operator · User | See keys and usage | `listAccessKeys`, `provider.usage.listUsage` | Not on mobile |
| Operator · Pricing | See provider and features, plans, packs, markup | `provider.features`, `provider.plans.listPlans`, `provider.plans.listCreditPacks` | Not on mobile |
| Operator · Pricing | Create or edit a plan | `provider.plans.createPlan`, `provider.plans.updatePlan` | Not on mobile |
| Operator · Pricing | Add a credit pack; change its credits or price, highlight it, stop offering it | `provider.plans.createCreditPack`, `provider.plans.updateCreditPack` | Not on mobile |
| Operator · Pricing | Allow other amounts; set the minimum and maximum | `provider.plans.getTopUpRange`, `provider.plans.updateTopUpRange` | Not on mobile |
| Operator · Billing | Connect a processor, tax setting | `getBillingSettings`, `updateBillingSettings` | Not on mobile |
| Operator · Billing | See payments, invoices, failed payments; refund | `listPayments`, `refundPayment` | Not on mobile |
| Operator · Costs | Retail against wholesale per capability, pending | `getCostSummary` | Not on mobile |
| Operator · Jobs | List, filter, inspect attempts and failures | `listJobs` | iOS design sample: list with All, Failed and Running, older pages with `before`, one job's detail from the same answer (`operator_list_jobs`). Sharing a job's summary and copying an id use the system and call nothing. Android not yet |
| Operator · Jobs | Retry | `retryJob` | Not on mobile |
| Operator · Capabilities | See discovery; enable, set markup, override surfaces | `listOfferings`, `getCapabilitySetting`, `updateCapabilitySetting` | Not on mobile |
| Operator · Compute | See operators that served jobs; allow or block | `listComputeOperators`, `setComputeOperatorBlocked` | Not on mobile |
| Operator · Grants | List, create, add funding | `provider.budgets.listGrants`, `createGrant`, `fundGrant` | Not on mobile |
| Operator · Reports (phone) | See the queue; keep a character up or take it down | `operator_list_reports`, `operator_resolve_report` (a proof from the phone each time) | Server built; app screens not yet |
| Operator · Settings | Switch the console on phones on or off | `saveInstanceSettingsAction` (`surfaces.mobileConsole` in the instance config) | Not on mobile |
| Operator · System | See the phones enrolled for the console | `operator_list_devices` (`operatorDevices().list()`) | Not on mobile |
| Operator · System | Revoke one operator phone, or all of them | `operator_revoke_device`, `operator_revoke_all_devices`; on the web `revokeOperatorPhoneAction`, `revokeAllOperatorPhonesAction` | Not on mobile |
| Operator · System | Read what operators' phones did and were refused | `operator_list_audit` (`operatorAudit().list()`) | Not on mobile |
| Operator · every page | See that a phone was enrolled in the last two days, and go to revoke it | `operator_list_devices` | Not on mobile |
| Console on a phone | Sign in to the console (new provider sign-in, operators only), enrolling the phone's key | `/auth/start?purpose=operator`, then `create_operator_device_session` | iOS design sample: from an account tray row shown only to a signed-in operator (`get_me.role`) where the instance offers the console (`get_instance.surfaces.mobile_console`). Provisional: the development provider's operator method only. Android not yet |
| Console on a phone | Unlock with a face or fingerprint | `create_operator_challenge`, `unlock_operator_device_session` | iOS design sample. Android not yet |
| Console on a phone | Confirm a change with a face or fingerprint | `create_operator_challenge` with the operation and its input hash, then the operation with `X-Operator-Proof` | Server built; app not yet |
| Console on a phone | Sign out of the console on this phone | `delete_operator_device_session` | Server built; app not yet |
| Operator · Settings | Name, domain, logo and symbol (upload, replace, remove; previewed in both themes; checked and cleaned on save by `lib/operator/logo.ts`), colours, sign-up, privacy, surfaces (app, API, MCP, phone apps, reviewed before any is switched off; the console is shown on and disabled), content policy | Writes the instance config (`@livepeer/config` `validateConfig`) | Not on mobile |
| Operator · Reports | List reports of shared characters, open first | `operator_list_reports` (`moderation().reports()`) | Not on mobile |
| Operator · Reports | Keep a character up, or take it down for everyone | `operator_resolve_report` (`moderation().resolve()`) | Not on mobile |
| Operator · Keys | List, issue, revoke | `listAccessKeys`, `issueAccessKey`, `revokeAccessKey` | Not on mobile |
| Operator · System | Health, versions, doctor, data sources | `getEngineHealth`, doctor checks | Not on mobile |
| Shell (mobile) | Learn the instance's name, marks, theme, surfaces, sign-in methods and content settings | `get_instance` (the instance config; no engine call) | Built (iOS sample) |
| Chat (mobile) | Name the capability behind each of the agent's steps | `list_capability_labels` (`listOfferings`, runner models, `capability-menu.ts`) | Built (iOS sample) |
