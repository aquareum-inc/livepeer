# Operator invitations: plan

Status: **approved on 25 November 2026 with every recommendation in section 0 as written; built on 25 and 26
November 2026. Section 13 says where the build departs from the plan below, and what is not done.**
Proposed on 24 November 2026, revised on 25 November after a review against the code (section 11 says what
changed), with operator roles added the same day at the owner's request (D7, section 4).

An instance has no way to add a second operator today unless its identity provider manages roles. This
plan adds a **Team** page to the console where an owner invites another person by link, with
one of three roles, and makes the instance's sign-up setting do what it says.

## 0. Decisions I need from you

Each has a recommendation; the rest of the plan assumes it.

| # | Decision | Recommendation |
| --- | --- | --- |
| D1 | How an invitation reaches the person. Workspace invitations assume the provider holds them and sends the email (Q20). | **A link the operator copies and sends themselves.** The instance keeps a hash of the token and an expiry, and no email address. It works today with any provider, and an operator usually invites a handful of people they already talk to. If PymtHouse later sends invitation emails (Q20), the email becomes a second way to deliver the same link. |
| D2 | Make `auth.signUp` enforced in the same build. It is copy on the sign-in page today and nothing checks it (section 1). | **Yes.** An invitation only means something if a closed instance refuses everyone else. |
| D3 | How the first operator gets in on a new instance. | **`./livepeer setup` prints a one-time link** for the first owner, and `./livepeer invite-operator` prints another later (for a locked-out instance). The CLI signs the link with `SESSION_SECRET` from `.env`, so it needs no running app and no account or default password exists. On Vercel the same command is run locally with the project's `SESSION_SECRET`. |
| D4 | Removing an operator. | **An owner can remove anyone; anyone can leave; the last owner can't be removed, leave or be demoted.** Removal takes away console access at the next request and keeps the account. |
| D5 | How long a link lasts. | **72 hours, single use**, revocable from the Team section until it's used. |
| D6 | **Where the fact "this person is an operator" is kept.** Today it has no working home (section 1). | **In the instance's own database: one row per operator, holding the provider's opaque user id.** A person is an operator if their identity provider's token says so, or they have a row. Being an operator is a fact about the instance, not about billing; Batteries has no users at all; and it fits the rule that the app stores ids and a role and nothing else. If PymtHouse can later hold the role and put it in the sign-in token (Q25), the rows can move there. |
| D7 | **Operator roles, and where the lines fall.** | **Three fixed roles: Owner, Member, Viewer** (section 4). Owners decide what the instance is, what it charges and who runs it. Members handle people and jobs. Viewers read. Several owners are allowed. The table in section 4 is the part to check: each line is a judgment, and moving one is a one-line change before or after the build. |

## 1. What exists today

- **The session's role comes from the sign-in token and nowhere else.** With OIDC, the only sign-in a real
  instance can use, a session is `operator` when the `roles` or `groups` claim contains `operator`
  (`apps/web/lib/auth/oidc-provider.ts`). The mock sign-in has two fixed people, Adam (user) and Sam
  (operator). The role is sealed into the cookie for 8 hours and the guard, `requireOperator` and the phone
  enrolment all read it from there.
- **The Role control on user detail doesn't grant access.** `setUserRoleAction` calls
  `provider.identity.setUserRole`, which changes the payment provider's user record: in the mock, a row in
  memory; in Batteries, unsupported. Sign-in never reads that record, so a promoted person still signs in as
  a user. Demoting someone does end their console phone sessions, but their browser session keeps the console
  until the cookie expires.
- **`auth.signUp` is not enforced.** It is `open`, `invite` or `closed` (`full` preset: `open`; `headless`:
  `closed`). Only `apps/web/app/sign-in/page.tsx` reads it, to choose a sentence.
- **Nothing is provisioned at sign-up yet.** `createSession` gives every session the development builder
  key; per-user provisioning with the admin token is still to come.

So on any real instance, a teammate can only become an operator through the identity provider's groups.

## 2. Who this is for, and what it is not

- **Operators are not a workspace.** A workspace is a shared account people spend from, with credits, a
  plan, keys and three roles (`docs/workspaces.md`). The operator team is the list of people who can run this
  instance: one per instance, no budget, one role, nothing to switch between. They share the shape of an
  invitation link and a join page, not their data or permissions.
- **Instances that manage operators in their identity provider** keep doing so: the claim still works, and
  those people appear in Team marked "from your identity provider", without Remove. Invitations work beside
  it. (The first draft turned invitations off under OIDC; with D6 there is no need.)

