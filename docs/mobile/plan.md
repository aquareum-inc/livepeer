# Native apps: plan

Native iOS (Swift, SwiftUI) at `apps/ios` and Android (Kotlin, Jetpack Compose) at `apps/android`, for the
user app, and for the operator console from section 18 (proposed). The bar is the Linear mobile app: fast, fluid, idiomatic to each platform. Everything in
`CLAUDE.md` applies; this plan adds what mobile needs.

Status: **proposed, waiting for review.** Sections marked *Decision* need an answer before the slices
start. What exists today is in section 17. Section 18 plans the operator console on phones. Facts about store rules and tools were checked on 19 November 2026 and change often; each is marked
*verify* where a decision depends on it.

## 1. Scope

| In | Slice |
|----|-------|
| Shell, instance description, sign-in, guest browsing | 1 |
| Home and chat (composer, starting points, gallery, agent steps, shots) | 2 |
| Studio: video, image, audio | 3 |
| Library | 4 |
| Characters, only when the instance enables them | 5 |
| Settings: profile, general, privacy, plan and balance, usage | 6 |

| Out | Why |
|-----|-----|
| Operator console | Out of slices 1 to 6. Planned for phones in section 18, which reverses the earlier "stays on the web". |
| Developers section | A desk job; stays on the web. |
| Studio Live, character calls | Planned in section 10; built when live sessions are connected (engine request R2). |
| Buying credits, changing plan | Balance, plan and usage are shown. Purchasing waits on the decision in section 11. |
| `./livepeer mobile` | Designed in section 13; built once the apps work against the flagship. |

## 2. Toolchain

Checked on the project owner's Mac (Apple silicon, macOS 26.6.2) on 19 November 2026.

| Tool | State | Action |
|------|-------|--------|
| Xcode 27.1, Swift 6.4, iOS 26.5 simulators | Installed | None. |
| Metal toolchain (a separate Xcode component, for `Aurora.metal`) | Installed 20 November 2026 | `xcodebuild -downloadComponent MetalToolchain` on any machine that builds the iOS app. |
| Apple's Xcode MCP bridge (`xcrun mcpbridge`, and the headless `xcrun mcp-server`) | Shipped with Xcode, not registered | Xcode ▸ Settings ▸ Intelligence ▸ Model Context Protocol ▸ turn on **Xcode Tools**, then `claude mcp add --transport stdio xcode -- xcrun mcpbridge`. |
| XcodeBuildMCP | Not installed. Renamed **MobileBuildMCP**; the old site and repository redirect to it (*verify*) | `claude mcp add MobileBuildMCP -- npx -y mobilebuildmcp@latest mcp`. Optional: the desktop app's own simulator tools already build, launch, drive and screenshot. |
| Android Studio (Rabbit 2, 2026.2.2 Patch 1) | Not installed | `brew install --cask android-studio`, open it once and let the wizard install the SDK, platform tools and emulator. |
| Android SDK, emulator, an AVD | Not installed | Through the wizard, or `android sdk install platform-tools emulator platforms/android-36` and `android emulator create` (default profile `medium_phone`). |
| Google's Android CLI (1.0, May 2026) | Not installed | Download from developer.android.com/tools/agents (the page gives the macOS command), then `android init`. |
| JDK | Temurin 21 installed | None; Android Studio also bundles one. |
| Disk | **10 GB free** | Android Studio, the SDK and one emulator image need about 12–15 GB. Free space first. |
| XcodeGen | Not installed | Not needed: see section 3. |

## 3. Layout

```
apps/ios                     Xcode project, one app target, one test target, one UI test target
  Livepeer/                  App, Shell, Features/<Home|Chat|Studio|Library|Characters|Settings>, Design, API
  Livepeer/Generated/        API models and client, tokens (generated, committed)
  Config/Instance.xcconfig   Name, bundle identifier, instance URL (written by `./livepeer mobile`)
apps/android                 Gradle project, one `app` module
  app/src/main/kotlin/…      same feature folders
  app/src/main/kotlin/…/generated/
  instance.properties        Name, application id, instance URL
packages/mobile-codegen      OpenAPI → Swift and Kotlin generator, token generator (Node, no runtime deps)
docs/mobile                  This plan, the OpenAPI document, captured fixtures
docs/screenshots/mobile      Per-slice screenshots, both platforms, dark and light
```

- The Xcode project is committed as a normal `.xcodeproj` using folder references (synchronised groups),
  so adding a file needs no project edit and no project generator.
- `apps/ios` and `apps/android` are added to `.dockerignore`. The Dockerfile copies `apps`, so without that
  line they would bloat the image and break its cache. `pnpm-workspace.yaml` is unchanged: neither is a
  Node package.

## 4. API

The apps are clients of an instance's `/api/v1` and nothing else. No engine or provider call, and no
builder key, reader token or admin token on a device.

### 4.1 Operations to add

Compared `docs/ui-actions.md` with `apps/web/lib/public-api/operations.ts`. The mobile scope needs these,
each calling one existing API client function unless marked **new**.

| Operation | Method and path | API client function | Guest | Slice |
|-----------|-----------------|---------------------|-------|-------|
| `get_instance` | `GET /instance` | **new** `describeInstance` (config, no engine call) | yes | built |
| `list_capability_labels` | `GET /offerings/labels` | **new**, derived: `listOfferings`, runner models and the web's naming rules | yes | built |
| `get_me` | `GET /me` | session identity, plus `getCreditBalance` | | 1 |
| `list_devices`, `revoke_device` | `GET /devices`, `DELETE /devices/{id}` | **new**, device sessions (section 5) | | 1 |
| `list_prompt_starters` | `GET /starters` | `listPromptStarters` | yes | built |
| `list_showcase` | `GET /showcase` | `listShowcase` | yes | built |
| `list_agent_models` | `GET /agent-models` | `listAgentModels` | yes | built |
| `delete_conversation` | `DELETE /conversations/{id}` | `deleteConversation` | | 2 |
| `get_character` | `GET /characters/{slug}` | `getCharacter` | yes, public ones | 5 |
| `create_character` | `POST /characters` | `createCharacter` | | 5 |
| `report_character`, `block_character` | `POST /characters/{slug}/report`, `…/block` | **new** (section 12) | | 5 |
| `get_account` | `GET /account` (answers with `PlanAndCredits`) | `getAccount` | | 6 |
| `get_preferences`, `update_preferences` | `GET`, `PATCH /preferences` | `getPreferences`, `updatePreferences` | | 6 |
| `delete_account` | `DELETE /me` | **new**, provider identity (section 12, question Q14) | | 6 |

Changes to existing operations:

- `create_conversation` and `send_message` gain `agent_model` and `character_slug`, which the API client
  already takes and the web already sends.
- `list_capabilities` and `list_characters` become available to guests (public characters only), as on
  the web.
- An operation gets a `public: true` flag. Without a caller it runs as the instance's default account,
  exactly as the web does for a guest. Everything else still answers 401.

**Names come from the instance.** How a capability or a model reads ("Text to image · FLUX.2 klein 4B") is
decided by rules in `packages/user-app/src/lib/capability-menu.ts`. The apps don't re-implement them in
Swift and Kotlin: `list_capability_labels` returns the result, and slice 2 adds the same for the agent's
model menu.

Not added, and why: `uploadMedia` and `getMediaUrl` don't exist in the API client yet (the web marks
them "not wired"), so attaching from Photos and saving a result to Photos are planned for when the media
store and real outputs exist. Until then mobile attaches from the library, as the web does.

### 4.2 Response schemas and the OpenAPI document

Operations describe inputs only. Proposed:

1. Each operation names its output: `output: "Conversation"`, `output: ["MediaItem"]`.
2. JSON Schemas for those names are generated from `packages/api-client/src/types.ts` with
   `ts-json-schema-generator` (a dev dependency, build time only), so the TypeScript types stay the single
   definition and "the real response wins" keeps holding.
3. `pnpm api:openapi` writes `docs/mobile/openapi.json` (OpenAPI 3.1) from the operations list: paths,
   inputs, outputs, the error envelope, which operations are public and which need the operator role.
   Operator operations are left out of the mobile clients, except those section 18.5 marks for phones,
   which go into a separate generated client.
4. A test runs every non-operator operation against a mock-only instance and validates the response
   against its schema. The captured responses are saved as `docs/mobile/fixtures/*.json`, and the native
   decoding tests read those same files.

### 4.3 Generated clients (*Decision*)

Recommended: **our own generator** in `packages/mobile-codegen`, a few hundred lines of Node that reads
`openapi.json` and writes `Codable` structs with a `URLSession` client, and `@Serializable` data classes
with an OkHttp client. Why: the document is small and regular (about 35 operations, plain objects, enums,
one tagged union for messages); both languages come from one script, so they can't drift apart; the
"generated code is current" check runs in the existing Node CI job with no Swift or JVM toolchain; and the
apps gain no third-party runtime.

The alternative is Apple's `swift-openapi-generator` (three packages and a build plugin) plus OpenAPI
Generator for Kotlin (a Java tool with its own runtime templates). More standard, but two tools, two
styles of output and extra dependencies in each app.

CI check: `pnpm api:openapi && pnpm mobile:generate && git diff --exit-code`.

### 4.4 The instance description

`GET /api/v1/instance`, no authentication:

```json
{
  "api_version": "1",
  "name": "Livepeer",
  "logo": { "symbol": "https://…/brand/symbol.svg", "wordmark": "…", "tint": true },
  "theme": { "dark": { "primary": "#EAEAEA" }, "light": { "primary": "#18181B" } },
  "surfaces": { "app": true, "api": true, "mcp": true, "mobile": true },
  "mobile": {
    "ios": { "bundle_id": "org.livepeer.app", "minimum_version": "1.0.0" },
    "android": { "application_id": "org.livepeer.app", "minimum_version": null }
  },
  "sign_in": { "methods": ["apple", "google", "email", "passkey"], "sign_up": "open" },
  "content": { "characters": true, "adult_content": false },
  "home": { "background_image": "https://…", "background_video": null, "aurora": true }
}
```

- Theme overrides are any CSS colour in the config. The instance resolves them to sRGB hex before
  sending, with the same conversion code the token generator uses, so the apps never parse CSS.
- URLs are absolute. Logos are sent as the config has them; the apps render SVG and raster marks and apply
  the tint.
- The apps fetch it at launch, cache it, and re-fetch on foreground. A cached copy shows at once, so the
  theme never flashes.
- `mobile` names the apps built for the instance (config `mobile.ios.bundleId`, `mobile.android.applicationId`).
  Sign-in returns only to these, so an app that isn't listed shows "not on phones" instead of a sign-in that
  can't finish. `minimum_version` lets an instance ask an old build to update after a breaking API change.

### 4.5 `surfaces.mobile`

