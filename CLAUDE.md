# CLAUDE.md

Standing rules for this repository. They come from `docs/brief.md` (the complete project brief), sections
PROJECT SETUP, DATA and RULES, reproduced below so they load every session.

## Start of every session

1. Read `docs/brief.md` if anything below is unclear; it is the source of truth.
2. Read the research and plans in `docs/` before changing code:
   - `docs/research/` — engine summary, capabilities and discovery, payment providers, builder-core-console
     notes, Venice screen inventory, Benji Taylor notes.
   - `docs/design-brief.md`, `docs/design-proposals.md` — tokens, principles and the design decisions log.
   - `docs/route-map.md`, `docs/architecture.md` — routes, packages, config schema, interfaces.
   - `docs/data-sources.md` — every API function, live or mocked. Keep it current.
   - `docs/ui-actions.md` — every UI action and the API function behind it. Keep it current.
   - `docs/engine-requests.md` — requests and open questions for Mike (engine maintainer).
   - `docs/mobile/plan.md` — the native iOS and Android apps: scope, slices, API, sign-in, store rules.
   - `docs/mobile/console-testing-notes.md` — how to run, drive and capture the operator console in the iOS
     simulator and the Android emulator against a mock instance.
3. Reference clones of the engine, console, node, Clearinghouse Batteries and Explorer live in `.reference/`
   (git-ignored). They are read-only reference material; never copy engine code into this repo.

## Working agreements (from the project owner)

- Approval: stop for review only once, after the design sample (home screen and studio composer). After
  that, write plans to `docs/` and keep building through the slices without stopping.
- Commit after each slice.
- After each slice, open the running app, take screenshots of each screen in dark and light themes and at
  mobile width, and review them against `docs/design-brief.md`.
- Ask before running any paid job against the live engine. Read-only calls are fine.
- The GitHub organisation name lives in one config value (`org` in `release.config.json`). Never hardcode it in
  code, docs or image tags.

## Native apps (from `docs/mobile/plan.md`)

- `apps/ios` (Swift, SwiftUI) and `apps/android` (Kotlin, Compose) are fully native. No React Native,
  Flutter, Kotlin Multiplatform or webviews for product UI.
- They are clients of an instance's `/api/v1` and nothing else. They never call the engine or a provider, and
  no builder key, reader token or admin token ever reaches a device.
- No mock layer in the apps: development, tests and CI use a build pointed at an instance started with
  `MOCK_ONLY=1`.
- Every action in the apps maps to an operation in `apps/web/lib/public-api/operations.ts`. Add the
  operation first, with its `output`, then run `corepack pnpm mobile:generate`. Keep the Mobile columns in
  `docs/ui-actions.md` and `docs/data-sources.md` current.
- Never edit generated files (`apps/ios/Livepeer/Generated`, `apps/android/**/generated`) or retype a token
  value by hand.
- A build belongs to one instance: only name, icon, identifier and instance URL are set at build time.
  Theme, sign-in methods, features and content settings come from `get_instance` at run time.
- For each slice: iOS first, then Android from the same spec, using the iOS build as a behavioural reference,
  not a transliteration. Build and run before saying anything works. Screenshot every screen in dark and
  light into `docs/screenshots/mobile/` and review against `docs/design-brief.md`. Log each mobile design
  decision in `docs/design-proposals.md`.
- Sign-in, purchasing and store content rules are decided in the plan before they are built. Don't build
  purchasing.

## Project setup

- The repo is "livepeer" (renamed from "aquareum" on 21 November 2026; the local folder is still ~/Developer/aquareum), with its remote at github.com/aquareum/livepeer (public; the organisation was renamed from "aquareum-inc" in late November 2026). The GitHub organisation may move to Livepeer's later, so don't hardcode the organisation name anywhere in code, docs or image tags; keep it in one config value. Package manager: pnpm. MIT licence, to match the engine.
- Save this brief as docs/brief.md. On your first step, create a CLAUDE.md at the repo root from the RULES, DATA and PROJECT SETUP sections so the standing rules load every session.
- Secrets live in a root .env file that is never committed. Keep a committed .env.example listing every variable with empty values and a one-line description of each. Ignore every `.env*` file in git except `.env.example`.
- This repo is separate from the engine. Don't fork or copy livepeer-builder-core into it. Treat the engine as an external service reached through its REST API, pinned to a specific version or commit and recorded in one place.
- The Docker Compose bundle that starts this app together with the pinned engine is both the local development setup and the standard way to self-host.
- If you find something the engine needs in order to support this app, write it up in /docs/engine-requests.md as a proposed upstream change. Don't work around it by modifying engine code.
- Record open questions for the builder track there too, starting with: whether the app should read usage through the engine or from the payment provider directly, whether the provider or this app collects payment from end users, and whether attested secure-hardware operators are planned.

