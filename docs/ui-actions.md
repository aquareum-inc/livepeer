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
| (none yet) | Load example gallery: off Home on every client (decision 105), kept for a planned discovery view | `listShowcase` | Not on mobile (decisions 102 and 104) |
| Home | Send a request | `createConversation` (live: runs `POST /v1/jobs` against a language offering and stores the conversation in Postgres) | Built (iOS sample) |
| Home, Chat | Upload a photo or video from the device and attach it (the plus button; the file goes to the library first) | `requestUpload`, then `receiveUpload` through the file route | Built on iOS and Android (decision 106): the system photo picker |
| Home | Attach or cast as a guest (the buttons are shown; using one asks to sign in) | none until signed in | Built on iOS and Android |
| Home | Start from a starting point (its name is sent and the agent asks for the rest) | `createConversation` | Built on iOS and Android (decisions 103 and 104) |
| Shell | List recent conversations (open sidebar) | `listConversations` | Built (slice 2): History, from Home, with search by title |
| Chat | Open a conversation | `getConversation` | Built (iOS sample); from History by its id in slice 2 |
| Chat | Send a follow-up | `sendMessage` (live: includes prior turns in the job payload, bounded to 40 messages) | Built (iOS sample) |
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
| Account menu | See the accounts you can work in, with each balance, and invitations waiting | `listAccounts` | iOS and Android: the top of the account tray reads `list_accounts`, with a row for each invitation waiting (`docs/mobile/plan.md` §19) |
| Account menu | Switch between your personal account and a workspace | `listAccounts` (membership is checked, then the session is repointed: `switchAccountAction`) | iOS and Android: one tap in the account tray calls `switch_account`, which repoints the device session; the app returns to Home and reads everything again |
| Account menu | Create a workspace | `createWorkspace` | Not on mobile |
| Every tab (phones) | See which account the app is working in | `get_me` (`account`: the current account, with the person's role) | iOS and Android: the account button is the workspace's mark in a workspace; Settings says "Working in Northlight Studio · Admin" |
| Settings · Workspace | See the workspace, its members with role and usage, and waiting invitations | `getWorkspace` | Not on mobile |
| Settings · Workspace | Rename the workspace (owner, admin) | `renameWorkspace` | Not on mobile |
| Settings · Workspace | Invite by email with a role; resend an invitation (owner, admin) | `inviteMember` | Not on mobile |
| Settings · Workspace | Cancel an invitation (owner, admin) | `revokeInvitation` | Not on mobile |
| Settings · Workspace | Copy an invitation's link | Client only: the link is built from the invitation `getWorkspace` returned | Not on mobile |
| Settings · Workspace | Change a member between admin and member (owner, admin) | `setMemberRole` | Not on mobile |
| Settings · Workspace | Remove a member (owner, admin; never the owner) | `removeMember` | Not on mobile |
| Settings · Workspace | Make another member the owner (owner) | `transferOwnership` | Not on mobile |
| Settings · Workspace | Leave the workspace (admin, member) | `leaveWorkspace` | Not on mobile |
| Join | Read an invitation from its link | `getInvitation` | Not on mobile |
| Join | Join, or decline | `acceptInvitation`, `declineInvitation` | iOS and Android: an invitation row in the account tray opens a tray with what joining means, Join and Decline (`accept_invitation`, `decline_invitation`, by the invitation's id). Joining starts working in the workspace |
| Settings · Usage | In a workspace: see usage by member and API key (owner, admin) | `getMemberUsage`; `getUsage` answers a member with their own entries only | iOS and Android: Usage shows the workspace's totals or the member's own (`get_usage`) and says which. By member stays on the web |
| Settings · Plan | In a workspace: see the plan and balance; only the owner buys credit or changes the plan | `getAccount`, `getCreditBalance`; `buyCreditPack`, `buyCredits`, `changePlan` refuse anyone else | iOS and Android: the workspace's balance and plan under its name (`get_account`, `get_me`), with whose they are to change. Nothing is bought on phones |
| Developers | In a workspace: keys are listed, made and revoked by its owner and admins | `listApiKeys`, `createApiKey`, `revokeApiKey` refuse a member | Not on mobile |
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
| Operator · Overview | See users, jobs, revenue, cost, margin, engine status | `getOverview`, `getEngineHealth`, `listJobs` | iOS and Android: Status reads `operator_status` (plan §18.8). iOS and Android stage 2: More ▸ Revenue and margin reads `operator_overview` (today, and a bar a day), and More ▸ System reads `operator_health`. |
| Operator · Users | List users with email, budget, spent, remaining, plan | `provider.identity.listUsers`, `listActors`, `provider.budgets.getAllocation`, `provider.plans.getUserPlan` | iOS and Android: Users, searched on the instance by name or id (`operator_list_users` with `query`): name, standing, last seen, ids. Email, budget and plan aren't in that answer and aren't shown. |
| Operator · User | Suspend or resume | `setActorStatus` | iOS and Android: from a user's page, in a tray, confirmed with a face or fingerprint (`operator_set_user_status` with a proof) |
| Operator · User | Change role | `provider.identity.setUserRole` | Not on mobile |
| Operator · User | Assign or remove a plan | `provider.plans.assignPlan` | Not on mobile |
| Operator · User | Add credit (manual adjustment) | `provider.budgets.topUpAllocation` | Not on mobile |
| Operator · User | See keys and usage | `listAccessKeys`, `provider.usage.listUsage` | Not on mobile |
| Operator · Workspaces | List workspaces with owner, members, plan, budget, spent, remaining | `listWorkspaces` | Not on mobile |
| Operator · Workspace | See members with role and usage, invitations, keys and recent usage | `getWorkspace`, `listAccessKeys`, `provider.usage.listUsage` | Not on mobile |
| Operator · Workspace | Suspend or resume | `setWorkspaceStatus` | Not on mobile |
| Operator · Workspace | Assign or remove a plan | `provider.plans.assignPlan` (the workspace's id) | Not on mobile |
| Operator · Workspace | Add credit (manual adjustment) | `provider.budgets.topUpAllocation` (the workspace's id) | Not on mobile |
| Operator · User | See the workspaces a person belongs to | `provider.workspaces.listForUser` | Not on mobile |
| Operator · Pricing | See provider and features, plans, packs, markup | `provider.features`, `provider.plans.listPlans`, `provider.plans.listCreditPacks` | Not on mobile |
| Operator · Pricing | Create or edit a plan | `provider.plans.createPlan`, `provider.plans.updatePlan` | Not on mobile |
| Operator · Pricing | Add a credit pack; change its credits or price, highlight it, stop offering it | `provider.plans.createCreditPack`, `provider.plans.updateCreditPack` | Not on mobile |
| Operator · Pricing | Allow other amounts; set the minimum and maximum | `provider.plans.getTopUpRange`, `provider.plans.updateTopUpRange` | Not on mobile |
| Operator · Billing | Connect a processor, tax setting | `getBillingSettings`, `updateBillingSettings` | Not on mobile |
| Operator · Billing | See payments, invoices, failed payments; refund | `listPayments`, `refundPayment` | Not on mobile |
| Operator · Costs | Retail against wholesale per capability, pending | `getCostSummary` | iOS and Android stage 2, read only: More ▸ Network cost reads `operator_costs` for 30 days, by outcome and by capability. Retail against wholesale per capability stays on the web |
| Operator · Jobs | List, filter, inspect attempts and failures | `listJobs` | iOS and Android: list with All, Failed and Running, older pages with `before`, one job's detail from the same answer (`operator_list_jobs`). Sharing a job's summary and copying an id use the system and call nothing. |
| Operator · Jobs | Retry | `retryJob` | Not on mobile |
| Operator · Capabilities | See discovery; enable, set markup, override surfaces | `listOfferings`, `getCapabilitySetting`, `updateCapabilitySetting` | iOS and Android stage 2, read only: More ▸ What's offered reads `operator_list_capabilities` (name, offered or not, runners ready, markup). Enabling, markup and surfaces stay on the web |
| Operator · Compute | See operators that served jobs; allow or block | `listComputeOperators`, `setComputeOperatorBlocked` | iOS and Android stage 2, read only: More ▸ Compute operators reads `operator_list_compute`. Allow and block stay on the web |
| Operator · Grants | List, create, add funding | `provider.budgets.listGrants`, `createGrant`, `fundGrant` | iOS and Android stage 2, read only: More ▸ Grants reads `operator_list_grants`. Creating and funding stay on the web |
| Operator · Plans (phone) | See the provider's plans as users are offered them | `operator_list_plans` (`provider.plans.listPlans`) | iOS and Android stage 2, read only: More ▸ Plans |
| Operator · Reports (phone) | See the queue; keep a character up or take it down | `operator_list_reports`, `operator_resolve_report` (a proof from the phone each time) | iOS and Android: Reports, with a count on its tab; a report's page; Keep it up or Take it down in a tray, confirmed with a face or fingerprint |
| Operator · Settings | Switch the console on phones on or off | `saveInstanceSettingsAction` (`surfaces.mobileConsole`, kept by the instance over its deployed config) | Not on mobile |
| Operator · Settings | Reset the page to the deployed config | `resetInstanceSettingsAction` (forgets what the page saved; `apps/web/lib/operator/settings.ts`) | Not on mobile |
| Operator · Capabilities | Reset every capability to the deployed config | `resetCapabilitySettings` (`operator_reset_capabilities`; on the web `resetCapabilitiesAction`) | Not on mobile: web only, like every change to capabilities |
| Operator · System | See the phones enrolled for the console, and whether alerts reach each (on, off, not reaching, or signed out with alerts until a date) | `operator_list_devices` (`operatorDevices().list()`) | Not on mobile |
| Operator · System | Revoke one operator phone, or all of them | `operator_revoke_device`, `operator_revoke_all_devices`; on the web `revokeOperatorPhoneAction`, `revokeAllOperatorPhonesAction` | Not on mobile |
| Operator · System | Open System after closing a new-phone notice: the dot on System goes, for yourself only | `seeNewPhonesAction` (`operatorDevices().seeNewPhones`), sent by the Operator phones list when it is on screen. Web console only | Not on mobile |
| Operator · every console page | Dismiss the notice that a phone was added, for yourself only; System then carries a dot until you open it | `dismissNewPhonesAction` (`operatorDevices().dismissNewPhones`; what to show is `operatorDevices().newPhones`). Web console only: no public API operation | Not on mobile |
| Operator · System | Read what operators' phones did and were refused, and each alert sent to one | `operator_list_audit` (`operatorAudit().list()`) | Not on mobile |
| Console on a phone · Status | See that alerts have stopped on this phone, and go to mend it | `operator_get_alerts`, and what the phone itself knows (its push token changed, or notifications are off in its settings) | iOS: seen in the simulator, and it leads to Alerts. Android: built; not seen on screen yet |
| Console on a phone · an alert | Tap an alert to open the console at the place it points at, after a match | Navigation only: the alert carries `kind` and `opens` (status, jobs or reports) and nothing else | iOS: an alert arriving was seen (no banner with the console open, a banner and the lock screen otherwise); opening the console from a tap was not, see plan §18.8. Android: built; not run (no alert can arrive without a Firebase project) |
| Operator · System | See whether the instance can send alerts to iPhone and to Android, and whether its credentials were last refused | `pushSetup()` (`apps/web/lib/push`) and the alerts' own record; no API client function | Not on mobile |
| Console on a phone · More ▸ Alerts | Read this phone's alerts | `operator_get_alerts` | iOS: built and run in the simulator end to end against a mock instance, and on a real iPhone with a real alert through Apple, tapped (plan §18.8). Android: built and run in an emulator end to end against a mock instance, with a push token from a real Firebase project; real alerts through Firebase seen arriving and opening the console |
| Console on a phone · More ▸ Alerts | Turn alerts on, choose kinds, turn them off | `operator_set_alerts`, confirmed with a face or fingerprint | iOS: built and run in the simulator end to end against a mock instance, and on a real iPhone with a real alert through Apple, tapped (plan §18.8). Android: built and run in an emulator end to end against a mock instance, with a push token from a real Firebase project; real alerts through Firebase seen arriving and opening the console |
| Console on a phone · More ▸ Alerts | Send a test alert | `operator_test_alert`, confirmed with a face or fingerprint | iOS: built and run in the simulator end to end against a mock instance, and on a real iPhone with a real alert through Apple, tapped (plan §18.8). Android: built and run in an emulator end to end against a mock instance, with a push token from a real Firebase project; real alerts through Firebase seen arriving and opening the console |
| Operator · every page | See that a phone was enrolled in the last two days, and go to revoke it | `operator_list_devices` | Not on mobile |
| Console on a phone | Sign in to the console (new provider sign-in, operators only), enrolling the phone's key | `/auth/start?purpose=operator`, then `create_operator_device_session` | iOS and Android: from an account tray row shown only to a signed-in operator (`get_me.role`) where the instance offers the console (`get_instance.surfaces.mobile_console`), or at launch on an instance that serves only its console; with any method the instance offers |
| Console on a phone | Unlock with a face or fingerprint | `create_operator_challenge`, `unlock_operator_device_session` | iOS and Android |
| Console on a phone | Confirm a change with a face or fingerprint | `create_operator_challenge` with the operation and its input hash, then the operation with `X-Operator-Proof` | iOS and Android: every change (resolve a report, suspend, resume) |
| Console on a phone | Sign out of the console on this phone | `delete_operator_device_session` | iOS and Android: at the foot of Status, after asking |
| Console on a phone | Open the web console for what a phone doesn't offer | none: the system browser opens the instance's `/operator` | iOS and Android stage 2: the line at the foot of More |
| Operator · Settings | Name, domain, logo and symbol (upload, replace, remove; previewed in both themes; checked and cleaned on save by `lib/operator/logo.ts`), colours, sign-up, privacy, surfaces (app, API, MCP, the user app on phones, the console on phones, reviewed before any is switched off; the console is shown on and disabled), content policy | Writes the instance config (`@livepeer/config` `validateConfig`) | Not on mobile |
| Operator · Reports | List reports of shared characters, open first | `operator_list_reports` (`moderation().reports()`) | Not on mobile |
| Operator · Reports | Keep a character up, or take it down for everyone | `operator_resolve_report` (`moderation().resolve()`) | Not on mobile |
| Operator · Keys | List, issue, revoke | `listAccessKeys`, `issueAccessKey`, `revokeAccessKey` | Not on mobile |
| Operator · System | Health, versions, doctor, data sources | `getEngineHealth`, doctor checks | iOS and Android stage 2: More ▸ System reads `operator_health` (ready, discovery, cost sync, version). The doctor's checks and the data sources stay on the web: the checks name settings, and nothing a phone is sent may name one |
| Shell (mobile) | Learn the instance's name, marks, theme, surfaces, sign-in methods and content settings | `get_instance` (the instance config; no engine call) | Built (iOS sample) |
| Chat (mobile) | Name the capability behind each of the agent's steps | `list_capability_labels` (`listOfferings`, runner models, `capability-menu.ts`) | Built (iOS sample) |