Add `mobile: boolean` to `surfaces` in the instance schema, both presets (`false` in `headless`; *Decision*
on `full`, recommended `false` so mobile is opt-in) and the console's Surfaces switches. With it off the
instance issues no device sessions, refuses requests that carry one with 403 and code `mobile_off`, and
`get_instance` says so, so an installed app shows "This service doesn't offer its app on phones right now."

## 5. Sign-in (*Decision*; built in slice 1 once approved)

The starting point holds up. Proposed flow:

1. The app shows a native sign-in screen with the methods from `get_instance`.
2. On a choice, the app makes a PKCE verifier and challenge and opens
   `/auth/start?method=<m>&client=<ios|android>&challenge=<c>&state=<s>` in the system auth session:
   `ASWebAuthenticationSession` on iOS, an Auth Tab (Custom Tabs) on Android. Never a webview.
3. The instance runs its normal flow with the identity provider. The provider's redirect URI stays the
   instance's own `https://…/auth/callback`, so **the provider needs nothing new for mobile**.
4. At the callback, for a native flow the instance sets no cookie. It mints a one-time code (sealed,
   60 seconds, bound to the challenge) and redirects to the app: `<bundle id>://auth?code=…&state=…`.
   It redirects only to the identifiers listed in the instance config (`mobile.ios.bundleId`,
   `mobile.android.applicationId`).
5. The app posts the code and its verifier to `POST /api/v1/auth/device`, with a device name. The instance
   returns a **device session token** and the user's name.
6. The app stores the token in the Keychain (`kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`) or in
   Android Keystore-encrypted storage, and sends it as `Authorization: Bearer aqd_…`.

**The token.** 32 random bytes, shown once. The instance stores only its SHA-256, with the user id, name,
email, device name, platform, created and last-used times, and the user's builder key sealed with
`SESSION_SECRET`. `authenticate()` accepts it after the operator token and API keys. A device session
always has the `user` role, so a lost phone can't administer an instance. Section 18 keeps that true of
this session and adds a separate operator device session (`aqo_`) for the console.

**Lifetime and revocation.**

- Sliding expiry: 90 days without use. No refresh token; the token is the session.
- Sign-out calls `DELETE /api/v1/auth/device`, which deletes the record, then wipes the Keychain entry.
- Settings ▸ Devices, on mobile and web, lists a user's devices and revokes any of them.
- Suspending a user in the console revokes their device sessions. Rotating `SESSION_SECRET` ends all of
  them, as it does for web sessions.
- A 401 on any call returns the app to the guest state with "You've been signed out."

**Where sessions are stored.** Revocation needs state, and the instance has no database yet. Proposed: a
`DeviceSessionStore` interface with a file-backed implementation in the instance's data volume now, and
the database implementation when the instance database lands. It holds sessions only, never balances.
(*Decision*: or build the database foundation first and skip the file store.)

**Guests** look around as on the web: Home, the studio composer, public characters, an empty library.
Anything that spends asks them to sign in, in a tray, and returns them to what they were doing.

**Callback: custom scheme or universal link.** Recommended for the first release: the custom scheme with
PKCE, which needs no domain files. Universal Links and App Links (an `https` callback that only the real
app can claim) are stronger and are the follow-up; the instance would serve
`apple-app-site-association` and `assetlinks.json` from its config.

**What the identity provider must support** (questions Q12–Q14 go in `docs/engine-requests.md`):

- Nothing new for the redirect. Its login pages must work in a system browser session, which rules out
  providers that require their own embedded page.
- **Apple's rule 4.8** (*verify*): an app offering third-party social sign-in must also offer an
  equivalent privacy-preserving option, in practice Sign in with Apple. An operator publishing to the App
  Store with Google or Discord enabled needs `apple` in `auth.methods`. `./livepeer mobile` will check.
- Passkeys work in the system session for the provider's own domain. Wallet sign-in hands off to a wallet
  app and back, which is unreliable inside an auth session; mobile hides `wallet` and `coinbase` until
  tested against the real provider (Q12).
- Can the provider tell the instance when a user is disabled or deleted (back-channel logout or a
  webhook), so device sessions end promptly (Q13)?
- Can the provider delete a user on request? Apple requires in-app account deletion (Q14, section 12).

## 6. Following work in progress

The web polls every 700 ms.

**Built for the first release (slice 2): polling with backoff, on the existing operations.** While a turn or a
render is working: every 700 ms for the first 10 seconds, then 1.5 s, then 3 s, capped at 5 s. Polling
stops when the app leaves the foreground and resumes with one immediate read when it returns. Responses
carry an `ETag`; an unchanged poll answers 304 with no body, so a long render costs almost nothing.

**Next: server-sent events**, shared with the web: `GET /conversations/{id}/events` and
`GET /generations/{id}/events` send the same objects as they change. Both platforms read SSE with
first-party networking (`URLSession.bytes`, OkHttp's SSE module). It is worth building when the engine's
events feed exists (R2); before that the instance would only be polling on the app's behalf.

**"Your video is ready" notifications need, on the server:**

- something that learns a render finished when no client is asking: the engine's events feed (R2), or a
  server-side watcher;
- a store for push tokens per device session (the same store as section 5) and a `register_push_token`
  operation;
- each publisher's own APNs key and Firebase Cloud Messaging credentials, as environment variables;
- a notification preference per user, and a deep link from the notification to the conversation or tile.

Not built until R2 lands. The apps will ask for notification permission only at the moment a user starts
a long render and leaves, never at launch.

## 7. Design

`docs/design-brief.md` and `docs/design-proposals.md` hold: one ink action per view, green never on a
control, mono for facts, a result is one tile from request to finish, the composer is one object that
travels, numbers roll only changed digits, reduced motion becomes a short fade. Each decision below is
logged in `docs/design-proposals.md` as it is built.

**What the sidebar becomes.**

- Its destinations become the system tab bar: **Home, Studio, Library, Characters** (the last only when
  the instance enables characters). `TabView` on iOS, which takes the system's glass on iOS 26 and later;
  `NavigationBar` on Android.
- Its recent conversations become a **history** button at the top left of Home, opening the list as a
  pushed screen with search and swipe-to-delete.
- Its account foot becomes an **avatar at the top right** of each tab's root, opening the account tray:
  name and credits, plan, settings, who can see what, theme, sign out; for a guest, "Sign in or sign up".
- A conversation pushes onto Home's stack and hides the tab bar; the composer docks above the keyboard.

**System behaviour, not the web at 375 px.** Navigation stacks with edge-swipe back and predictive back on
Android; pull to refresh on lists; context menus on tiles (long press); the share sheet for results; drag
to dismiss for media; haptics on send, on a finished render (once, with the green settle) and on
destructive confirms.

**Trays** follow the rules in `docs/research/benji-taylor-notes.md` §1.1, which were written for mobile: a
tray starts from a user action, has a fixed header with a title and one icon (close for the first step,
back within a sequence), holds one thing, keeps the screen behind it visible and dimmed, and each step in
a sequence has a different height. Sequences are one surface that resizes, never stacked cards. Trays are
used for the model picker, parameters, sign-in prompts, confirmations and the account menu; anything that
persists is a full screen. Built on the system sheet with custom detents on iOS and `ModalBottomSheet` on
Android, inset from the edges with the 28 pt sheet radius.

**The composer travels** from the centre of Home to the foot of the conversation as one object: a zoom
navigation transition with a matched source on iOS 18 and later, a shared-element transition in Compose.

**Tokens.** `packages/mobile-codegen/tokens.mjs` reads `packages/ui/src/styles/tokens.css` and
`packages/ui/src/lib/motion.ts` and writes `Tokens.generated.swift` and `Tokens.generated.kt`: both
themes' colours, radii, type sizes, durations, the curve and the layout spring. It resolves `var()` and
`color-mix(in oklch, …)`, converts oklch through OKLab to sRGB with gamut clipping, and keeps alpha. The
conversion is tested against known values. No value is retyped by hand, and the same check that guards
the API client fails CI when the output is stale. Instance theme overrides apply on top at run time.

**Type** (*Decision*, with a sample of each in the design sample):

| Option | For | Against |
|--------|-----|---------|
| A. System text (SF Pro, Roboto) with Geist Mono bundled for facts | Native feel, best Dynamic Type behaviour, smallest app | Loses Inter's `cv11` and `ss01` character |
| B. Inter and Geist Mono bundled | Identical voice to the web | About 1 MB; variable-font scaling needs care on both platforms |

Recommended: **A**. Mono is where the product's voice is most distinct, and "mono for facts" survives.

**Accessibility from the first slice.** Dynamic Type and Android font scaling up to the largest
accessibility sizes without clipping (layouts reflow, chips wrap); VoiceOver and TalkBack labels, traits
and a sensible order on every screen; 44 pt and 48 dp targets; both themes, following the system unless
the user chooses; Reduce Motion swaps movement for a 120 ms fade.

**Copy** matches the web's words and rules: real copy, no category labels.

## 8. Stack

First-party and boring.

| | iOS | Android |
|---|-----|---------|
| UI | SwiftUI | Jetpack Compose, Material 3 as the base, our tokens on top |
| State | `@Observable`, Swift concurrency | `ViewModel`, `StateFlow`, coroutines |
| Network | `URLSession` with the generated client | OkHttp with the generated client |
| JSON | `Codable` | kotlinx.serialization |
| Images | `AsyncImage` plus a small cache; SVG marks drawn natively | Coil (see below) |
| Storage | Keychain; `UserDefaults` for cached instance description | Keystore-backed DataStore |
| Tests | Swift Testing, XCUITest | JUnit, Compose UI tests |
| Minimum OS | **iOS 18.0** | **Android 10 (API 29)**, targeting the current API level Play requires |

- iOS 18 gives `@Observable`, zoom transitions and the current sheet APIs with no fallbacks, and covers
  the three newest versions (18, 26, 27).
- Android 10 covers well over 90% of active devices and has system dark theme and gesture navigation.

Third-party dependencies, each justified:

| Dependency | Platform | Why |
|------------|----------|-----|
| OkHttp | Android | The platform's de facto HTTP client; named in the brief. |
| kotlinx.serialization, kotlinx.coroutines | Android | JetBrains' own; the standard for Kotlin. |
| AndroidX (Compose, Navigation, Lifecycle, Browser, DataStore) | Android | Google's own. |
| Coil | Android | Compose has no image loader of its own; Coil is the one Google's documentation uses. |
| Thinking orbs (vendored in `apps/ios/Livepeer/Vendor/ThinkingOrbs`; ported to Kotlin in `apps/android/.../design/orb`; MIT) | iOS, Android | The agent's working indicator, the same drawing as the web's `thinking-orbs` package. Vendored from a pinned commit rather than SwiftPM: the package tracks a branch of a 284 MB repository. |
| Material icons (extended) | Android | The platform's own icon set as Compose vectors. Unused icons are stripped from release builds. |
| None | iOS | Everything is in the SDK. |

## 9. Slices

For each: iOS first, then Android from the same spec with the iOS build as a behavioural reference, not a
transliteration. Then run both, screenshot every screen in dark and light into
`docs/screenshots/mobile/`, review against the design brief, consult the advisor, commit.

| Slice | Screens | Server work |
|-------|---------|-------------|
| 0. Design sample (before review) | Home, one conversation | `get_instance`, the Home operations, guest access, tokens and client generation |
| 1. Shell and sign-in | Tabs, account tray, sign-in, signed-out states, "update required", "not offered on phones" | Device sessions, `surfaces.mobile`, `get_me`, devices |
| 2. Home and chat | Home, history, conversation, agent steps, shots, model picker, cast picker, attach from library | `delete_conversation`, `agent_model`, `character_slug`, ETags |
| 3. Studio | Video, image, audio composers, stage, variants | None expected |
| 4. Library | Grid, search, filters, item, delete, ask about it, open in studio | None expected |
| 5. Characters | Mine and public, detail, create, start chatting, report, block | Character operations, reports |
| 6. Settings | Profile, general, privacy, plan and balance, usage, devices, delete account | Account, preferences, account deletion |

**The design sample signs in with a demo key.** Sign-in isn't approved yet, and a conversation needs a
caller. In mock-only mode only, the mock's key check accepts one documented demo key, which debug builds
send. It is refused outside `MOCK_ONLY=1` and is removed from the apps in slice 1.

## 10. Planned, not built: Studio Live and character calls

Both wait on live sessions (R2). What they need natively:

- **Capture.** Camera and microphone through AVFoundation and CameraX, with usage strings in each
  platform's manifest; screen capture through ReplayKit's broadcast extension and MediaProjection, each a
  separate component with its own review considerations.
- **Transport.** Whatever the engine's sessions speak. If that is WebRTC, both platforms need a WebRTC
  library, which is the one large third-party dependency this plan foresees (Q15: which transport, and is
  there a recommended client?).
- **While live.** An audio session that survives the lock screen, a foreground service on Android,
  thermal and battery handling, interruption handling (a phone call arrives), and a visible on-air state
  the whole time.
- **Calls.** Echo cancellation and voice processing, speaker and Bluetooth routing, a proximity sensor
  for voice calls. CallKit and Android's Telecom integration are not needed for calls the user starts.
- **Billing by the second** makes "end" the most important control: one red button, and the session
  closes when the app is killed (the server needs a heartbeat timeout).

## 11. Purchasing (*Decision*; nothing is built until then)

The apps show balance, plan and usage. Credits and plans are digital goods, so the stores have rules.
All *verify* at decision time.

| Option | What it is | Cost and risk |
|--------|------------|---------------|
| A. Show only | No buying and no pointer to buying in the apps. People top up on the web. | No fee. Review risk on iOS: an app whose paid features can't be bought in it may be asked to add in-app purchase. |
| B. In-app purchase and Play Billing | Credit packs as consumables, plans as subscriptions, through StoreKit 2 and Play Billing. The instance verifies each purchase with the store and tops up the allocation. | 15–30% to the store. Prices follow store tiers. Each publisher creates their own products. Needs a way for the provider to record a top-up paid elsewhere (Q16). |
| C. Link out | A link from the app to the instance's web Plan page. | Allowed only in some regions and programmes (the United States and the EU on iOS, with conditions; Google's user-choice and external-offers programmes). Rules have changed several times since 2025. |