## Data

- A typed API client with one function per operation. Each function has two implementations behind the same interface: a real one that calls the engine's REST API, and a mock one that returns realistic data with realistic latency. A single data-source map decides which is used per function. Use the real implementation wherever the engine endpoint works today; use the mock for everything else (async video jobs, live sessions, events, and anything the connected provider doesn't support yet). Shape all types on the engine's actual responses.
- Don't build a separate ledger or invent a plan system. Define a provider interface in the API client covering identity (sign-in, users), budgets (grants, allocations, balances), plans (definitions, allowances, assignment) and usage. Implement it against what's live today, and mock the rest in the shape PymtHouse exposes, so plans and login switch to real data when that provider is connected. A user's credit balance is their allocation balance. A credit pack is a one-off allocation top-up. A plan is the provider's plan. A retail price is a markup rule that converts wholesale cost into credits charged.
- Write /docs/data-sources.md listing every API function, whether it's live or mocked, the endpoint it uses or will use, and what's blocking the mocked ones. Keep it current.
- In dev mode, show a small indicator on each screen saying whether its data is live or mocked. Never show it to end users.
- Support a mock-only mode (one environment variable) that forces every function to the mock, for tests, CI, offline demos and first-run self-hosting without engine keys.
- The engine identifies callers only by bearer token, and there are three kinds. Use the least powerful one that works for each call:
  - Builder API key (lpk_...): one builder account. Runs jobs and reads that account's own models, credits, jobs and costs. Every user-app call uses the signed-in user's own builder key, held server-side in a sealed session cookie (SESSION_SECRET) and sent on their behalf. BUILDER_API_KEY in .env is only a local development shortcut that signs you in as one fixed builder.
  - Reader token (ENGINE_READER_TOKEN): read-only operator data across all builders. Use it for every operator console view that only reads.
  - Admin token (ENGINE_ADMIN_TOKEN): everything, including creating keys and adding credits. Use it only for operator actions that change something and for provisioning a new user's builder account at sign-up. Never use it for a read the reader token can do.
  Confirm these against builder-core-console's code, which follows the same pattern, and keep all three server-side. None of them may ever reach the browser.
- Engine and provider credentials come from environment variables only. Never commit them or log them.
- Don't run paid jobs against the live engine without asking me first. Read-only calls (discovery, history, costs, grants, allocations, usage) are fine.

## Rules

- Build to production standards: strict TypeScript, no dead or placeholder code, sensible folder structure, shared components and tokens, and proper routing, auth guards and state handling that will work unchanged as mocked functions go live.
- Every action a user can take in the UI must map to a function in the API client. No UI-only capabilities. Keep a table in /docs listing each UI action and its API function.
- When a real engine response and a mock disagree in shape, the real response wins: fix the types and the mock to match, and note it in /docs/engine-requests.md if the engine's shape is a problem for the UI.
- Every screen must have realistic data, plus loading, empty and error states.
- No placeholder lorem ipsum. Write real interface copy, following the product brief's pillars and tone.
- In interface copy, don't use category labels like "AI" or "SI". Say what the product does: generate, edit, understand and interact with video.
- Keep components small and reusable. No business logic inside components; it goes through the API client.
- Add tests for the API client, the provider interface, the capability-to-surface mapping, the config schema and presets, the role guard and the main flows.
- Performance matters: fast first load, lazy-load heavy screens and media, no layout shift.
- Add a README covering the quick start, the folder structure, the config file and presets, and how to switch a function from mock to live.

## Pull request titles

- Pull requests are squash-merged, so each title becomes the commit on `main`. Titles follow Conventional
  Commits: `type(scope): what changed`, lower-case after the colon, no full stop. A `!` after the type or scope
  marks a breaking change. Commits inside a branch have no rule. `CONTRIBUTING.md` lists the types and scopes,
  and CI checks every title.
