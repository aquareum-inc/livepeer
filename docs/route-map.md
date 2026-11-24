# Route map

Proposed against `docs/research/venice-screen-inventory.md` (user app) and
`docs/research/builder-core-console.md` (operator console). "Ref" is the reference's equivalent.
Status: **built** = exists today, otherwise the slice that builds it.

## User app

| Route | Screen | Ref | Differs from the reference | Slice |
|-------|--------|-----|----------------------------|-------|
| `/` | Home: composer and starting points | `/chat/agent` home | Video-first copy. A starting point sends its name and opens the conversation, where the agent asks for the rest (decision 105). `?with=<slug>` arrives from a character's page with that character cast in the composer. | built |
| `/chat/[id]` | Conversation with the agent (built; video understanding in e) | `/chat/agent/:id` | Larger requests show a plan (script, storyboard, shots, audio, assembly) with each tool call as a step. Attach or link a video to summarise, find moments, ask questions. Any output opens in the studio. One chat, not agentic + classic. | b, e |
| (modal) | Search conversations and library | Search modal | Also searches library media by content. | b, e |
| `/studio` → `/studio/video` | Studio, video composer (Frames / References / Edit) | `/studio/video` | Leads the media order. Capability picker lists discovered apps, not branded models. | built → c |
| `/studio/image` | Image composer: Create and Edit modes | `/studio/image`, `/studio/edit` | Editing is a mode of the image composer, not a separate tab: the same card reshapes. Mask, doodle and crop tools are not in v1. | built |
| `/studio/audio` | Music and Voice modes | `/studio/audio` | Voice changer and sound effect are added when a matching capability is discovered. | built |
| `/studio/live` | Live broadcast studio | — (ours) | Camera or screen source, live restyle steered by a prompt, saved looks, preview beside output, stream health, destinations, record to library. Mocked; says live sessions aren't connected. | e |
| `/characters` | My characters + public characters | `/character-chat` | Shown only when the instance enables characters. | d |
| `/characters/browse` | Public list: search, sort, filters | `/character-chat/public` | Mature filter follows instance + user settings. | d |
| `/characters/[slug]` | Character detail, start chat | `/c/:slug` | Adds **Call** (voice or video), mocked. | d, e |
| `/characters/new`, `/characters/[slug]/edit` | Create / edit | plan-gated form (inferred) | — | d |
| `/characters/[slug]/call` | Live call | — (ours) | Mocked. | e |
| `/library` | Uploads and generations | `/library` | Adds content search, automatic descriptions and tags, and capability actions on media (convert, export, open in studio / chat). | d, e |
| `/developers/models` | Capability catalogue from discovery | API ▸ Models | A tab under Developers, as in the reference, not a sidebar item. Also reached from "View all" at the foot of the capability picker. Lists everything discovery returns for this instance. | d |
| `/developers/models/[...app]` | Capability detail + generic run screen | — (ours) | Form built from whatever input description discovery provides; today a JSON body editor (see engine request R1). | d |
| `/developers` | Overview: quick start, base URL, usage | `/settings/api` | Adds MCP connection instructions. The section follows the instance’s API and MCP switches: hidden with both off; playground and examples need the API (`lib/developers.ts`). | d |
| `/developers/keys` | API keys | ▸ Keys | — | d |
| `/developers/playground` | Playground | ▸ Playground | Adds video understanding and real-time sessions, with request/response and copyable code. | d, e |
| `/developers/examples` | Example apps on the real-time API | — (ours) | Live avatar, interactive world; description + starter code. | e |
| `/settings/*` | Profile, General, Privacy, Plan and credits, Usage, Chat, Image, Video, Storage | Settings modal | Routes rather than a modal, so they are linkable; same groups. **Privacy** adds the "who can see what" table. Plan and balance come from the provider. Adult content is behind an age confirmation and off by default. | d |
| (sheet) | Add credits; change plan | dialogs | Packs and plans come from the provider interface. | d |
| `/settings/workspace` | The workspace you are working in: name, members, roles, invitations, leaving | — | Shown as a Settings tab only in a workspace; a personal account is sent to `/settings`. `docs/workspaces.md`. | workspaces |
| `/join/[token]` | An invitation: who invited you to which workspace, join or decline | — | Needs a session; a guest signs in and comes back. | workspaces |
| (menu) | Account menu at the foot of the sidebar, signed in or as a guest | Account menu | Guests can look around, as on Venice: Home, the studio (composer works; Generate waits for sign-in), public characters, an empty library and the developer docs. Running anything asks them to sign in, because every job is charged to an allocation. Chats, settings, API keys and creating or calling a character need an account (`lib/auth/guard.ts`). | built |
| `/sign-in`, `/auth/start`, `/auth/callback` | Sign-in with Apple, Coinbase, Discord, Google, wallet, email or passkey, or continue as a guest | Sign in | Methods are instance config. With the development provider every method signs in a test user; with an OIDC provider the chosen method is passed to it as a hint. Wallet sign-in is a login method only: no token features. | built |

