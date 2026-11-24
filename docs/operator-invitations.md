# Operator invitations: plan

Status: **proposed on 24 November 2026, not approved, nothing built.**

An instance has no way to add a second operator today unless its identity provider manages roles. This
plan adds a **Team** section to the console's settings where an operator invites another person by link, and
makes the instance's sign-up setting do what it says.

## 0. Decisions I need from you

Each has a recommendation; the rest of the plan assumes it.

| # | Decision | Recommendation |
| --- | --- | --- |
| D1 | How an invitation reaches the person. Workspace invitations assume the provider holds them and sends the email (Q20). | **A link the operator copies and sends themselves.** The instance keeps a hash of the token, the role and an expiry, and no email address. It works today, with any provider and with mock data, and an operator usually invites a handful of people they already talk to. If PymtHouse later holds invitations and sends email (Q20), the email becomes a second way to deliver the same link. |
| D2 | Make `auth.signUp` enforced in the same build. It is copy on the sign-in page today and nothing checks it (section 1). | **Yes.** An invitation only means something if a closed instance refuses everyone else. |
| D3 | How the first operator gets in on a new instance. | **`./livepeer setup` prints a one-time invitation link** for the first operator, and `./livepeer invite-operator` prints another later (for a lost or locked-out instance). The bundle has no built-in account and no default password. |
| D4 | Removing an operator. | **Any operator can remove any other, never the last one.** An operator can't remove themselves while they are the only one. Removal sets the role back to `user` and keeps the account. |
| D5 | How long a link lasts. | **72 hours, single use**, revocable from the Team section until it's used. |

## 1. What exists today

- The session's role comes from the identity provider. With OIDC, a session is `operator` when the
  provider's `roles` or `groups` claim contains `operator` (`apps/web/lib/auth/oidc-provider.ts`). With the
  mock provider, the role is the provider user's `role`, which `identity.setUserRole` changes.
- An operator can promote someone who already has an account: Users → a person → Role
  (`setUserRoleAction` in `apps/web/lib/operator/actions.ts`, calling `provider.identity.setUserRole`).
  Taking the role away ends that person's console phone sessions.
- `auth.signUp` is `open`, `invite` or `closed`. The `full` preset is `open` and the `headless` preset is
  `closed`. Only `apps/web/app/sign-in/page.tsx` reads it, to choose a sentence. Nothing refuses a new account
  and nothing issues an invitation.

So on a console-only instance (`surfaces.app` off) a teammate can only become an operator through the
identity provider's groups: nobody can make an account to be promoted, and the Users page lists only people
who already have one.

## 2. Who this is for, and what it is not

- **Operators are not a workspace.** A workspace is a shared account people spend from, with credits, a
  plan, keys and three roles (`docs/workspaces.md`). The operator team is the list of people who can run this
  instance: one per instance, no budget, one role, nothing to switch between. They share the shape of an
  invitation link and a join page, not their data or permissions.
- **Instances whose identity provider manages roles** (a generic OIDC provider, where the `roles` or
  `groups` claim decides) don't get invitations. The provider decides who is an operator, so an invitation from the console would be undone at
  the next sign-in. The Team section lists the current operators and says to change the group in the
  provider.

## 3. The console: Settings → Team

- **Operators:** name, email (read from the provider at display time), how they became one (invited by whom,
  or "from your identity provider"), last console sign-in, and Remove. Remove is refused for the last
  operator (D4).
- **Pending invitations:** who made it, when it expires, Copy link and Revoke. The link is shown once, when
  it's made; afterwards the row shows only that it exists, because only a hash is stored.
- **Invite an operator** makes a link and shows it with "Send this to the person you're inviting. Anyone with
  it can become an operator of *Instance* until it's used or expires on *date*."
- Operator phones and the audit log stay where they are (System). Inviting, joining and removal are written
  to the audit log as their own events.
- On phones: none of this. It belongs with "Stays on the web" in `docs/mobile/plan.md` §18.3.

## 4. Accepting: `/join/operator/<token>`

1. The page checks the token. An expired, used or revoked one says so and nothing else.
2. A visitor who isn't signed in sees "*Inviter* invited you to run *Instance*" and signs in with any method
   the instance offers. The token travels in the sign-in flow cookie, so sign-up is allowed for this one
   sign-in even when `signUp` is `closed` or `invite`.
3. Once signed in, the page names the account: "You'll become an operator of *Instance* as *Name*
   (*email*)", with "Not you? Use another account". **Accept** needs a sign-in in the last 5 minutes, the same
   rule as enrolling a console phone, so an old session left open somewhere can't accept a forwarded link.