Recommended: ship **A** for TestFlight and internal testing, and decide between B and C before the first
public store release, per store. Each publisher makes this choice for their own app; the flagship's
choice is the default in the template.

## 12. Characters and adult content (*verify* each rule at submission)

**What the stores require.**

- **Age rating.** Both stores ask a questionnaire and assign the rating; the answers must match what the
  app can show. User-created characters and generated media push the rating up.
- **User-generated content.** Apple (guideline 1.2) and Google (the UGC policy) both require: terms the
  user accepts, a way to **report** content, a way to **block** an abusive user or their content, action
  on reports within a stated time, and published contact details. Google's policy on generated content
  also requires in-app reporting of offensive generated results.
- **Mature content.** Neither store accepts an app whose purpose is pornographic material. Apple allows
  incidental mature content in a user-generated-content app only if it is hidden by default and the user
  turns it on **on the website**, not in the app.
- **Account deletion.** Apple requires that an app which supports account creation lets the user delete
  their account from inside the app.

**How the apps follow the instance's settings within those rules.**

- Characters appear only when `content.characters` is on, as on the web.
- Adult content on mobile needs all three: the instance allows it (`content.adultContent`), the instance
  allows it **on mobile** (new `content.mobileAdultContent`, default `false`), and the user has confirmed
  their age and switched it on **on the web**. The apps show the state of that setting and where to change
  it; they never offer the switch. An operator who turns the mobile flag on is declaring it in their store
  rating; the documentation says so.
- Public characters marked mature are filtered on the server for mobile callers unless all three hold, so
  an app never receives what it must not show. *Built in slice 5 as the strict case:* `list_characters` and
  `get_character` never return a character for adults only, and `create_character` never makes one. The
  `content.mobileAdultContent` flag isn't built; it relaxes this when it is.
- Every public character has **Report** (a reason, sent to the operator) and **Block** (hides that
  character and its author for this user). *Built in slice 5:* `report_character`, `block_character`, a
  store in `apps/web/lib/moderation`, and the console's Reports page, where an operator keeps a character up
  or takes it down for everyone.
- Settings has **Delete account**, behind a confirmation tray, calling `delete_account`.

## 13. Self-hosters: `./livepeer mobile` (designed now, built after the apps work)

Mobile is opt-in and never part of `./livepeer setup`. An operator who wants apps builds and publishes
their own, under their own developer accounts. The flagship app is produced by this same path.

```
./livepeer mobile init [--platform ios|android|all] [--json]
./livepeer mobile doctor [--json]
```

`init` reads `instance.config.json` and writes each platform's build config and nothing else:

| Build-time value | From | Written to |
|------------------|------|------------|
| App name | `name` | `Instance.xcconfig`, `instance.properties` |
| Instance URL | `domain` | same |
| Bundle identifier, application id | new `mobile.ios.bundleId`, `mobile.android.applicationId` | same |
| Icon | new `mobile.icon` (a 1024 px image), else the logo symbol on the panel colour | the asset catalogue, adaptive icon resources |

Everything else (theme, sign-in methods, enabled features, content settings) comes from `get_instance` at
run time, so an operator changes it without resubmitting to the stores.

`doctor` checks: `surfaces.mobile` is on, the domain serves `get_instance` over https, the identifiers are
set, Sign in with Apple is offered when rule 4.8 requires it, push credentials are present if
notifications are on, and the toolchain is installed.

CI templates in `deploy/templates/`: one workflow per platform that runs `mobile init`, builds, signs and
uploads to TestFlight and to Play's internal track, with signing material from the publisher's own
secrets. The repository's own release uses the same templates.

Documented in `deploy/README.md` and `AGENTS.md`: a publisher needs an Apple Developer account and a Mac
(or a macOS runner) for iOS, a Play Console account, signing keys, push credentials if they want
notifications, their own purchasing and content choices, and time for store review.

## 14. Tests, CI and docs

- **Tests.** Model decoding against the captured fixtures; the sign-in flow against the mock provider
  (code exchange, storage, 401 handling, sign-out); UI tests of the main flows on both platforms against a
  local mock-only instance (the Android emulator reaches the host at `10.0.2.2`).
- **No mock layer in the apps.** Development, tests and CI use a build pointed at an instance started
  with `MOCK_ONLY=1`.
- **UI tests** (`apps/ios/LivepeerUITests`, `apps/android/app/src/androidTest`) drive the main flows against
  that instance: a guest browsing Home and the studio and being asked to sign in at Generate; a signed-in
  person generating in the studio, opening the library, opening a character and reading Settings. Signing in
  is the real native flow without the browser: the test calls `/auth/start` with its own PKCE challenge,
  follows the mock provider's redirects to the app's callback, and redeems the code at `create_device_session`
  for a genuine device session. Android stores it in the app's `TokenVault` from inside the app's process;
  iOS passes it at launch in `LIVEPEER_UI_TEST_SESSION`, which only a Debug build reads (`signed-out` clears
  the vault). Tests find things by what a screen reader hears, not by private identifiers.
- **CI.** Two new jobs, `ios` (macOS runner) and `android` (Linux runner), each started only when its
  paths, `packages/mobile-codegen` or `docs/mobile/openapi.json` change. Each starts a mock-only instance,
  builds and runs its tests. The existing `check` and `install` jobs are unchanged, apart from the
  generated-code check added to `check`. The new jobs are not required status checks until they are
  stable.
- **Docs.** `CLAUDE.md` (mobile rules), `README.md` (folders, how to run each app, mobile is opt-in),
  `AGENTS.md` (non-interactive build and test commands), `docs/ui-actions.md` and `docs/data-sources.md`
  with a mobile column, `docs/design-proposals.md` with each mobile decision.

## 15. Needed from the project owner (none of it blocks the slices)

- Android Studio, the SDK and an emulator installed, with disk space freed (section 2).
- An Apple Developer Program team and a Play Console account, when signing and distribution start.
- Bundle identifiers for the flagship (proposed `org.livepeer.app`; *verify* who owns the name).
- An app icon for the flagship, or approval to derive one from the symbol.
- Push credentials (an APNs key, a Firebase project), when notifications are built.

## 16. Open questions

For the project owner:

Decided with the approval of the design sample (the recommended option in each case):

1. **Generator**: our own (4.3). Built.
2. **`surfaces.mobile` in the `full` preset**: off (4.5). Built.
3. **Device session store**: a file store now (5). Built.
4. **Callback**: custom scheme with PKCE for the first release (5). Built; universal links are the follow-up.
5. **Type**: system text with Geist Mono (7).
6. **Minimum OS**: iOS 18 and Android 10 (8).
9. **Operator role on phones**: device sessions are always `user`. Built. Reversed on 21 November 2026:
   the console comes to phones behind a separate operator device session (section 18; its open decisions
   are in 18.7).

Still open:

7. **Purchasing**: A for testing, then B or C per store? (11)
8. **Adult content on mobile**: the three-part rule in section 12?

For the engine and provider (added to `docs/engine-requests.md`):

- Q12: Do the provider's wallet and Coinbase sign-in flows complete inside a system browser session on a
  phone?
- Q13: Can the provider notify the instance when a user is disabled or deleted?
- Q14: Can the provider delete a user and their data on request, for in-app account deletion?
- Q15: Which transport will live sessions use, and is there a recommended native client?
- Q16: Can the provider record a top-up or a plan paid through Apple or Google?

## 17. What exists today

### Polish pass (20 November 2026)

