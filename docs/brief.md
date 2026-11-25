Build the front end for an open, self-hostable platform for generating, understanding and interacting with video, running on the Livepeer Network. This is the first version of a real product that will compete with venice.ai, not a throwaway demo. Working name: "Livepeer" (make the instance name, logo and accent colour configurable so other operators can white-label it).

PRODUCT BRIEF
- What it is: an open platform where people and agents generate, edit, understand and interact with video. It runs on the Livepeer Network, an open market of compute providers that anyone can join.
- Who it's for: creators who want a capable video tool, and developers and agents who use the same capabilities through the API and MCP. Agents are a primary user, not an afterthought, which is why every UI action must exist in the API.
- Why it's different from Venice: Venice picks its infrastructure providers and runs a closed product. This is open source, self-hostable, and backed by a network no single company controls. Venice's strengths are a polished product, fast access to many models, few content restrictions and a trusted privacy brand. Match the polish and breadth; differentiate on openness, self-hosting and video depth.
- Business model: like WordPress. The software is open and anyone can run their own instance as a business, with their own brand, prices and users. There is also one official hosted instance. Every instance pays the same network for compute, so more instances is good for everyone. This is why white-labelling, the operator console and one-command self-hosting are core, not extras.
- Brand pillars, for tone and copy: video first; built for agents as much as people; open at every layer; privacy you can verify, stated plainly; no single party can switch it off.
- Privacy, for the "who can see what" table. Two parties can potentially see a job: the instance operator (whoever runs the app) and the compute operator (the network orchestrator whose GPU runs the job). Present the tiers in this order:
  (1) Default, on any instance: the instance doesn't retain prompts or outputs on its servers and strips identity before sending a job to the network. The compute operator can see the content of the single job it runs, but not who sent it or any of their other activity.
  (2) Self-hosted instance: the same as (1), except you are the instance operator, so no third-party app provider is involved at all. Jobs still run on network compute operators unless you choose otherwise.
  (3) Verified compute (planned, not available; label it that way): jobs go only to compute operators running attested secure hardware, so the compute operator can't see content either.
  (4) Your own compute (advanced): a self-hosted instance routed only to GPUs you run yourself, so nobody outside your organisation sees anything. Mention it last and briefly; few people will use it.
  Be plain about what each party can see. Don't overclaim, and don't imply that compute operators are bound by a no-retention agreement unless that's actually true.
- Copy tone: specific and direct. Say what the product does. No hype.
- People: Mike maintains the engine. Questions and requests for him go in /docs/engine-requests.md.

PROJECT SETUP
- The repo is "livepeer" (renamed from "aquareum" on 21 November 2026; the local folder is still ~/Developer/aquareum), with its remote at github.com/aquareum/livepeer (public; the organisation was renamed from "aquareum-inc" in late November 2026). The GitHub organisation may move to Livepeer's later, so don't hardcode the organisation name anywhere in code, docs or image tags; keep it in one config value. Package manager: pnpm. MIT licence, to match the engine.
- Save this brief as docs/brief.md. On your first step, create a CLAUDE.md at the repo root from the RULES, DATA and PROJECT SETUP sections so the standing rules load every session.
- Secrets live in a root .env file that is never committed. Keep a committed .env.example listing every variable with empty values and a one-line description of each. Ignore .env and .env.*.local in git.
- This repo is separate from the engine. Don't fork or copy livepeer-builder-core into it. Treat the engine as an external service reached through its REST API, pinned to a specific version or commit and recorded in one place.
- The Docker Compose bundle that starts this app together with the pinned engine is both the local development setup and the standard way to self-host.
- If you find something the engine needs in order to support this app, write it up in /docs/engine-requests.md as a proposed upstream change. Don't work around it by modifying engine code.
- Record open questions for the builder track there too, starting with: whether the app should read usage through the engine or from the payment provider directly, whether the provider or this app collects payment from end users, and whether attested secure-hardware operators are planned.