### Reference screens we leave out, and why — please confirm

1. **Discover** (templated "star in it" recipes). Not in the brief. *Left out for now.* The example gallery
   came off Home (decision 105); a discovery view is its planned home, and `listShowcase` is kept for it.
2. **Minds** (marketplace of user-built agents, with earnings). Not in the brief and overlaps Characters.
   *Left out.*
3. **Movie Editor** (multi-track timeline). The brief says "same media types and video composer modes";
   a timeline editor is a product in itself. *Left out of v1; the agent's "assembly" step produces the cut.*
   Say if you want it in.
4. **Classic chat as a separate mode.** We ship one chat. *Merged.*
5. **Token features** (dashboard, staking, wallet connect), referral, social feed profile, support
   launcher. *Left out* per the brief.
6. **Temporary chat** and **local-only chat storage**: kept as "don't save this chat"; where chats are
   stored is an instance decision and is stated on the Privacy page.

## Operator console (`/operator/*`, operator role only)

Uses builder-core-console's names: actors, allocations, grants, offerings, orchestrators, runners.

| Route | View | From builder-core-console | Adds | Data |
|-------|------|---------------------------|------|------|
| `/operator` | Overview | Health (stack status, ticker) | Active users, jobs today, revenue, wholesale cost, margin | live + mock (revenue) |
| `/operator/users`, `/[actor]` | Users | Users | Plan, API keys, usage history, suspend, roles | live (actors, allowance, keys) + mock (plan, roles) |
| `/operator/pricing` | Pricing and plans | — | Plans and allowances, markup rules, credit packs, provider feature support | mock (PymtHouse shape) |
| `/operator/billing` | Billing | — | Payment provider, payments, invoices, refunds, adjustments, tax, currency | mock |
| `/operator/costs` | Costs | Money, Usage | Retail vs wholesale per job and capability, pending charges | live (costs) + mock (retail) |
| `/operator/jobs`, `?id=` | Jobs | Jobs | Live sessions, failures, retry | live (jobs) + mock (sessions, retry) |
| `/operator/capabilities` | Capabilities | Network (offerings) | Enable/disable, retail price, defaults, routing, surface override | live (discovery) + config |
| `/operator/compute` | Compute | Network (orchestrators, runners) | Performance, allow/block lists, own GPUs | live (runners) + mock |
| `/operator/grants` | Grants | Operator actions (grants) | Funding, allocations, spend per grant | live (needs a real admin key) |
| `/operator/workspaces`, `/[id]` | Workspaces | — | Shared accounts: members with role and usage, invitations, plan, budget, keys, usage, suspend | mock (provider) |
| `/operator/settings` | Instance settings | — | Name, logo, colours, domain, sign-up, privacy defaults, surfaces, content policy | config |
| `/operator/keys` | API and admin keys | Operator actions (keys) | — | live |
| `/operator/system` | System | Health, Sources & gaps | Versions, `doctor` results, data-source table | live |

**Where we differ from builder-core-console, flagged:**
- It is read-only pages plus a separate "Operator actions" area; we put actions on the page they belong to,
  each as fill in → review → result (its pattern).
- It never holds an admin token server-side; writes use the signed-in operator's own key. The brief asks for
  a server-held admin token for sign-up provisioning. We follow the brief, and use the admin token only for
  writes and provisioning (engine request Q7).
- Its Money and Usage views read Clearinghouse Batteries directly with a fourth credential. Ours go through
  the provider interface so they are not coupled to one provider.
- Its Builder area (run a job, own jobs, own usage) is our user app.
- "Suspend" maps to allocation status `paused`; revoke is irreversible and separate.

## API surface (same functions as the UI)

| Route | Purpose |
|-------|---------|
| `/api/health` | Health check for the bundle and `doctor`: engine and database (`ok`, `behind`, `unreachable`, `none`) |
| `/api/v1` | Index of every operation, readable without a key |
| `/api/v1/*` | The instance's REST API: 30 operations (17 for users, 13 for operators), each calling one API client function. Authenticated by an API key, a browser session, or `OPERATOR_API_TOKEN` for operator operations. |
| `/api/mcp` | MCP server (streamable HTTP, stateless) exposing the same operations as tools |

The REST API and the MCP tools are generated from one list, `apps/web/lib/public-api/operations.ts`.