- **The live aurora.** Home's night sky is now the web's shader on both phones: `Aurora.metal` as a SwiftUI
  layer effect on iOS, AGSL through `RenderEffect` on Android 13 and later. The photo's own glow is taken
  out, stars twinkle, and curtains are drawn over it; on the light theme the same aurora tints a pale sky
  under a 15% veil. It holds still with Reduce Motion or Remove animations, and in Low Power Mode or
  Battery Saver, and pauses when the app isn't in front. Sixteen ray steps instead of the web's 24, and
  Android draws it at half resolution, as the web caps its pixel ratio. The iOS backdrop is now as tall as
  the web's (86% of the screen, up to 820 pt). Not measured on real devices: the emulator is too slow to
  judge either way. Screenshots: `docs/screenshots/mobile/{ios,android}-home-aurora-{dark,light}.jpg`.
- **Screen readers.** Every tappable element on Android's main screens has a name (checked from the
  accessibility tree of each screen, signed out and in); every icon-only button on iOS has a label.
- **Largest text.** Android at font scale 2.0: tab labels shrink to one line instead of breaking mid-word,
  tile titles keep to one line so they never run into the length badge, a character's rating and the
  Home gallery's hint move to their own line, and Settings rows and the account tray put their numbers under
  the name. iOS at the largest accessibility size scales and scrolls as it should.

- **The agent's orb.** From libraries.dev, only thinking orbs met the brief (monochrome ink, motion only
  while something is happening, a still frame for reduced motion); border beam, metal, gooey, the image
  loader and bot avatars didn't, and the voice pieces wait for character calls. The orb is the agent's mark
  beside each turn, with no circle around it. While the agent works it shows the kind of work
  (`agentOrbState`: planning solves, watching searches, making media composes, writing a prompt weaves); when
  the turn is done it holds a still frame of the breathing ring. Web: `thinking-orbs` 0.3.2 from npm (7 KB gzipped, no dependencies, no install scripts). iOS: the
  SwiftUI port vendored at commit `14ae9d2`. Android: a Kotlin port of the six states the app uses
  (`design/orb`), checked dot for dot against the library's own golden frames (24 cases, within 0.0001).
  Screenshots: `docs/screenshots/mobile/{ios,android}-chat-orb-dark.jpg`.

Not done in the polish pass: a real-device performance check of the aurora, and an automated accessibility
audit in a UI test target (`performAccessibilityAudit`), which the project doesn't have yet.

### UI tests and mobile CI (20 November 2026)

- **UI tests.** Four main flows on each platform against a mock-only instance: a guest browses Home and the
  studio and is asked to sign in at Generate; a signed-in person generates a shot and watches it render, opens
  the library and a character, and reads Settings. iOS: `LivepeerUITests` with its own scheme, so the unit
  tests still run without an instance; 4 of 4 pass in about 80 s. Android: `androidTest` with Compose UI tests;
  4 of 4 pass in about 30 s.
- **Signing in.** The real native flow without the browser (section 14). The only app change is iOS's
  Debug-only `LIVEPEER_UI_TEST_SESSION`.
- **Android notes.** Compose's test library brings Espresso 3.5, which calls an input API removed in API 37, so
  Espresso is pinned to 3.7. The tests grant `ACCESS_LOCAL_NETWORK` themselves, since a test run installs the
  app fresh, and turn system animations off so the aurora and the orb let the screen settle.
- **CI.** `.github/workflows/mobile-ios.yml` (macOS) and `mobile-android.yml` (Linux, an API 37 emulator), each
  started only by its own app's paths and what the apps share (the public API, the generator, the dev config). Each starts a mock-only instance, then runs the unit and UI tests. Not required checks yet.
- **Toolchain.** Development and iOS CI use Xcode 27 and an iOS 27 simulator (the `xcode-27` runner, which GitHub still labels a preview). The app's minimum stays iOS 18.
- **When CI runs.** Each app's check runs when a pull request that touches it (or what the apps share) is opened
  or marked ready, and when asked: add the `run-ios` or `run-android` label (remove and add it again for another
  run) or start Mobile iOS or Mobile Android by hand. Not on every push, since changes are built and tested on a
  simulator and an emulator locally first, and not after merging. Each takes 8 to 10 minutes; macOS minutes
  count ten times, so an iOS run costs about 97 billed minutes and an Android run about 8. On iOS the
  build takes about a minute and a fresh simulator's boot about six, so the job boots it first and builds while it
  boots, then runs unit and UI tests in one pass (the `LivepeerAllTests` scheme): about 12 minutes down to
  about 10. The instance compiles each route on first use, so the job asks for sign-in and the API during
  the build, not the tests. Android caches Gradle and a booted emulator between runs.

### Slice 6: Settings (20 November 2026)

- **Server.** `get_account` (its type renamed `PlanAndCredits`, so it can't be confused with who is signed
  in), `get_preferences`, `update_preferences` (adult content and the age confirmation are refused from a
  device session with `web_only`), `get_privacy` (the web's privacy tiers, now shared through
  `@livepeer/user-app/privacy`), and `delete_account`: the provider deletes the user
  (`identity.deleteUser`, new; Batteries answers 501, Q14), every device session ends, and the person's
  blocks are forgotten while their reports stay, unattributed. Left out of MCP.
- **Web.** Settings ▸ Devices lists the phones and tablets signed in and signs any out; Settings ▸ Profile
  has Delete account, confirmed in a sheet.
- **Both apps.** Settings opens from the account tray: who you are, then Plan and credits (balance and plan,
  nothing to buy), Usage (totals, by capability, recent jobs), Preferences (shape, length, saving
  conversations, asking before spending; adult content shown as On or Off with where to change it, never
  switched), Devices (sign out any other phone), Privacy, and Delete account. iOS 22 tests, Android 27 unit
  tests.
- **Run on both** against a mock-only instance: every page in dark and light; a preference changed and read
  back from the API; another device signed out; the account deleted on each, which signed every device out
  with "Your account was deleted." Screenshots:
  `docs/screenshots/mobile/{ios,android}-settings{,-plan,-usage,-preferences,-devices,-privacy,-delete}-{dark,light}.jpg`.
- **Found while running it.** On iOS the switches were white on white in the dark theme: they took the
  foreground colour as their tint. On Android the delete dialog closed when the activity was recreated.

Not done in slice 6, and why:

- **Buying credits or a plan.** Option A of section 11 until the store decision is made: the apps show the
  balance and plan and say nothing about buying.
- **Notifications when a render finishes,** and **Enter sends**: the first needs push, which isn't built; the
  second is a keyboard setting for the web.
- **The preferred shape and length don't yet set the composer's starting values** on any surface; they are
  saved to the account for when they do.

### Slice 5: Characters (20 November 2026)

- **Server.** `get_character`; `list_characters` and `get_character` open to guests (shared characters only);
  `create_character` (private unless shared, never for adults only); `report_character` and
  `block_character`, kept in `DATA_DIR/moderation.json` by `apps/web/lib/moderation` behind a `StateStore`
  that device sessions now share (`apps/web/lib/data`). Everything that reads characters, on the API and on
  the web, leaves out what the operator took down and what the person blocked. The console has a Reports
  page: open reports first, then decided ones, with Keep it up and Take it down (confirmed).
- **Both apps.** The Characters tab: yours (or the way to make your first), then shared by others, with
  search; guests see the shared ones. A character's page: portrait, who they are, how they open, and Cast
  them in a scene, which puts them in Home's composer. Someone else's character has Report (a reason and a
  note, in a tray) and Block (confirmed; it and everything by its author leave at once). New character is a
  form: name, one line, who they are, how they open, and Share with everyone here. iOS 20 tests, Android 25
  unit tests.
- **Run on both** against a mock-only instance: browsed, searched, reported Mara, blocked her, created Wren,
  cast Wren in a scene; the report showed in the console and taking Mara down removed her for guests too.
  Screenshots:
  `docs/screenshots/mobile/{ios,android}-{characters,characters-yours,character,character-report,character-block,character-new}-{dark,light}.jpg`.
- **Web.** A character's page has the same Report and Block, in a ⋯ menu beside the name, in sheets; a guest
  is sent to sign in first.
- **Found while running it.** Android couldn't send a POST with no inputs: OkHttp refuses a bodiless POST,
  so Block never left the phone. The transport now sends an empty object. On the web, a new server action
  isn't registered until the dev server restarts.

Not done in slice 5, and why:

- **Talking to a character.** The web's Start chatting sends the message as an ordinary request: the
  conversation API has no way to answer in character, and `character_slug` means "put them on screen". The
  apps lead with Cast in a scene and leave talking out until conversations can answer in character (calls,
  section 10, are the other half of it).
- **Editing or deleting a character,** and a portrait for a new one: the API client has neither yet.

### Slice 4: Library (20 November 2026)

- **Both apps.** The Library tab searches by what is on screen (`search_library` with `query` and `kind`),
  with a search field that is always visible, All, Video, Image and Audio chips, and a two-column masonry
  grid with each item's type and length. An item opens a tray: the still, what's in it, its tags, Open in the
  studio, Ask about it (a conversation with the item attached, asking for a summary and the key moments), and
  Delete, confirmed. Loading, failure, empty and no-match states. iOS 17 tests, Android 21 unit tests.
- **Run on both** against a mock-only instance: searched, filtered, opened an item, asked about it (the
  conversation came back with its moments), opened it in the studio, deleted it with confirmation. Screenshots:
  `docs/screenshots/mobile/{ios,android}-library{,-search,-item,-no-match}-{dark,light}.jpg`.
- **Found while running it.** Opening the studio with words before it had loaded left the draft with no
  mode or length ("0s"), on both apps, from slice 3. A draft made before the studio loads now gets the
  medium's defaults when it loads, keeping the words.

Not done in slice 4, and why:

- **Convert or export** opens the Developers pages, which stay on the web.
- **Adding to the library from the phone** (camera roll, files) needs uploads (`uploadMedia`), as the
  studio's References and Edit do.

### Slice 3: Studio (20 November 2026)

- **Server.** `list_studio_mediums`, the web's studio (`describeStudio` in `mediums.ts`) resolved against
  the network, with a words-only placeholder for clients that can't add inputs and a `needs_input` flag;
  `quote_generation`, the web studio's quote. The web's empty-stage copy no longer says "on the left".
- **Both apps.** A Studio tab with Video, Image and Audio, a draft for each, the settings each medium and
  mode have, Generate with its cost, a guest asked to sign in, up to four variants rendering in place and
  followed with backoff, "Use these words again" on a result, and "Open in the studio" from a finished shot
  or a found moment. iOS 16 tests, Android 18 unit tests.
- **Run on both** against a mock-only instance: a video and four images generated and finished; Audio's two
  modes; opened from a conversation. Screenshots:
  `docs/screenshots/mobile/{ios,android}-studio-{video,image,audio}-{dark,light}.jpg`,
  `ios-studio-rendering-*.jpg`, `android-studio-rendering-*.jpg`.