- **Identity stays with the identity provider.** Operators sign in the way users do, through the instance's
  OIDC provider. With PymtHouse that is PymtHouse, which is the OIDC issuer and holds the person's record.
  Clearinghouse Batteries has no login or users at all, so an instance on it signs people in with an OIDC
  provider of its own choosing. This plan adds no passwords, no sign-in method and no user table. The
  instance holds the provider's opaque user id, the operator role, and the sealed name-and-email snapshot
  already approved for device sessions (`docs/database.md` D1), which is what lets Team show names where
  the provider can't be asked.

## 3. The operator role, after this change (D6)

One function, `effectiveRole(identity)`, used by `/auth/callback` for the browser session, the user device
session and the console phone enrolment:

- `operator` if the token's claim says so (source `claim`), or the instance has an operator row for the
  user id (source `grant`); otherwise `user`.
- The session records the source. For a `grant` session, the proxy's guard and `requireOperator` check that
  the row still exists on every console request (one indexed read; the proxy already reads settings from the
  database). Removal therefore takes effect at once in the browser, and `operatorDevices().revokeUser`
  already ends the phones. A `claim` session lasts until its cookie expires, as today.
- A claim operator gets a row with source `claim` written at sign-in, so Team can list them. That row grants
  nothing: a later sign-in without the claim deletes it.
- (Changed in the build, section 13: this control was removed and the page shows the role only.)
  The Role control on user detail becomes **Add to team** (an owner picks a role; writes a `grant` row, for
  someone who already has an account) and links to Team for changes and removal. `provider.identity.setUserRole` is no longer called by the
  app; it stays in the interface for a provider that can carry the role itself (Q25).

## 4. Roles (D7)

The session's role stays `user` or `operator`: that decides whether the console opens at all. What an
operator may do inside it is their **operator role**, held on their row (section 8) and read on every
request, never from the cookie, so a change takes effect at once. The middle role is called Member, the usual name for
the role that does the everyday work and can't change the setup or the team; workspaces use the word the same
way.

| May… | Owner | Member | Viewer |
|------|:-----:|:-------:|:------:|
| See every console page, including revenue, costs, keys' names and the audit log | yes | yes | yes |
| Enrol their own phone, choose their own alerts, send themselves a test alert, revoke their own phone | yes | yes | yes |
| Leave the team | not the last owner | yes | yes |
| Suspend and resume a user or a workspace | yes | yes | no |
| Top up a user or a workspace, assign a plan, refund a payment | yes | yes | no |
| Retry a job | yes | yes | no |
| Keep up or take down a reported character | yes | yes | no |
| Switch a capability on or off, block a compute operator | yes | yes | no |
| Set markup and which surfaces a capability appears in; plans, credit packs, the top-up range, billing settings | yes | no | no |
| Create and fund grants | yes | no | no |
| Issue and revoke API and access keys | yes | no | no |
| Instance settings, surfaces, appearance, sign-up, and resetting them | yes | no | no |
| Invite, add, change a role, remove; revoke someone else's phone | yes | no | no |

- **In one line: owners decide what the instance is, what it charges and who runs it; members look after
  people and jobs; viewers read.**
- **One function** in the API client's operator side, `operatorCan(role, action)`, with its own tests. The
  server refuses with it and the screens hide controls with it, as `can(role, action)` does for workspaces.
  Every server action in `apps/web/lib/operator/actions.ts` names its action, and every operator operation
  in `operations.ts` that changes something declares the role it needs; a test fails if one doesn't.
- **A viewer's client can't change anything even if a check is missed:** it is built with
  `buildReaderClient()`, which holds the reader token and no admin token.
- **`operator_set_capability` is split in two**, since switching a capability off is a member's emergency
  lever and its markup is pricing: `operator_set_capability_enabled` (member) and the existing operation
  for markup and surfaces (owner).
- **Phones** follow the same roles through the dispatcher: a viewer's phone can't suspend a user or resolve
  a report, with or without Face ID. The apps hide those controls from `operator_status`, which gains the
  caller's operator role. No new screens.
- **People from the identity provider** (a `claim` row) are owners, as they are in effect today. So is the
  instance's operator token. Mapping provider groups to roles is not in this build.
- **Several owners, no transfer.** Nothing is billed to an owner, so there is no single owner to hand over
  as a workspace has. The rule is only that one must always remain.

## 5. The console: Team