CONTEXT
- The backend is https://github.com/NE-Build-Track/livepeer-builder-core, a Python engine that discovers network capabilities, runs paid jobs, controls access and reports wholesale network cost. Read its README, ARCHITECTURE.md, docs/payments.md and API docs first.
- Then read https://github.com/livepeer/node (the orchestrator, signer and configuration docs, and the discovery endpoint) to understand how capabilities are registered on the network and discovered.
- The engine answers what the network did and what it cost. The application keeps who the customer is and what they're charged. This app is that layer.
- Parts of the engine API are live today: access, discovery, paid jobs, job history and network-cost reports. Async jobs, persistent sessions and the events feed return 501 for now. Read the API docs to see exactly which endpoints work.
- The engine is already running locally at http://127.0.0.1:8090 (API docs at http://127.0.0.1:8090/docs). Use that instance; don't start another. Its URL and admin key are in .env.
- The builder track's operator console is https://github.com/NE-Build-Track/builder-core-console, its reference app. It runs the engine, Clearinghouse Batteries and the node remote signer as Docker services, and has views for health, network, money, users, usage and jobs, plus signed-in operator and builder areas. Clone it and study it closely. Reuse its API calls, its data model, its Docker stack and its "Sources & gaps" approach. Our operator console should cover everything it shows.
- Credits, plans and identity come from the payment and identity provider behind the engine, which is pluggable. Two providers matter:
  - Clearinghouse Batteries (https://github.com/NE-Build-Track/clearinghouse-batteries), the only one wired into the engine today: grants provide credits, allocations are per-user budgets within a grant, and allocations carry API keys.
  - PymtHouse (https://pymthouse.com), being connected to the engine as an alternative: it adds operator-defined usage-metered plans and allowances, per-tenant billing, per-user cost tracking, and OIDC login with white-label sign-in.
  Read both, plus the engine's provider protocols. Use the engine's terms (grant, allocation, usage, plan) and don't couple the UI to one provider.

GOAL
A production-quality front end for both the hosted instance and self-hosted instances. Use real engine data wherever the engine already provides it, and mock only what it doesn't yet support. The code should be the foundation we keep building on, and the mocks should be the only thing that gets replaced.

ARCHITECTURE
- Organise the code as a monorepo with separate packages: the API client and types, the user app, the operator console, and shared UI components. The user app and operator console must each be able to run or be omitted independently.
- Capabilities are not defined in this app. They are registered on the Livepeer network by orchestrators and their runners, and found through discovery. Model the capability types on what the node repo and the engine's discovery code define. Don't invent a capability list.
- Mock data must have the same shape as real discovery output, including several capabilities of different kinds and interaction modes (single-shot, persistent session, streaming), so the UI is built against a realistic, open-ended catalogue.
- Surfaces are the app's presentation modules: chat, studio, characters and library. A mapping layer assigns each discovered capability to one or more surfaces based on its metadata and interaction mode: generation to chat and studio, understanding to chat and library, real-time sessions to the studio's Live mode and to characters, with transcoding and stream delivery capabilities supporting Live mode's output. Capabilities that don't belong to a surface are still listed in the models catalogue, usable through a generic run screen built from whatever input description discovery provides, and available through the API and MCP. Where it makes sense, a capability can also appear as an action on existing media, for example "convert" or "export" in the library.
- The instance is defined by one schema-validated config file (JSON Schema, with TypeScript types generated from it) plus environment variables, covering branding (name, logo, colours), engine URL, enabled surfaces (user app, operator console, API, MCP), capability allow and block rules, auth and payment provider, and content policy.
- Ship two presets: "full" (everything) and "headless" (API and MCP only, no user app, operator console optional). Which capabilities an instance offers is set separately through the capability allow and block rules, so a headless instance can start with transcoding only and add others later.
- Every operator console action must also be available through the API client, so an agent can administer an instance without the UI.

DATA
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

SELF-HOSTING (a first-class requirement, not an afterthought)
- One command brings up a complete working instance: this app plus the pinned engine, its payment provider and a database, with sensible defaults (SQLite, generated secrets, the "full" preset). No manual steps beyond providing the keys the engine needs.
- Ship it as a single Docker Compose bundle that references published images, modelled on builder-core-console's stack (engine, Clearinghouse Batteries and the node remote signer). The user never clones or builds the engine themselves.
- The setup command takes a preset or a config file, runs non-interactively with flags, prints machine-readable JSON on request, exits with clear error codes, and is safe to run twice.
- Include a health check endpoint and a `doctor` command that verifies the engine connection, the provider connection, config validity and required keys, and says exactly what to fix.
- Upgrades are one command, with the engine version pinned per app release so the two always move together.
- Write the install docs for two readers. For people: a short quick start in the README. For agents: an AGENTS.md at the repo root with exact commands, expected output, the config schema location and common failure fixes, so an agent can install, configure and verify an instance unattended.
- Include deploy templates for at least one hosted platform and a plain VPS.
- Test the install path: CI should run the one-command setup from a clean machine in both presets, in mock-only mode, and confirm the health check passes.

REFERENCE
- venice.ai is the reference for the entire UI, not one screen. Use it for scope, navigation, the layout of every screen, the controls on each, and the overall feel.
- I'm signed in to venice.ai in Chrome. Before proposing anything, use the Chrome integration to walk through the whole signed-in app, every item in the navigation and every screen and mode you can reach: home and chat, the agent, Venice Studio (all media types and composer modes), characters, the library, search, model selection, credits and plans, API and developer pages, and all settings. Note the navigation structure, what each screen lets a user do, the controls on each screen, and the main flows. Read only: don't generate anything, change settings, or spend credits.
- Write up what you found as a screen inventory, then propose our route map against it, noting where we differ.
- Match its level of polish and completeness. A user who knows Venice should find this familiar and be able to do the same jobs.
- Chat and the studio are two routes to the same jobs. Anything generated in chat can be opened in the studio to refine, and studio outputs appear in the library alongside chat outputs.
- Differences from the reference: the interface is chat-centred like Venice, and users generate video from the chat. The difference is emphasis, not layout: the copy, suggested prompts, example gallery and empty states all lead with video. The product also adds video understanding, a Live mode in the studio, live calls with characters, and an operator console that Venice doesn't expose.
- Don't carry over Venice's token features (staking, VVV, DIEM). Keep the character and companion features and the adult-content settings, with two additions: both are switched on or off per instance in the operator console's instance settings, and adult content sits behind an age confirmation and is off by default for new users. List anything else you're unsure about in the route map and ask.

STACK
- Next.js (App Router), TypeScript, Tailwind, shadcn/ui.
- Motion (Framer Motion) for transitions and shared-element animation.
- Auth with two roles, user and operator, behind an interface that assumes OIDC, so PymtHouse's white-label login or another provider can be plugged in without changes to the app. A mock provider and a role switcher in dev mode only.

USER APP
Model every screen on its Venice equivalent as you observed it in Chrome: same structure, same controls, same flow. The notes below say only where ours differs or adds something. If Venice has a screen that isn't listed here, include our version of it and flag it in the route map.

1. Home and chat: as in the reference. Suggested prompts and the example gallery are mostly video.
2. Studio: as in the reference, covering the same media types and video composer modes, plus the Live mode described in item 7.
3. Agent behaviour in chat: as in the reference, and for larger requests the agent plans a multi-step job (script, storyboard, shots, audio, assembly) and shows each tool call as a step.
4. Characters: as in the reference, shown only when the instance has the feature enabled.
5. Library, models, developers and settings: as in the reference. The models catalogue is driven by discovery and includes a generic run screen for capabilities without a dedicated surface. Settings shows the user's plan and credit balance from the provider, and adds a privacy page with a plain "who can see what" table for each privacy tier in the product brief. Developers adds MCP connection instructions.
6. Video understanding has no screen of its own. It appears in three places: in chat (attach or link a video, then summarise it, find moments, ask questions, and hand results to generation or editing), in the library (search media by content, with automatic descriptions and tags), and in the agent's workflow (it reviews its own shots before presenting them).
7. Real-time appears in two places.
   - Studio "Live" mode: a lightweight browser broadcast studio. The user picks a camera or screen source, applies a live restyle or character transformation, and steers it with a prompt that can be changed while on air. Include saved looks to switch between, a preview next to the live output, stream health indicators, destinations (add stream keys for platforms like YouTube and Twitch, or a custom RTMP target, and go live to one or several), and recording of the session to the library. Keep it to a single source for now: no guests, multi-camera layouts or overlays. Use StreamYard and Restream as references for the broadcast flow and controls only.
   - Characters: a live video or voice call with a character.
   Both run on mock data for now, with clear messaging that live sessions aren't connected yet.
8. Developers includes a playground for understanding and real-time (start a session or run an analysis, inspect the request and response, copy working code), plus a small gallery of example apps built on the real-time API, such as a live avatar and an interactive world, each with a description and starter code.

OPERATOR CONSOLE (operator role only; route group /operator, guarded, and hidden from users)
The console is for the team running the instance. It's where they manage pricing, plans, billing and customer accounts for their users.

Start from builder-core-console. Include every view and data field it shows, using its names for things so the UI matches the engine's vocabulary. The list below is the minimum; where that console has more, add it, and where the two conflict, follow it and flag the difference in the route map.

Use the same layout conventions and components as the user app so the console feels like part of the same product.

1. Overview: active users, jobs today, revenue, wholesale network cost, margin.
2. Users: list and detail, each user's allocation (budget, spent, remaining), their plan, API keys, usage history, suspend, roles and permissions. Live data where available.
3. Pricing and plans: the provider's plans and allowances (create, edit, assign to users), markup rules per capability, and credit packs. Show which provider is connected and which plan features it supports.
4. Billing: connect a payment provider for collecting money from customers, view payments and invoices, issue refunds and manual credit adjustments, handle failed payments, tax and currency options. Mocked.
5. Costs: retail revenue against wholesale network cost per job and per capability, including charges still pending.
6. Jobs: all jobs and live sessions across users, with status, failures and retry.
7. Capabilities: everything discovery returns from the network. Enable or disable each one for this instance, set its retail price, set defaults and routing preferences, and override which surface presents it.
8. Compute: which network operators served jobs, performance and price, allow and block lists, and an option to add your own GPUs.
9. Grants: list and create grants, and see each grant's funding, allocations and spend. Live data.
10. Instance settings: name, logo, colours, domain, sign-up rules, privacy defaults, enabled surfaces, and content policy, including switches for characters and companions and for adult content.
11. API and admin keys.
12. System: instance health, engine and provider connection status and versions, and the results of the `doctor` checks.

DESIGN
Structure and interaction patterns come from the Venice reference. The look and feel are our own, drawn from two sources.

1. Aesthetic and feel: Benji Taylor. He's the main inspiration for how this UI looks and how it behaves.
   - Study his public work before designing: his site and essays at https://benji.org (start with https://benji.org/family-values), the Family wallet at https://family.co, and his open-source interface work such as Agentation and Liveline. Look at screenshots and live demos, not only the writing.
   - Visual qualities to carry over: soft, rounded forms with generous radii; plenty of whitespace and a clear hierarchy with few elements per view; a restrained palette with one confident accent; friendly, highly legible type with careful sizing and weight; subtle depth through layering and soft borders, not heavy shadows; custom-feeling icons and small illustrations; and precise detail work in alignment, spacing and optical balance.
   - Behaviour, following the three principles in his Family Values essay, in this order:
     - Simplicity: one clear primary action per view. Reveal complexity gradually using sheets, popovers and expanding panels that keep context.
     - Fluidity: nothing appears or disappears abruptly. Elements move from where they were to where they're going, motion direction matches navigation direction, and loading states morph into results. Spring-based motion with consistent easing.
     - Delight: small, well-placed moments used sparingly, most where an action is rare or significant: a generation finishing, going live, numbers that animate when they change, considered empty states, tactile hover and press feedback.
   - Take inspiration from his sensibility. Don't copy specific screens, components or assets from his products.

2. Brand anchors. These keep the product recognisably Livepeer and are not up for change:
   - Colour: semantic theme tokens only (background, foreground, card, muted, primary, secondary, accent, border, destructive), never raw colour values, so operators can re-theme a white-labelled instance by changing tokens. Both light and dark themes must work.
   - Livepeer green is for non-interactive brand expression only. Never use it for buttons, links or other controls.
   - Type: Inter for interface text and Geist Mono for code and technical labels. The display face appears only in the logo lockup.
   - Logo: the mark is black or white, never green and never a gradient.
   - Spacing on a 4px rhythm.
   - Take the actual token values, theme setup and icons from the new Livepeer Explorer: clone https://github.com/livepeer/explorer and check out the `next` branch. Use it for colour values, type setup and icons only. Don't copy its component shapes, density or layout.

How the two sources fit together:
- Benji Taylor's approach leads on everything except the brand anchors: shape, spacing, density, depth, motion and component design. The aim is a product that looks and feels better than existing Livepeer interfaces, not one that matches them.
- Motion has to earn its place. Every animation should explain a state change, preserve continuity or confirm an action.
- The operator console uses the same visual language as the user app, tuned denser for a working tool. It should not look like a different product.
- Keep a running list in /docs/design-proposals.md of the design decisions you made beyond the brand anchors, with screenshots. This will be proposed back as an update to Livepeer's design guidelines.

Other requirements:
- Don't reuse assets, branding or wording from Venice, StreamYard or Restream.
- Dark theme by default, with a light theme. Media is the focus and the chrome stays quiet.
- The operator console is denser than the user app because it's a working tool, but both must read as one product.
- Respect reduced-motion settings. Responsive down to mobile. Accessible: keyboard navigation, visible focus, sensible contrast.

RULES
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

PROCESS
Save every research output as a file in /docs (engine summary, capability and discovery notes, payment provider notes, builder-core-console notes, Venice screen inventory, design brief, route map) and read them at the start of each session.

1. Read the engine repo, its API docs, the node repo, Clearinghouse Batteries and PymtHouse. Call the live read-only endpoints to see real responses. Summarise what the engine exposes, which endpoints work today, how capabilities are registered and discovered, and how credits and plans work.
2. Clone builder-core-console, and list its views, the data each one shows, the calls it makes and how its Docker stack is put together.
3. Walk through venice.ai in Chrome and write the screen inventory.
4. Clone the Explorer `next` branch for tokens, and study Benji Taylor's work and the Family Values essay. Write a one-page design brief covering the tokens you'll reuse and how Benji's aesthetic and three principles apply to the chat, the studio and the operator console. Build the home screen and the studio composer first as a design sample, with screenshots, for my approval before going further.
5. Propose the route map, the package layout, the config schema, the API client and provider interfaces, the live-versus-mocked data-source map, the capability-to-surface mapping and the self-hosting bundle. Wait for my approval.
6. Build in vertical slices, committing after each and stopping for my review: (a) monorepo, config, presets, setup and doctor commands, Compose bundle, shell, navigation, auth, role guard and design system, (b) home and chat, (c) studio, (d) characters, library, models with the generic run screen, developers and settings, (e) understanding in chat and library, Live mode in the studio, live calls in characters, and the developer playground and example gallery, (f) operator console.
7. After each slice, open the running app in Chrome, take screenshots of each screen in dark and light themes and at mobile width, and review them against the design brief before asking for my review.
8. Finish by running the one-command install from a clean checkout in both presets, the tests in mock-only mode, a check of every live-backed screen against the real engine, and a production build, and checking every route.