- **Found while running it.** Android read every reply on the main thread after the request returned; a
  reply still arriving (four images at once) threw, and Generate said it hadn't started. Replies are now read
  on the IO dispatcher. This was very likely slice 2's unreproduced "library didn't load" too. On iOS the
  prompt box needed the same tap-anywhere fix as the composer.

Not done in slice 3, and why:

- **References, Edit and first and last frames** need uploads, which the API client doesn't have yet
  (`uploadMedia`).
- **The live aurora** stays a still photograph. It's a design port (Metal and AGSL) with no flow behind it;
  it moves to a polish pass after the slices rather than holding up Library.

### Slice 2: Home and chat (20 November 2026)

- **Server.** `delete_conversation`; `list_agent_model_menu`, the agent's model menu named by the web's own
  rules; `list_capability_labels` names the agent's models too, so a step the agent planned reads "Gemma 3
  27B" and not the app's path; `send_message` takes the shot's capability, shape and length; every read
  answers with an `ETag` and 304 while nothing changed.
- **Both apps.** The composer's + menu (attach from the library, put a character in it, the agent's model),
  chips for what is chosen, the attach and cast trays, the model and cast carrying on through a
  conversation, "With Mara" on sent messages, History with search and swipe to delete, conversations opened
  by id, and ETags in the transport (checked in the server log: repeat reads come back 304). iOS 14 tests,
  Android 15 unit tests.
- **Run on both** against a mock-only instance: cast Mara and send (the agent casts her, the shot renders,
  she stays cast); attach a library video and send with no words (a summary and its moments come back);
  delete from History; open an older conversation. Screenshots:
  `docs/screenshots/mobile/{ios,android}-{home-cast,cast,attach,chat-cast,history}-{dark,light}.jpg`,
  `ios-chat-attached-*.jpg`, `android-menu-*.jpg`.
- **Found while running it.** On iOS a tap on the second line of a wrapped placeholder missed the field
  (now the whole field focuses it); the swipe-to-delete action took the app's tint instead of red; an
  agent step named the chosen model by its app path.

Not done in slice 2, and why:

- **Opening a shot or a found moment in the studio** waits for the studio (slice 3).
- **The live aurora** on Home (a Metal and AGSL port of the web's shader) is still a still photograph.
  It's design work of its own and doesn't block any flow (see slice 3).
- **Server-sent events** wait for the engine's events feed (R2), as planned.
- **Not reproduced at the time:** once on Android the attach tray said the library didn't load, while the
  server had answered 200. Found and fixed in slice 3 (replies read on the main thread).

### Slice 1: shell and sign-in (20 November 2026)

- **Server.** Device sessions (`apps/web/lib/devices`): the native branch of `/auth/start` and
  `/auth/callback`, the one-time code, `create_device_session`, `end_device_session`, `get_me`,
  `list_devices`, `revoke_device`, and `authenticate()` accepting `aqd_` tokens. `surfaces.mobile` and the
  `mobile` block in the schema, presets, `get_instance`, the console's Phone apps switch and the proxy (the
  API and the sign-in flow are served to the apps even with the API surface off). A stable `code` on API
  errors (`signed_out`, `mobile_off`, `account_required`, `sign_in_expired`). Suspending a user ends their
  device sessions. `DATA_DIR`, the `app-data` volume, and `docs/mobile/dev.instance.config.json`, a mock-only
  config with the apps switched on. The demo key is gone from both apps.
- **iOS.** `ASWebAuthenticationSession` with PKCE, the token in the Keychain (this device only, after first
  unlock), 401 returning to signed out with "You've been signed out.", `mobile_off` and old builds handled by
  the availability gate. Tabs (Home, Library, Characters), the account button and tray, the sign-in tray,
  signed-out and empty states, and simple Library and Characters lists. 11 tests pass.
- **Android.** The same, with an Auth Tab (falling back to a Custom Tab and the app's own scheme), the token
  encrypted with an Android Keystore key, Material navigation bar and bottom sheets. 12 unit tests pass.
- **Run on both** against a mock-only instance: guest → sign in → send → the conversation opens; sign out
  ends the session on the server; a session revoked from another device returns the app to signed out;
  switching the apps off shows "Not on phones right now". Screenshots in dark and light:
  `docs/screenshots/mobile/{ios,android}-{home-guest,home-signed-in,sign-in,account,account-guest,library,library-guest,characters,not-offered}-{dark,light}.jpg`.
- **Checked at the largest text size on iOS**: Home's headline now scales, and trays scroll when taller than
  the screen. Android follows the font scale through `sp` sizes; not yet checked at 200%.
- **Found while running it.** The sign-in callback was built from the server's idea of its own address, so
  the Android emulator (which reaches the host at `10.0.2.2`) was sent to `localhost`. Sign-in addresses now
  come from the configured domain, or the address the request came in on.

Not done in slice 1, and why:

- **Settings ▸ Devices screens** on mobile and web: the API exists; the screens are slice 6 with the rest of
  settings.
- **Universal Links and App Links**: the custom scheme ships first, as decided.
- **A screen reader pass** on both platforms, and Android at the largest font scale: labels and traits are
  set, but neither has been walked through end to end.

### The design sample

Built and run on 19 November 2026 against a mock-only instance:

- **Server.** `get_instance`, the Home reads and `list_capability_labels`, open to guests; `agent_model`
  and `character_slug` on conversations; each operation's `output`; `docs/mobile/openapi.json`; the
  mock-only demo key.
- **Generation.** `packages/mobile-codegen` writes Swift and Kotlin design tokens (35 colours in both
  themes, radii, type sizes, motion) from `tokens.css` and `motion.ts`, and the Swift and Kotlin models and
  clients (53 types, 22 operations each) from the OpenAPI document. CI fails when they are stale.
- **iOS.** Home and a conversation, in dark and light, with Dynamic Type, VoiceOver labels and Reduce
  Motion: `docs/screenshots/mobile/ios-*.jpg`. Eight tests pass, decoding the captured responses in
  `docs/mobile/fixtures/`.
- **Android.** The same two screens in Compose, run on the API 37 emulator in dark and light:
  `docs/screenshots/mobile/android-*.jpg`. Nine unit tests pass against the same fixtures. Two things
  running it turned up: from Android 17 an app needs `ACCESS_LOCAL_NETWORK` to reach a private address such
  as the emulator's host, so debug builds declare it (release builds don't); and the instance now builds
  its absolute URLs from the address the client used, not its own idea of its origin.

Not done, and why:

- **Not yet checked on either platform:** the largest font sizes, a screen reader pass, animations
  switched off, and the composer's shared transition on Android beyond seeing it run. Slice 1 starts with
  those checks.
- **Android has no backdrop blur.** Compose can't blur what is behind a control on every supported
  version, so glass there is a more opaque fill with the same edge.
- **Type option B (Inter bundled): no sample.** Inter isn't in the repository as a font file the app can
  bundle (the web loads it as WOFF2). It needs a download of Inter's own TTF, which needs a yes. The
  sample shows option A: system text with Geist Mono for facts.
- **The live aurora** on Home is a WebGL shader on the web. The sample shows the instance's still
  photograph on the dark theme and a plain page on the light theme; a Metal and AGSL port is slice 2 work.
- **A logo in more than one colour** (`logo.tint: false`) can't be drawn from path data alone, and iOS has
  no SVG image decoder. Proposed: the instance serves a PNG rendition of each mark for clients that ask.
  Until then such an instance shows its name in type on mobile.
- **Tabs, the account tray, sign-in and trays** are slice 1, after the sign-in proposal is approved.

## 18. The operator console on phones (proposed 21 November 2026)

Status: **accepted; the server and stage 1 on iOS and Android are built (18.8). The owner approved the design
sample on 21 November 2026. Stage 2 is next.** The owner accepted every recommendation in
18.7. This section reverses two earlier lines: the console "stays on the
web" (section 1) and device sessions "always have the `user` role" (section 5). Decisions the owner still
has to make are in 18.7. A builder can start from this section alone, after reading sections 4, 5 and 7.

### 18.1 Why, and for whom

- **Console-only instances.** An instance with `surfaces.app` off (the `headless` preset) serves an API and a
  console and has no user app. Its operator has nothing to install today, and on a phone's browser 10 of the
  console's 13 pages scroll sideways and the navigation is one long strip.
- **Instances with both.** An operator is also a user. They get one app and switch between the user app and
  the console.
- **What a phone is for.** Checking that the service is healthy, seeing what failed, deciding a report and
  stopping an abusive account, away from a desk. Setting prices, keys, billing and instance settings stays a
  desk job on the web.

The console goes into the same apps (`apps/ios`, `apps/android`), under the same rules: native UI, clients of
`/api/v1` only, no mock layer, every action an operation defined in `operations.ts` first.

### 18.2 Security

The property to keep: **a phone alone is never enough to administer an instance.** Today that holds because
phones can't do operator work at all. After this change it holds because operator work on a phone needs
three things together: an operator device session, a key that never leaves the phone's secure hardware, and
the operator's face or fingerprint at the moment of use.

**A separate session.** The operator device session is a different record, token and store entry from the
user device session of section 5. It does not replace it and neither can stand in for the other.

| | User device session (today) | Operator device session (new) |
|---|---|---|
| Token prefix | `aqd_` | `aqo_` |
| Who | Any signed-in user | Only an identity the provider marks `operator`, as on the web |
| Can run | User operations | Only operator operations marked for phones (below), plus `get_instance` and `get_me` |
| Holds a builder key | Yes, sealed | No. It can't run a job or spend credit |
| Idle expiry | 90 days | 7 days |
| Absolute expiry | None | 30 days, then sign in again |
| Bound to a device key | No | Yes |
| Biometric to use | No | Yes, every time the console opens and for every change |
| Switched on by | `surfaces.mobile` | `surfaces.mobileConsole`, off in both presets |

On an instance with both surfaces an operator's phone holds both sessions. The user app keeps working when
the operator session expires or is revoked.

**Signing in on a phone.**

1. The person chooses "Open the console" (from the account tray, or the first screen of a console-only
   instance). If the phone has no enrolled biometrics, the app says the console needs Face ID or a
   fingerprint and stops.
2. The app creates a P-256 key pair in the Secure Enclave (iOS, access control `biometryCurrentSet`) or
   StrongBox/TEE Keystore (Android, `setUserAuthenticationRequired(true)`, biometric class 3,
   `setInvalidatedByBiometricEnrollment(true)`). The private key can't be exported, and it is destroyed if
   the phone's enrolled faces or fingerprints change.
3. The app starts the section 5 flow with `purpose=operator`: PKCE, the system auth session, the instance's
   own callback. The instance asks the provider for a **fresh** sign-in (`prompt=login`, `max_age=0`), so a
   browser cookie left on the phone doesn't grant operator access by itself.
4. At the callback the instance mints the one-time code only if the identity's role is `operator`. Anyone
   else is returned to the app with "This account doesn't run this service."