Built as its own page, `/operator/team`, beside Settings in the sidebar, not as a section of Settings
(section 13).

- **Operators:** name, email, role, how they became one ("invited by *name*", "added by *name*", "first
  owner, from setup", "from your identity provider"), since when. An owner sees a role menu and Remove on
  each row except people from the identity provider; everyone sees Leave on their own. Names and emails come from the same
  sealed snapshot the device sessions use (`docs/database.md` D1), since Batteries can't look a user up.
- **Pending invitations:** the role, who made it, when it expires, and Revoke. The link is shown once, when it's
  made; afterwards the row shows only that it exists, because only a hash is stored.
- **Invite** (owners only) asks for a role, with one line under each saying what it can do, makes a link
  and shows it with "Send this to the person you're inviting. Anyone with it can become a *role* of
  *Instance* until it's used or expires on *date*." Members and viewers see the team and no controls.
- Inviting, revoking, joining, adding, changing a role and removing are written to the existing audit log as `change`
  entries with the operation's name and the person's id as the target.
- States: loading, an error state, and the empty state for invitations ("No invitations waiting"). The
  operators list is never empty.
- On phones: none of this. It belongs with "Stays on the web" in `docs/mobile/plan.md` §18.3.

## 6. Accepting: `/join/operator/<token>`

The page lives outside the user app's route group. `surfacePathServed` serves it whenever the console is on
(today every path outside `/operator` and sign-in is 404 on a console-only instance), and the guard lists it
as public, so it can be read signed out. The existing `/join/<token>` for workspaces is untouched.

1. The page checks the token. An expired, used or revoked one says so and nothing else.
2. A visitor who isn't signed in sees "*Inviter* invited you to *Instance* as a *role*" and signs in with any method
   the instance offers. `/auth/start` records the token in the sealed flow cookie, which is what lets a new
   person through a `closed` or `invite` instance for this one sign-in (section 7).
3. Once signed in, the page names the account and the role: "You'll join *Instance* as a *role*, as *Name*
   (*email*)", with what the role can do and "Not you? Use another account". Someone already on the team
   keeps the higher of their role and the invitation's.
4. **Accept** needs a sign-in in the last 5 minutes, the rule for enrolling a console phone. The session
   cookie gains the sign-in time (`authenticatedAt`) for this. Someone signed in longer ago is sent through
   `/auth/start` with `fresh` and comes back. As for phones, an identity provider that doesn't report
   `auth_time` can't satisfy this.
5. Accepting takes the invitation and writes the operator row in one transaction, reseals the cookie as an
   operator and opens `/operator`. Two people racing for one link: one wins, the other sees "already used".

**Someone who already has an account** keeps it. Matching is by the account that accepts, not by email, so
nothing is merged. Their builder key, credits, plan, jobs and workspaces are unchanged. Their phone's user
session stays a user session; the console on a phone still needs its own operator sign-in (mobile plan
§18.2).

**A new person on a console-only instance** gets a session and an operator row, and nothing in the payment
provider: no user record, no allocation, no builder key.

**Known limit:** a new person who signs in with a link and then doesn't accept has a user session on an
instance that is closed to sign-ups, until the cookie expires. They were trusted with more than that.

## 7. Sign-up enforced (D2)

In `/auth/callback`, before any session or device code is made:

- `open`: as today.
- `closed`: an unknown person is refused unless the flow carries a valid operator invitation.
- `invite`: the same, plus, once workspace invitations are live, a pending workspace invitation for them.

A person is **known** if the token's claim makes them an operator, or they have an operator row, or the
payment provider has them: one new API client function, `provider.identity.isKnown(userId)`, answered by
`identity.getUser` where the provider has users (mock, PymtHouse) and by the existence of an allocation
where it doesn't (Batteries). When real sign-up provisioning is built it goes behind the same check.

A refused visitor lands on `/sign-in?error=closed` with the sentence the sign-in page already has; the
native apps get a new `closed` reason through `returnToApp`. With OIDC the identity provider may already
have made its own account; the instance only declines to make a session. Whether PymtHouse can refuse
first-time sign-ins itself is part of Q25.

**Mock sign-in** gains a way to be someone new: the email method with an address at `new.example.test`
signs in as a new person named from that address; any other address is still Adam (section 13). Without it, `closed` and joining can't be tried.

## 8. Storage

Two new tables in the instance's Postgres (`docs/database.md` §2), one migration:

| Table | Columns | Keys and indexes |
| --- | --- | --- |
| `operators` | `user_id`, `role` (`owner`, `member`, `viewer`), `source` (`grant` or `claim`), `identity_sealed`, `granted_by` null, `invitation_id` null, `created_at` | PK `user_id` |
| `operator_invitations` | `id`, `role`, `token_hash` null, `invited_by` null, `created_at`, `expires_at`, `revoked_at` null, `accepted_by` null, `accepted_at` null | PK `id`; unique `token_hash`; index `expires_at` |

- No plaintext name or email. `identity_sealed` is the AES-256-GCM snapshot keyed with `SESSION_SECRET`,
  refreshed at each sign-in, as on device sessions.
- An invitation's token is 32 random bytes; only its HMAC is stored.
- **A link from the CLI (D3)** is not in the table until it's used. It is `id.expires.signature`, signed
  with `SESSION_SECRET`. Accepting verifies the signature and expiry and inserts the id as an accepted row
  with no token hash and no inviter; the primary key makes it single use. A CLI link always makes an owner.
- Used and revoked invitations are kept 90 days so "invited by" can be shown, then swept by the alerts
  round with the expired codes. Expiry is checked on read, so it holds where the round doesn't run.
- Removing or demoting the last owner is refused, in the same statement that makes the change, so two
  owners removing each other at once can't leave none. `claim` rows count as owners.

## 9. Functions and operations

Instance state, like operator phones, in `apps/web/lib/operators/`, behind the store interface with a
contract test. Operator operations added to `apps/web/lib/public-api/operations.ts` first, each with its
`output`, web-only (no `mobile` mark), and listed in `docs/data-sources.md` (live, the instance's own
tables) and `docs/ui-actions.md`:

| Operation | Method and path | Notes |
|---|---|---|
| `operator_list_team` | `GET /operator/team` | Operators with their roles, pending invitations, and the caller's own role. Any role. |
| `operator_create_invitation` | `POST /operator/team/invitations` | A role → the link, once. Owner. |
| `operator_revoke_invitation` | `DELETE /operator/team/invitations/{id}` | Owner. |
| `operator_add_operator` | `POST /operator/team` | An existing user's id and a role. No screen offers it since the review of the build (section 13); it remains for the API. Owner. |
| `operator_set_operator_role` | `PATCH /operator/team/{userId}` | Owner. Refused for the last owner and for a `claim` row. |
| `operator_remove_operator` | `DELETE /operator/team/{userId}` | Ends their console phone sessions. Owner, or anyone for themselves. Refused for the last owner and for a `claim` row. |
| `operator_set_capability_enabled` | `PATCH /operator/capabilities/enabled` | Member. Split from `operator_set_capability`, which becomes owner-only (section 4). |
| `operator_status` (changed) | — | Gains the caller's operator role, for the phones. |

Reading and accepting an invitation are web-only server actions (`getOperatorInvitation`,
`acceptOperatorInvitation`), not `/api/v1` operations: accepting needs a browser session with a recent
sign-in, which an API key or a device session can't give. Plus `isKnownUser` (section 7) and
`operatorCan` (section 4) in the API client.

Changing an operation's shape means `corepack pnpm mobile:generate` and the Mobile columns in the two docs
tables, as `CLAUDE.md` asks.

Nothing here is mocked and no provider feature flag is needed: with `MOCK_ONLY=1` the same tables run in
the embedded Postgres.

## 10. Build order

One pull request, a commit per slice:

1. Tables, migration, the operators and invitations store with contract tests (single use, expiry, revoke,
   two accepts at once, last operator, CLI links).
2. `effectiveRole`, the session's role source and sign-in time, the per-request check for `grant`
   sessions, and the role guard tests. Sam stays an operator in mock sign-in by claim.
3. Sign-up enforced in `/auth/callback` and the native hand-off, `isKnownUser`, the new mock person, tests
   for each mode.
4. Roles: `operatorCan` and its tests, the check in every server action and operator operation with the
   test that none is missed, the reader-only client for viewers, the capability operation split, and each
   console view hiding what the role can't do.
5. Operations, the Team section, **Add to team** on user detail, audit entries.
6. The join page and its route rules (`surfacePathServed`, the guard), accept with a fresh sign-in.
7. `./livepeer setup` prints the first link; `./livepeer invite-operator` prints another.
8. Phones, iOS then Android: regenerate the clients, hide suspend, resume and the report decisions from a
   viewer, and show the server's refusal if a role changes mid-session. Build and run both.
9. Screenshots (dark, light, mobile width) of Team as each role, each state of the join page and one
   console page as a viewer, plus the phone screens as a viewer in `docs/screenshots/mobile/`; design decisions
   logged, and `README.md`, `docs/route-map.md`, `docs/architecture.md`, `docs/database.md` §2,
   `docs/data-sources.md` and `docs/ui-actions.md` updated.

## 11. What the review on 25 November changed

- **The role had nowhere to live.** The first draft granted the role with `provider.identity.setUserRole`.
  That call never reaches sign-in, in any provider, so an accepted invitation would have been lost at the
  next sign-in and wouldn't have worked on a real instance at all. Hence D6, the `operators` table and
  section 3. This also fixes today's Role control, which has the same fault.
- **Removal wasn't immediate.** The role sat in an 8-hour cookie. `grant` sessions are now checked per
  request.
- **Invitations now work under OIDC too**, beside the provider's groups, and the provider feature flag is
  gone.
- **The join page would have been a 404** on a console-only instance, the case this plan is for. Section 6
  names the two route rules.
- **"New person" couldn't be decided** with `identity.getUser`, which Batteries doesn't have. Section 7
  defines "known", and adds a new person to mock sign-in so it can be tested.
- **The CLI can't write to the database** (it is a script that calls the app over HTTP), so its links are
  signed, not stored (D3, section 8).
- **The fresh sign-in check needs the sign-in time in the session**, which it didn't hold.
- Smaller: names and emails come from a sealed snapshot, not a provider lookup; the audit log uses its
  existing `change` event; the "last console sign-in" column and the `doctor` warning are dropped, since
  nothing records the first and the second would need a public "this instance has no operator" signal.

## 12. Not in this build

- Email delivery of invitations (waits for Q20 or a mail setting on the instance).
- Custom roles, a billing-only role, or permissions set per person.
- Mapping an identity provider's groups to operator roles: everyone who arrives by claim is an owner.
- Inviting or removing operators from a phone.
- Restricting a link to an email address or domain. Possible later by storing a hash of the address, if
  forwarded links turn out to matter.
- A setting that turns invitations off for instances that want their identity provider to be the only way
  in.

## 13. What the build changed, and what is left

Built in the nine slices of section 10, a commit each, on 25 and 26 November 2026. Where the result
differs from the sections above:

- **Team is its own page, not a section of Settings** (`/operator/team`, under Instance in the sidebar).
  Settings is one form with a Save button; everything on Team applies at once, and members and viewers
  need to open it without being shown a form they can't use. Design decision 126.
- **No "Add to team" on a user's page.** Slice 5 built it; the owner's review found a Team box on every
  user's page too prominent for something true of very few people, so it was removed. A user's page shows
  an "Operator team" panel only for someone already on the team (decision 130), and an owner adds an
  existing user by sending them a link like anyone else. The `operator_add_operator` operation remains
  for the API.
- **The new mock person is an address at `new.example.test`**, not "any address other than Adam's or
  Sam's": existing tests and the phone testing notes sign in as Adam with arbitrary addresses.
- **`invite` sign-up behaves as `closed`.** The plan's extra rule (a waiting workspace invitation admits
  you) needs workspace invitations to be live, and they are still mocked.