4. Accepting marks the token used in the same statement that reads it (`DELETE … RETURNING`), calls
   `provider.identity.setUserRole(userId, "operator")`, reseals the session cookie with the new role and
   opens `/operator`.

**Someone who already has an account** (the same person who uses the user app) keeps it. Matching is by the
account that accepts, not by email, so nothing is merged. Their builder key, credits, plan, jobs and
workspaces are unchanged. Their phone's user session stays a user session; the console on a phone still
needs its own operator sign-in (§18.2 of the mobile plan).

**A new person on a console-only instance** gets an identity in the provider and no builder account, because
there is no user app for them to spend in. On an instance with both, they get a builder account at first use
of the user app, as anyone does.

## 5. Sign-up enforced (D2)

In `/auth/callback`, before a session is made:

- `open`: as today.
- `invite`: a new identity is refused unless the flow carries a valid operator invitation, or, once
  workspace invitations are live, a pending workspace invitation for that person.
- `closed`: a new identity is refused unless the flow carries a valid operator invitation.

"New" means the provider has no user for the identity (`identity.getUser` returns null). A refused visitor
lands on `/sign-in?error=closed` with the sentence the sign-in page already has. An existing user can always
sign in. The native apps get the same refusal through `returnToApp` with a new `closed` reason.

With OIDC, the identity provider may already have created its own account; the instance only refuses to make
a session or provision anything for it. With PymtHouse, whether it can refuse first-time sign-ins itself is
part of Q25.

## 6. Storage

One new table in the instance's Postgres (`docs/database.md` §2):

| Table | Columns | Keys and indexes |
| --- | --- | --- |
| `operator_invitations` | `id`, `token_hash`, `invited_by` (provider user id), `created_at`, `expires_at`, `revoked_at` null, `accepted_by` null, `accepted_at` null | PK `id`; unique `token_hash`; index `expires_at` |

No name or email column; the console reads both from the provider when it shows a row. Accepted and revoked
rows are kept for 90 days so "invited by" can be shown, then swept by the alerts round with the expired
codes. A token is 32 random bytes, hashed with the existing HMAC keyed with `SESSION_SECRET`.

## 7. API client and operations

Added to `apps/web/lib/public-api/operations.ts` first, each with its `output`, and to
`docs/data-sources.md` and `docs/ui-actions.md`. All are web-only (no `mobile` mark).

| Operation | Method and path | Notes |
|---|---|---|
| `operator_list_team` | `GET /operator/team` | Operators and pending invitations. Operators from `identity.listUsers` filtered by role. Reader token for the provider read. |
| `operator_create_invitation` | `POST /operator/team/invitations` | Returns the link once. |
| `operator_revoke_invitation` | `DELETE /operator/team/invitations/{id}` | |
| `operator_remove_operator` | `DELETE /operator/team/{userId}` | `setUserRole(userId, "user")`, ends their console phone sessions, refused for the last operator. Replaces the Role control on user detail, which links here. |
| `get_operator_invitation` | `GET /join/operator/{token}` | No authentication. Instance name, who invited, expiry; nothing about the instance's other operators. |
| `accept_operator_invitation` | `POST /join/operator/{token}` | Signed in, with a recent sign-in. |

`provider.features` gains `operatorInvitations: boolean`: true for the mock provider, false for Batteries
until it can set a role, and for PymtHouse whatever Q25 answers. With a generic OIDC sign-in the Team section
is read-only whatever the provider says, because the claim decides the role.

## 8. Build order

One pull request, a commit per slice:

1. Table, migration, invitation store with its contract tests (single use, expiry, revoke, concurrent
   accept).
2. Sign-up enforced in `/auth/callback` and the native hand-off, with tests for each mode.
3. Operations and API client functions, the data-source map (`mock` for the provider calls the mock
   implements, `live` for the instance's own table), and the docs tables.
4. Console Team section, the join page, user detail's Role control pointing at Team.
5. `./livepeer setup` prints the first link; `./livepeer invite-operator` prints another. `doctor` warns
   when an instance has no operator.
6. Screenshots (dark, light, mobile width) of Team and the join page's states, design decisions logged,
   README and `docs/route-map.md` updated.

Development sign-in already offers Adam (user) and Sam (operator); this adds a third test person with no
account, to try joining a closed instance.

## 9. Not in this build

- Email delivery of invitations (waits for Q20 or a mail setting on the instance).
- More than one operator role (read-only operators, billing-only operators).
- Inviting or removing operators from a phone.
- Restricting a link to an email address or domain. Possible later by storing a hash of the address, if
  forwarded links turn out to matter.