5. The app posts the code, the verifier, the device name and the **public key** to
   `POST /api/v1/auth/operator-device`. The instance stores the session (keyed hash of the token, user id,
   name, device name, platform, public key, created, last used, last unlocked) and returns the `aqo_` token.
6. The token goes in the Keychain or Keystore-encrypted storage, device-only, never in a backup.

Enrolling a phone needs nothing from the web console. The reasoning: the provider sign-in that enrols a
phone is the same one that opens the web console for 8 hours, so a pairing step would add friction without
raising the bar. The web console shows a notice when a new phone is added, and lists and revokes them.

**Unlock, and proof for each change.** The token alone does nothing. Two proofs, both signatures made by
the device key, which the phone only makes after a biometric match:

- **Unlock** (to read). When the console opens, the app asks for a challenge, signs it (the system shows
  Face ID or the fingerprint prompt), and posts the signature. The instance verifies it against the stored
  public key and marks the session unlocked for **5 minutes**. Read operations need an unlocked session.
  The app locks the console itself when it goes to the background for more than a minute, and the server
  window ends regardless.
- **Confirm** (to change something). Every operator operation that changes anything needs its own proof: a
  challenge bound to the operation name and a hash of its input, signed after a new biometric prompt, sent
  as `X-Operator-Proof: <nonce>.<signature>`. A nonce is used once and lasts 60 seconds. An unlocked
  session is not enough for a change.

No passcode fallback: if biometrics fail or are unavailable, the console is not available on that phone and
the person uses the web.

**What the server checks on every operator operation from a phone**, in order, refusing at the first
failure:

1. `surfaces.mobileConsole` is on (else 403 `mobile_console_off`).
2. The token matches a stored operator session that is inside both expiries (else 401).
3. The operation is marked for phones (else 403 `web_only`). This is an allow-list: an operator operation
   with no mark, including any added later, is refused.
4. For a read: the session is unlocked (else 401 `locked`, and the app shows the lock screen).
5. For a change: a valid, unused proof bound to this operation and this input (else 401 `proof_required`).
6. Rate limits per session. Five failed proofs in a row revoke the session.
7. Every sign-in, unlock, change, refusal at steps 3 to 6 and revocation is written to an audit log (who,
   which phone, which operation, which target, when), kept in the instance's data volume and shown on the
   web console's System page.

**How `authenticate()` and the role guard change.**

- `Caller` gains `via: "operator_token" | "browser" | "api_key" | "device" | "operator_device"`, and for an
  operator device the session id and `unlockedUntil`.
- `authenticate()` gets one new branch for `aqo_`, before the `aqd_` branch: flag check, lookup in the
  operator sessions, then a `Caller` with `operator: buildOperatorClient()` and `via: "operator_device"`.
  The `aqd_` branch is unchanged and still returns `operator: null`.
- The checks above run in one place, the API dispatcher that runs an operation, not in each operation:
  when `via` is `operator_device` it applies steps 3 to 6 before `run`. The existing `operator(context)`
  guard in `operations.ts` stays as the second line.
- An `aqo_` token is refused on every non-operator operation except `get_instance` and `get_me`.
- `checkAccess` (the web role guard) does not change. An `aqo_` token is only read from the
  `Authorization` header by the API; it never opens `/operator` pages and never becomes a cookie.
- The engine reader and admin tokens stay inside `buildOperatorClient()` on the server. The phone sends
  `aqo_` and a proof, and receives JSON. Nothing in an operator response may contain a token or a key; the
  schema test of 4.2 asserts this for the phone operations.

**Revocation.**

- Web console ▸ System ▸ **Operator phones** lists every operator device session (person, phone, added,
  last used, last unlocked) with Revoke on each and Revoke all. This page is web-only.
- The app's console has "Sign out of the console on this phone", which deletes the session and the device
  key.
- Suspending the person, or rotating `SESSION_SECRET`, ends their operator sessions as it ends the others.
- Role removal at the provider: the role is read at sign-in, so a removed operator keeps a phone session
  until it is revoked or reaches 30 days. Revoke it from the web console when removing an operator. A
  provider back-channel (Q13 in `docs/engine-requests.md`) would close this gap, for web sessions too.

**Which operations a phone can call.**

| Operation | Phone | Stage |
|---|---|---|
| `operator_status` (new), `operator_health`, `operator_overview` | Read, unlocked | 1 |
| `operator_list_jobs` | Read, unlocked | 1 |
| `operator_list_reports` | Read, unlocked | 1 |
| `operator_list_users` | Read, unlocked | 1 |
| `operator_resolve_report` | Change, proof each time | 1 |
| `operator_set_user_status` (suspend, resume) | Change, proof each time | 1 |
| `operator_costs`, `operator_list_grants`, `operator_list_plans`, compute and capability reads | Read, unlocked | 2 |
| `operator_top_up_user`, `operator_assign_plan` | Web only (decision 6 in 18.7) | 4 at the earliest |
| `operator_set_capability` (offered, markup, surfaces), pricing | Web only | — |
| `operator_list_keys` and every key operation | Web only | — |
| `operator_create_grant`, billing | Web only | — |
| Instance settings, surfaces, sign-in methods | Web only | — |
| Operator phones list and revoke | Web only | — |

**Threats.**

| Threat | What stops it |
|---|---|
| Lost or stolen phone, locked | Token is device-only storage; the device key needs a biometric match. Nothing is reachable. |
| Lost or snatched phone, unlocked, console open | Reads for at most 5 minutes (the app also locks on background). No change without a new biometric match. The operator revokes it from the web. |
| Thief knows the phone's passcode | No passcode fallback. Adding their own face or fingerprint destroys the device key, and the session is dead. |
| Token stolen (backup, malware, proxy, logs) | Useless without the device key: it can't unlock or sign a proof. Tokens are stored as keyed hashes on the server. |
| Captured request replayed | A proof is bound to one operation and input, single use, 60 seconds. An unlock challenge is single use. TLS throughout. |
| A user-role `aqd_` session calls operator routes | `operator: null` → 403, as today. A test calls every operator operation with a user device token. |
| An `aqo_` session calls a web-only operation | Allow-list at the dispatcher → 403 `web_only`. A test calls every unmarked operator operation. |
| An `aqo_` session used to run jobs or spend | It holds no builder key and is refused on user operations. |
| Another app claims the callback scheme | It gets a code it can't redeem without the PKCE verifier, and a session it can't use without the device key. |
| Someone who knows an operator's provider password | Same exposure as the web console today, no more. A new phone raises a notice in the web console; operators should have a second factor at the provider. |
| Former operator | Revoke on removal; 30-day absolute expiry as the backstop. |
| A build pointed at someone else's instance | Callback redirects go only to the identifiers in that instance's config (section 5). |
| Rooted or jailbroken phone | Not defended beyond hardware-backed keys. Stated, not solved. |

### 18.3 Scope, in stages