- **`isKnownUser` became `provider.identity.isKnown`**, on the provider interface with the other identity
  functions.
- **A role changed while a phone has the console open** shows its old buttons until Status reloads. The
  server refuses in the meantime and the app shows the refusal.
- **Two things outside the plan, from the owner's review of the build:** a plan change on a user's or a
  workspace's page now asks for confirmation before it saves (decision 131), and at phone width the
  invitations table drops "Invited by" so Revoke stays on screen (decision 132).

Checked: the whole path in a browser on a closed, console-only mock instance (an owner makes a link, a new
person joins as a member, sees the read-only pages, leaves and is refused at sign-in), a first-owner link
from the command line, and a viewer on iOS and Android. Screenshots of Team as each role, each state of the
join page and Settings as a viewer are in `docs/screenshots/` in dark and light at desktop and phone
width; the phone screens are in `docs/screenshots/mobile/`.

Not done:

- The report page as a viewer was not opened in the Android emulator; the user page was.
- Nothing is connected to PymtHouse, so every provider answer in this build is the mock's or Batteries'.
  Q25 is still open.
- Email delivery (section 12). The owner asked about it after the build: the recommendation is to wait for
  John's answer on whether PymtHouse sends invitation emails (Q20 covers workspaces only), and otherwise
  to add an optional mail setting on the instance, with copy-link staying the default.