| Stage | What it adds | Changes allowed |
|---|---|---|
| 1. Away from the desk | Console sign-in, unlock and lock, switching from the user app. **Status** (health and what needs attention). **Jobs** (recent, failures, one job's attempts). **Reports** (the queue, keep up or take down). **Users** (search, one user, suspend and resume). Web: Operator phones page, audit log. | Resolve a report; suspend and resume a user |
| 2. The numbers | Revenue, wholesale cost and margin over time; costs by capability; grants and their funding; compute operators; what's offered; system version and checks. All read-only. | None |
| 3. Being told | Push alerts when the engine stops being ready, failures spike or a report is waiting, with a per-operator choice of which. Needs push credentials and device-token operations. | None |
| 4. Selected changes | Only after the owner decides each: top up a user (capped), assign a plan, switch a capability off, block a compute operator. | As decided |
| Stays on the web | API and access keys, pricing and markup, billing, credit packs, creating grants, instance settings, surfaces, appearance, operator phones. | — |

### 18.4 Design direction

A redesign for a phone, not the web tables at 375 px. `docs/design-brief.md` holds: same tokens, one ink
action per view, green never on a control, mono for facts, each view answers one question, a tray's tint
carries the stakes, almost no delight. The web console's 32 px controls do not carry over: targets stay
44 pt and 48 dp. Density comes from two-line rows and mono facts, not small controls.

**The first screen is Status, and it answers "is anything wrong?"**

- One sentence in the page-title size: "Everything is running." or "2 things need you." A dot beside it:
  green when all is well (a state, not a control), the destructive colour when something is down.
- **Needs you**, shown only when there is something: "Engine isn't ready", "Costs haven't synced for 3 h",
  "14 jobs failed in the last hour", "3 reports are waiting". Each row opens the place to deal with it.
  What counts as wrong is decided by the server (`operator_status`), so web and phones agree.
- **Today**: active users, jobs, failed, revenue and margin, as mono facts. Numbers roll only changed digits.
- **Service**: engine, discovery, cost sync, version, each one row with its state and "12 s ago" in mono.
- Pull to refresh. "Checked 12 s ago" under the title. Loading is skeleton rows of the final height, so
  nothing shifts. If the instance can't be reached, the sentence says so and offers Try again.

**Navigation.** Four tabs: **Status, Jobs, Reports, Users**. Reports carries a count of open reports. From
stage 2 a fifth tab, **More**, is a grouped list using the web console's groups (Money, Network, Instance)
with only what the phone offers, and one line at its foot: "Keys, pricing, billing and settings are on the
web console", which opens it in the browser. Thirteen pages never become thirteen tabs.

**Tables become lists; detail is a pushed screen.**

- A row is two lines: what it is, then its facts in mono (when, cost, attempts, id tail). State is a
  leading word or dot, never a colour alone.
- Filters are chips above the list (Jobs: All, Failed, Running). Users has a search field that is always
  visible. Lists load more as they scroll and pull to refresh.
- Tapping a row pushes a detail screen: a grouped list of facts. Ids copy on long press; the share sheet
  sends a job's summary. A failed job shows each attempt, its compute operator and the error as written.
- Reports is a queue, as on the web (decision 55): the character and author, the reason, the reporter's
  words, when. Who reported is never shown. Decided reports sit below.
- Every list has an empty state in real words ("No reports are waiting.", "Nothing has failed today.").

**Changes look like changes.**

- A change starts from a button on a detail screen, never a swipe on a row.
- It opens a tray (section 7's tray rules) that says what will happen, to whom, and whether it can be
  undone: "Suspend Dana Okafor? Their work stops and their phones are signed out. You can resume them at
  any time." One action button, named for the action. Take it down and Suspend are red, in a tray with the
  destructive tint; Keep it up and Resume are ink.
- Pressing it shows the system biometric prompt with the same words. Then the tray closes, the row and
  detail update in place, and there is one haptic. A refusal puts everything back and says why.
- Nothing is optimistic for operator changes: the screen changes when the server has confirmed.

**Visibly not the user app.**

- **Entry.** On an instance with both, the account tray has an "Operator console" row, shown only when
  `get_me` says the person is an operator and `get_instance` says the console is offered on phones. It
  asks for the biometric, then the console covers the whole app with its own tab bar. It is a separate
  place, not a fifth tab among the user's.
- **A standing label.** Every console root carries the instance's mark and CONSOLE in small mono capitals
  where the user app has its title area, and a "Back to the app" button where the avatar sits. No
  composer, no media, no home background.
- **Locked.** When the console is locked or the unlock has lapsed, a lock screen covers it: the instance
  mark, "Unlock the console", one ink button. No data shows behind it. The app-switcher snapshot of the
  console is blank.
- **Console-only instances** open straight to the console's sign-in ("Sign in to run <instance name>") and
  have no user tabs, account tray or guest state at all.

Copy follows the rules: real words, no category labels. Accessibility as section 7: largest text sizes
reflow (facts move under what they describe), VoiceOver and TalkBack labels on every row and state, both
themes. Each decision is logged in `docs/design-proposals.md` as it is built, and every screen is
screenshotted in dark and light into `docs/screenshots/mobile/`.

### 18.5 API and codegen

**Marking operations.** In `operations.ts` an operator operation gains `mobile?: "read" | "confirm"`. No
mark means web-only. The dispatcher reads the mark (18.2); nothing else decides what a phone may call. A
test fails if an operation has `mobile` without `operator: true` or without an `output`.

**The OpenAPI document and the generated clients.**

- `pnpm api:openapi` writes marked operator operations with `x-operator: true` and `x-mobile`. Unmarked
  operator operations stay out of the mobile clients, as today.
- `packages/mobile-codegen` writes them into a **separate** generated type, `OperatorAPI`, in its own file
  in each app. It can only be constructed from an operator session, and a `confirm` operation's generated
  function takes a proof, so calling one without it doesn't compile. The user client gains nothing.
- The fixtures test of 4.2 runs the marked operator operations against a mock-only instance and saves their
  responses for the native decoding tests. The stale-output CI check covers the new file.

**New and changed operations**, each added to `operations.ts` first, with its `output`, and to
`docs/data-sources.md` and `docs/ui-actions.md` with their Mobile columns:

| Operation | Method and path | Notes |
|---|---|---|
| `create_operator_device_session` | `POST /auth/operator-device` | Code, verifier, device name, platform, public key → token and session. No authentication, like `create_device_session`. |
| `delete_operator_device_session` | `DELETE /auth/operator-device` | Signs this phone out of the console. |
| `create_operator_challenge` | `POST /operator/device/challenge` | `purpose`: `unlock`, or an operation name with an input hash → nonce, 60 s. |
| `unlock_operator_device_session` | `POST /operator/device/unlock` | Nonce and signature → `unlocked_until`. |
| `operator_status` | `GET /operator/status` | One call for the Status screen: health, today's figures, and the list of things that need attention with counts. Composed on the server from existing client functions. `mobile: "read"`. The web overview can use it too. |
| `operator_list_devices`, `operator_revoke_device` | `GET /operator/devices`, `DELETE /operator/devices/{id}` | Web-only. Behind the Operator phones page. |
| `operator_list_audit` | `GET /operator/audit` | Web-only. Behind the audit log on System. |
| `operator_list_jobs` (changed) | — | Add `status` and a `before` cursor, so the list filters and pages. |
| `operator_list_users` (changed) | — | Add `query`, so search runs on the server. |
| `get_instance` (changed) | — | `surfaces` gains `console` and `mobile_console`. |
| `get_me` (changed) | — | Gains `role`, so the app knows whether to offer the console. Offering is not access: the server decides. |

Check before adding a per-job or per-user read: if the list responses already carry what the detail screen
shows, no new operation is needed. Stage 3 adds push-token operations; they are specified with that stage.

**Config.** `surfaces.mobileConsole: boolean` in the instance schema, `false` in both presets, with a
switch on the web console's Surfaces settings and a check in `./livepeer doctor`. It is independent of
`surfaces.mobile`: a console-only instance turns on `mobileConsole` alone.

**Storage.** Operator sessions, pending challenges and the audit log go behind the same store interface as
device sessions (file-backed now, the database later), in separate files from user device sessions.

### 18.6 Build order and review points

1. **Server first.** The flag, operator device sessions, challenges and proofs, the `authenticate()`
   branch, the dispatcher allow-list, the audit log, the web Operator phones page, the new operations, and
   the tests in the list below. No app code depends on anything unreviewed.
   **Review point A (security):** the owner reviews this change by itself, with `/security-review` run on
   it, before any app work merges.
2. **iOS design sample.** The Status screen and the Jobs list with one job's detail, against a
   `MOCK_ONLY=1` instance, in dark and light and at the largest text size.
   **Review point B (design):** the one stop for the owner. Nothing else is built until it is approved.
3. **iOS, rest of stage 1.** Console sign-in, unlock, lock screen, the switch from the account tray, the
   console-only launch, Reports, Users, suspend and resume.
4. **Android, stage 1**, from the same spec with the iOS build as a behavioural reference.
5. Stages 2 to 4, each iOS then Android, each committed as a slice with screenshots.

**What needs the most careful review:**

- `authenticate()` and the dispatcher: the allow-list defaults to refusing, and no path reaches `run`
  around it.
- Proof verification: single-use nonces, binding to operation and input, expiry, and constant-time
  comparison.
- Key creation on each platform: hardware-backed, biometric-only, invalidated when biometrics change. A
  wrong flag here silently removes the protection, and a simulator can't show it. Test on real phones.
- The operator sign-in forcing a fresh provider sign-in, and refusing a non-operator identity.
- Revocation taking effect on the next request.
- Operator responses carrying no token, key or builder key.

**Tests the server change must include:** every operator operation with a user `aqd_` token → 403; every
unmarked operator operation with an `aqo_` token → 403 `web_only`; an `aqo_` token on a user operation →
refused; a read while locked → 401 `locked`; a change with no proof, a reused proof, a proof for another
operation or other input, an expired proof, and a proof from another key → refused; both expiries; flag
off; revoke, then the next call fails; five bad proofs revoke the session; each of these writes an audit
entry.

### 18.7 Open decisions for the owner

| # | Decision | Recommendation |
|---|---|---|
| 1 | Session lifetime: idle, absolute, and the unlock window | 7 days idle, 30 days absolute, 5 minutes unlocked. Short enough that a forgotten phone lapses, long enough not to sign in at the provider every week. |
| 2 | Biometrics only, or allow the phone's passcode as a fallback | Biometrics only. A passcode is what a thief is most likely to have seen. Phones without biometrics use the web. |
| 3 | Does enrolling a phone need approval from the web console (pairing) | No. Provider sign-in already opens the web console, so pairing adds friction, not safety. Show a notice on the web when a phone is added. |
| 4 | Suspend and take-down on phones in stage 1 | Yes. They are why an operator reaches for a phone, both can be undone or reviewed, and each needs its own biometric match. |
| 5 | The flag and its default | `surfaces.mobileConsole`, off in both presets, so no instance gains phone administration by upgrading. |
| 6 | Top-ups and plan changes on phones | Keep on the web. Revisit at stage 4 with a per-action and daily cap, once the audit log has been in use. |
| 7 | One app or a separate console app | One app, as agreed. *Verify* at submission how each store treats a console-only instance's app (an admin tool with no public content); it may need review notes and a demo operator account. |
| 8 | Custom scheme or universal links for the operator callback | Custom scheme with PKCE for the first release, as section 5. The device key makes an intercepted code useless. Move both flows to universal links together. |
| 9 | Push alerts | Stage 3, not stage 1. Pull to refresh is enough for the sample and avoids push credentials early. |
| 10 | Should the web console also ask for a fresh sign-in or a passkey before its riskiest changes | Out of scope here, but worth a follow-up: phones will have a stronger check per change than the web does. |

### 18.8 Log

**21 November 2026: step 1, the server.** Everything 18.6 lists under "Server first" is built, with its tests.

- `surfaces.mobileConsole` in the schema, both presets (off), Settings ▸ Surfaces, `get_instance`
  (`surfaces.console`, `surfaces.mobile_console`) and `./livepeer doctor` (on needs a named app and the web
  console).
- Operator device sessions, device keys, challenges, unlock and confirm proofs and the audit log in
  `apps/web/lib/operator-devices`; the `authenticate()` branch; `runOperation` as the one dispatcher;
  operator sign-in with a new provider sign-in. How it fits together is in `docs/architecture.md`.
- Marked for phones: `operator_status` (new), `operator_overview`, `operator_health`, `operator_list_jobs`,
  `operator_list_users`, `operator_list_reports` as reads; `operator_resolve_report`,
  `operator_set_user_status` as changes. The stage 2 reads in 18.2's table are **not** marked yet, so a phone
  gets `web_only` for them until stage 2 marks them.
- Web: Operator phones and Phone activity on System, the notice when a phone is added (decision 67 in
  `docs/design-proposals.md`).
- Generated: `OperatorAPI.generated.swift` and `OperatorApi.kt`, separate from the user client.

Decided while building, where 18 left room:

- **What is signed.** `livepeer-operator-unlock\n<nonce>` and
  `livepeer-operator-confirm\n<nonce>\n<operation>\n<input hash>`, ECDSA P-256 over SHA-256, DER, base64url.
  The input hash is base64url SHA-256 of the whole input (path values included) as JSON with keys in order
  and no spacing. The apps check their own hashing against `docs/mobile/fixtures/operator_proof_vectors.json`.
  The generated client has a `…Input(...)` function for each change that builds exactly that input.
- **The public key** is sent as base64 of the uncompressed point (iOS) or the SubjectPublicKeyInfo (Android).
  Only P-256 is accepted.
- **A change doesn't also need an unlock.** The proof is the stronger check, and the app can't reach a
  change without the console open anyway.
- **What counts as a refused proof.** One that is presented and wrong: unknown or used nonce, expired, made
  for another operation or input, or not this phone's signature, for an unlock or a change. A change sent
  with no proof at all is refused and logged but not counted, so an app bug can't revoke a phone.
- **The session's own operations** (`create_operator_challenge`, `unlock_operator_device_session`,
  `delete_operator_device_session`) are not operator operations: the session is their proof. With
  `get_instance` and `get_me` they are all an `aqo_` token can call outside the marked list.
- **`get_me` on a user device session now carries the provider's role**, recorded at sign-in, so the user
  app can offer the console. It grants nothing: that session still gets `operator: null`. Sessions made
  before this say `user` until the person signs in again.
- **Fresh sign-in is checked, not only asked for.** The callback reads `auth_time` from the ID token and
  refuses an operator sign-in older than 5 minutes, or one the provider won't date (`not_fresh`). A provider
  that ignores `max_age` therefore can't enrol a phone from a stale browser session.
- **Rate limit:** 120 requests a minute per session, kept in memory, so it is per server process.
- **Removing the operator role in the console** (`setUserRole`) ends that person's operator sessions, as
  suspending does. A role removed at the provider itself still waits for revocation or the 30 days (Q13).
- **The new-phone notice** shows for two days and can't be dismissed.

The answers of the new operations, captured over HTTP from a mock-only instance by a script that enrolled a
key, unlocked and confirmed changes as a phone would, are in `docs/mobile/fixtures/` (`operator_*.json`,
`create_operator_*.json`, `unlock_operator_device_session.json`) for the native decoding tests.

Not done here, for the sessions that follow: everything in the apps.

**21 November 2026: step 2, the iOS design sample.** Status, Jobs and one job's detail, with enough of the
frame to judge them, against a mock-only instance with `surfaces.mobileConsole` on. Screenshots are
`docs/screenshots/mobile/ios-console-*.jpg` (dark, light, the largest text size); the design decisions are 68
to 76 in `docs/design-proposals.md`.

- **Built to stay:** `ConsoleTransport` (the `OperatorTransport`: the `aqo_` token and a proof header, no
  cache, no cookies, nothing on disk, and no effect on the user's session); `OperatorProofs` (the signed
  messages and the input hash, tested against `operator_proof_vectors.json`); `DeviceKey` (Secure Enclave,
  P-256, `biometryCurrentSet`, no passcode fallback); `ConsoleSession` (sign-in with PKCE and
  `purpose=operator`, enrolment, unlock, locking, and what a refusal does); the operator token in its own
  Keychain entry, readable only while the phone is unlocked; Status, Jobs, the job detail, the lock screen,
  the console's tab bar and label.
- **Locking.** The console locks when the server's window ends (a timer from `unlocked_until`, capped at five
  minutes), when a read comes back `locked`, when the person goes back to the app, and when the app returns
  from more than a minute in the background. That last one listens to the system's background and foreground
  notices: a view's scene phase doesn't report the background until the app returns, which made the first
  version never lock.
- **The list stays lazy.** The clock that keeps row times current wraps the lazy stack, not the rows: with the
  rows inside it they were laid out all at once, so every page was asked for at once and rows gained spacing.
- **A session that has ended** (401 that isn't `locked`, or `operator_session`) drops the token and the key
  and returns to sign-in with the reason. This was exercised by restarting the instance under the app.
- **The dev config** (`docs/mobile/dev.instance.config.json`) now turns `surfaces.mobileConsole` on. It is
  the config CI and both apps develop against, and the console's UI tests will need it; a second config
  would only drift.

Provisional in the sample, for step 3:

- **The simulator can't hold a key behind a face** ("not supported on iOS Simulator"). In a simulator build
  only, the key is made in the simulator's enclave without the biometric condition and `DeviceKey.sign` asks
  for the match itself, so the flow looks the same. A device build compiles the real path, which has **not
  run on a phone yet**: test enrolment, unlock, and that adding a face destroys the key, on real hardware.
- **Sign-in method.** The sample always asks for the development provider's `operator` method. A real
  instance answers `method`; step 3 offers the instance's own methods.
- **Entry (settled after the owner's review of the sample).** The Operator console row shows only to a
  signed-in person whose `get_me` says `operator`, on an instance that offers the console to phones: not to
  guests, not to other users, and not merely because the phone was once enrolled. The first version showed
  it in every development build, because the mock provider signed every user-app sign-in in as a user. The
  mock provider now signs the test operator in when the email method is given the operator's own address
  (`sam@example.test`), so the row is reached in development the way it is in production.
- **Not built:** the console-only launch, signing out of the console on this phone, the message for a phone
  with no biometrics before sign-in starts (today it appears after pressing Sign in), Reports and Users (a
  "report is waiting" line on Status opens nothing yet), changes and their confirm proofs (the message and
  hash are written and tested; nothing calls them), UI tests of the console, and all of Android.
- **Not seen in a screenshot:** Status's loading rows, which a local instance answers too quickly to catch.
  The Jobs list's were caught by pausing the instance (`ios-console-jobs-loading-dark.jpg`).

Found while building, for the server or later steps:

- A job carries `actor_id` and no name, and no cost. The list and detail show the id; a name and a cost per
  job need the engine or a join on the server (noted, not requested yet).
- `operator_list_jobs` names what ran by `app` (`text-to-video`); the readable capability labels are a user
  operation an `aqo_` token can't call. The app turns the slug into words itself.

**21 November 2026: step 3, the rest of iOS stage 1.** The owner approved the sample (review point B) and
PR 25 was merged. Built on it: console sign-in with the instance's own methods, signing out, Reports, Users,
the two kinds of change with their confirm proofs, and the console-only launch. Design decisions 77 to 81.

- **Sign-in.** The cover's Sign in opens a tray with the instance's methods (`SignInOptions`, now shared with
  the user app's sign-in). The hard-coded `operator` method is gone. With the mock provider, the email method
  and `sam@example.test` is the operator; any other method is the ordinary user, who is sent back with
  `not_operator` and told "This account doesn't run Livepeer."
- **Changes.** `ConsoleSession.confirm` asks for a nonce for the operation and the hash of its input, has the
  key sign it after a new match, and sends the change with the proof. Screens change only from the instance's
  answer. `proof_required` leaves the session in place; closing the prompt changes nothing. Run for real
  against the mock instance: take down, keep up, suspend, resume.
- **Reports and Users** read `operator_list_reports` and `operator_list_users` (with `query`). No new operation
  was needed: each detail page shows what its list answer already carries.
- **Console-only.** `surfaces.mobileConsole` on with `surfaces.mobile` off makes the build the console and
  nothing else. `InstanceStore.availability` now counts either switch as a reason for the build to be usable.
- **Signing out** of the console ends the session on the instance and deletes the key.
- **The mock user list now reflects suspend and resume.** `setActorStatus` returned ok but `listActors` kept
  answering "active", which the live engine doesn't do; the mock holds the suspended set in memory.
- **The instance's description is read without a session.** It was sent with the user's token, so a session
  that had ended made the read fail and the app never learned what the instance now served.
- **A row that changes state gets a new identity** in the lazy lists. A decided report kept drawing as
  waiting until its row id included its state.

Still open after step 3:

- **The device key has still not run on a real phone**, only in the simulator's stand-in (above).
- **No UI test drives the console.** It needs a way to answer the system sign-in alert and Face ID from a
  test; the flows above were run by hand. The unit tests cover the models, proofs, transport and the entry rule.
- **A user's page has no email, balance or plan**: `operator_list_users` doesn't carry them. The web console
  gets them from other reads that aren't marked for phones.
- **A decided report can't be reopened from a phone**, and a taken-down character can't be restored there.
- Android stage 1 (step 4).

**21 November 2026: step 4, Android stage 1.** The console in `apps/android`, from the same spec, with the iOS
build as the reference for behaviour and words: console sign-in with the instance's methods, unlock, lock, sign
out, the console-only launch, Status, Jobs and a job's page, Reports and a report's page, Users and a user's
page, and the two kinds of change with their confirm proofs. Design decisions 82 to 89; screenshots are
`docs/screenshots/mobile/android-console-*.jpg` (dark, light, the largest font size).

- **A session apart from the user's.** `ConsoleTransport` is the `OperatorTransport`: the `aqo_` token and
  `X-Operator-Proof`, no cache, no cookies, nothing on disk, and a refusal is thrown to the console and never
  reaches the user's session. The token is in its own Keystore-encrypted entry (`TokenVault.operator`), in an
  app that is excluded from backups. No new dependency: the prompt is the platform's `BiometricPrompt`.
- **The key** (`DeviceKey`) is P-256 in the Android Keystore, in StrongBox where the phone has it and the
  trusted execution environment otherwise, with `setUserAuthenticationRequired(true)`,
  `setInvalidatedByBiometricEnrollment(true)` and, from Android 11, `setUserAuthenticationParameters(0,
  AUTH_BIOMETRIC_STRONG)`: one class 3 match per signature, no device credential. On Android 10, where that
  call doesn't exist, a validity of -1 asks for the same. Its public half is sent as base64 of the
  SubjectPublicKeyInfo. A release build refuses a key the Keystore reports as held in software; a development
  build accepts one, because the emulator has nothing else.
- **What is signed** (`OperatorProofs`) is checked against `operator_proof_vectors.json`: both messages, the
  canonical input and its hash, and the generated `…Input(...)` builders.
- **Locking.** When `unlocked_until` passes (a timer, capped at five minutes), on a `locked` refusal, on Back to
  the app, and after more than 60 seconds away, timed from the activity's `onStop` to `onStart` on a clock
  that only goes forward. Any other 401, `operator_session` or `mobile_console_off` ends the session on the
  phone and returns to sign-in with the reason; `proof_required` leaves it.
- **Sign-in shares the browser with the user app.** Both go through the one Auth Tab launcher; what comes back
  goes to the console when it started the sign-in, and to the account otherwise. The sign-in methods are one
  composable (`SignInOptions`) for both.
- **The instance's description is read without a session** on Android too, and `InstanceStore.availability`
  counts either switch; a first launch draws nothing until the instance has said which it serves.
- **Whole numbers in a query are sent without a fraction** (`limit=30`, not `30.0`) by the console's transport.
- **The Reports count follows Status** (decision 83). iOS reads the queue only on unlock and pull to refresh, so
  there the badge can lag the sentence; worth the same change.

Run for real against a mock-only instance in an emulator (API 37, a fingerprint enrolled with `adb emu finger`):
the row in the account menu for the operator and not for an ordinary user; the cover with no fingerprint set
up; a refused sign-in ("This account doesn't run Livepeer."); sign-in, enrolment and unlock; every screen; take
down, keep up, suspend and resume, each cancelled once and then confirmed; the lock after 66 seconds in the
background and not after 20; a session ended by restarting the instance; the instance stopped (Status says it
can't be reached and keeps the last figures); signing out; and the console-only launch from a second config.

What an emulator could not prove:

- **Hardware-backed keys.** The emulator's Keystore reports the key as held in software (seen with a temporary
  log line, since removed). StrongBox, the trusted execution environment, and the release build's refusal of a
  software key have **not run on a phone**.
- **Invalidation on a new enrolment.** Adding a fingerprint should destroy the key
  (`KeyPermanentlyInvalidatedException`, handled as "This phone's console key is gone. Sign in again."). That
  path is covered by a unit test with a stand-in key, not by enrolling a second finger on real hardware.
- **Class 3 only.** The emulator's fingerprint is class 3. A phone with only a weaker face unlock should be told
  the console needs a fingerprint or face; not seen.
- **Android 10 to 12**: the per-use key parameters before Android 11 and the secure-window fallback for the
  app switcher were compiled, not run.
- **The system prompt in a picture.** Android blanks it in screenshots; its words were read from the
  accessibility tree ("Livepeer", "Unlock the console", "Take Lumen down", "Touch the fingerprint sensor").
- **No UI test drives the console**, as on iOS: a test can't touch the emulator's sensor from inside. The unit
  tests cover the proofs, the transport, the session, the models, the formats and the entry rule.
