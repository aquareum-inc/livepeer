# Workspaces: plan

Status: **proposed 23 November 2026, waiting for the project owner's approval. Nothing is built.**

A workspace is a shared account that several people belong to, each with a role, spending from one credit
balance. This plan settles what it is, then lists what gets built and in what order. It replaces the sketch in
`docs/architecture.md` ("Workspaces (planned, not built)"), which it mostly keeps.

PymtHouse will support shared accounts (John, 23 November 2026) but has not built them, so everything here
runs on mocked data behind the provider interface. The shapes are our best guess; each guess is marked
*assumption* and is a question for John in `docs/engine-requests.md` (Q18 to Q24).

## 1. What a workspace is

**A workspace is a billing account.** To the provider it is one account id that can be used anywhere a user
id is used today: it has an allocation (the credit balance), a plan, usage and API keys. To the engine it is
one actor. No money model changes and there is no second ledger; every existing provider function
(`getAllocation`, `getUserPlan`, `topUpAllocation`, `listUsage`) is called with the workspace's id instead of
the person's.

**A personal account stays what it is today, and is not a workspace.** Everyone keeps the account they got at
sign-up, shown as "Personal". It cannot have members. A workspace is a separate thing a person creates or is
invited to. Both are "accounts" in code (an id that owns a balance), so every screen works the same in either,
but nobody is asked to think of themselves as a workspace of one, and a personal account is never converted
into a shared one.

**A person can belong to several workspaces and switches between them.** The app acts in one account at a
time. The switcher sits at the top of the account menu: Personal, then each workspace with its balance, then
"Create workspace" and any invitations waiting.

Anyone signed in can create a workspace. A new one starts with no credit and no plan. The whole feature is
behind a provider feature flag (`features.workspaces`); with Batteries, which has no users, none of it shows.

## 2. What belongs to whom

| Thing | In a workspace it belongs to | Notes |
|-------|------------------------------|-------|
| Credit balance | Workspace | The workspace's allocation. Every member's work draws on it. |
| Plan | Workspace | One plan for the workspace. A member's personal plan is untouched and unused while they work here. |
| API keys | Workspace | A key spends the workspace's credit. It records who made it and outlives that person's membership. |
| Usage | Workspace | Each entry also records which member, or which API key, caused it. |
| Library | Workspace | Everything made here is shared with all members. Each item shows who made it. |
| Characters | Workspace | Private characters made here are the workspace's. Published characters stay public, as now. |
| Conversations | The member, inside the workspace | You see only your own chats. What a chat makes lands in the shared library. |
| Profile, sign-in, devices | The person | Unchanged. |
| Preferences (theme, enter sends, age confirmation, adult content, blocked characters) | The person | They follow the person into every account. |

When someone leaves or is removed, what they made stays in the workspace's library, their conversations there
are no longer reachable by anyone, and keys they made keep working until an admin revokes them.

## 3. Roles

Three roles, fixed. A workspace has exactly one owner. The instance roles (`user`, `operator`) are a
different thing and do not change.

| May… | Owner | Admin | Member |
|------|:-----:|:-----:|:------:|
| Make things and spend the workspace's credit | yes | yes | yes |
| See the balance, the plan and the member list | yes | yes | yes |
| See their own usage | yes | yes | yes |
| See everyone's usage | yes | yes | no |
| Invite people, cancel invitations | yes | yes | no |
| Remove a member, change a role between admin and member | yes | yes (not the owner) | no |
| Make and revoke API keys | yes | yes | no |
| Rename the workspace | yes | yes | no |
| Change the plan, buy credit | yes | no | no |
| Transfer ownership | yes | no | no |
| Leave | after transferring | yes | yes |

The line is simple to say: **the owner handles money, admins handle people and keys, members make things.**
Members cannot make API keys because a key spends shared credit with no person behind it.

The rules live in one pure function in the API client (`can(role, action)`). The API client refuses with it,
the screens hide with it, and it has its own tests. The role is read from the provider on every action, never
trusted from the session cookie.

## 4. Usage and limits

- In a workspace, **Settings → Usage** shows the workspace's total as today. Owners and admins also get a
  "By member" table: person, role, credits used this period, jobs, last active, with one row per API key
  ("Render agent, API key"). Members see only their own figures and entries.
- The same per-member figures appear beside each person on the members list.
- **Member limits: not in the first build.** A limit only works if whoever debits the balance enforces it,
  and that is the provider. An app-side check would be a ledger by another name and would not cover API keys.
  A nullable `monthly_credit_limit` on a member is added only once John confirms PymtHouse can enforce it
  (Q22). Until then an admin's tools are the usage table and removing someone.

## 5. Inviting, joining, leaving

- **Invite by email, with a role** (admin or member). The provider holds the pending invitation and sends
  the email (*assumption*, Q20), so the app keeps no email addresses of its own, in line with the decision
  that PymtHouse holds user records. An invitation lasts 7 days and can be resent or cancelled.
- Pending invitations are listed under the members, with "Copy link" beside each. In mock mode no email is
  sent, so the link is how joining is tested.
- **Joining:** the link opens `/join/<token>`: sign in if needed, see the workspace's name and who invited
  you, accept or decline. A signed-in person whose email has an invitation waiting also sees it in the
  account switcher. Accepting switches them into the workspace.
- **Leaving:** any admin or member can leave from the workspace settings. They land back in Personal.
- **Removing:** owner or admin, with a confirmation that says what stays behind (section 2).
- **Transferring ownership:** the owner picks an existing member, confirms by typing the workspace's name,
  and becomes an admin.
- **Deleting a workspace: not in the first build.** What happens to unspent credit is a provider policy we
  don't know yet (Q23). An operator can suspend one meanwhile.

## 6. The operator console

- A new **Workspaces** page beside Users: name, owner, members, plan, budget, spent, remaining, status.
- **Workspace detail:** members with role and usage, pending invitations, plan (assign), budget (top up), API
  keys, recent usage, and Suspend / Resume. The plan, top-up and usage parts are the existing user-detail
  parts given a workspace's id.
- **Suspending a workspace** pauses its allocation: nobody can spend from it and its keys stop working.
  Members can still sign in and use their personal accounts. Suspending a *person* (as today) stops them
  everywhere.
- **User detail** gains a short "Workspaces" list: which ones the person belongs to, and their role in each.
- Reads use the reader token; suspend, assign plan and top up use the admin token, as for users.
- The console on phones gets none of this in the first build.

## 7. Provider interface additions

All mocked, in the shape we expect PymtHouse to expose. Batteries reports `features.workspaces: false` and
throws `UnsupportedByProvider`.

```
features.workspaces: boolean

Workspace           { id, name, status: active | paused, owner_id, member_count, created_at }
WorkspaceMember     { workspace_id, user_id, name, email, role: owner | admin | member, joined_at }
WorkspaceInvitation { id, workspace_id, workspace_name, email, role, invited_by, token, expires_at,
                      status: pending | accepted | declined | revoked | expired }

workspaces:
  list()                               every workspace (operator)
  listForUser(userId)                  the person's memberships: workspace and role
  get(id)
  create({ name, ownerId })
  rename(id, name)
  setStatus(id, status)                also pauses or resumes the allocation
  listMembers(id)
  setMemberRole(id, userId, role)
  removeMember(id, userId)             also how a member leaves
  transferOwnership(id, toUserId)
  listInvitations(id)
  listInvitationsForUser(userId)
  getInvitation(token)
  invite(id, { email, role, invitedBy })
  revokeInvitation(invitationId)
  acceptInvitation(token, userId)
  declineInvitation(token, userId)

usage:
  UsageEntry gains  member_id (the person; null for an API key) and key_id (null for a person)
  listUsage / getUsageSummary filters gain  memberId
  getUsageByMember(accountId)          one row per member and per key: credits, jobs, last_used_at
```

`budgets` and `plans` do not change: their `userId` argument is read as "account id" and is renamed so in the
types.

**Assumptions to confirm with John** (Q18 to Q24 in `docs/engine-requests.md`): a workspace id works wherever
an `externalUserId` does; three fixed roles and several workspaces per person; PymtHouse holds and emails
invitations; usage records name the member or key; whether a per-member limit can be enforced; whether plans
are per seat and what happens to credit when a workspace closes; and that pausing a workspace is separate
from pausing a person. One question for Mike (R10): a job run by a workspace's actor needs to carry which
member ran it.

**In the app:**

- The session cookie gains the current account id. Switching is a server action that checks membership with
  the provider and reseals the cookie. When workspaces go live, switching also swaps the builder key for the
  workspace actor's; mocked until then.
- API client, user side: `listAccounts`, `createWorkspace`, `getWorkspace` (members, invitations, my role),
  `renameWorkspace`, `inviteMember`, `revokeInvitation`, `getInvitation`, `acceptInvitation`,
  `declineInvitation`, `setMemberRole`, `removeMember`, `leaveWorkspace`, `transferOwnership`,
  `getMemberUsage`. Existing account functions (`getAccount`, `getUsage`, `buyCredits`, `changePlan`, keys)
  act on the current account and check the role.
- API client, operator side: `listWorkspaces`, `getWorkspace`, `setWorkspaceStatus`; the existing plan and
  top-up functions take a workspace id.
- All new entries go in the data-source map as `mock`, and in `docs/data-sources.md` and `docs/ui-actions.md`.

## 8. Which clients, and in what order

**First build: the web user app and the web operator console.** One pull request, a commit per slice:

1. Types, the `workspaces` area of the provider interface, the mock with one seeded workspace, the role
   rules, and tests for all three.
2. API client functions, the data-source map, the current account in the session, switching.
3. Web user app: the account switcher, create workspace, **Settings → Workspace** (name, members, roles,
   invitations, leave, transfer), the `/join/<token>` page, usage by member, and plan, credit and key screens
   that respect the role (a member sees "Ask Inés, the owner" instead of a button).
4. The mock library, characters, conversations and keys kept per account, so switching shows that account's
   things. Today those mock stores are shared by everyone.
5. Operator console: Workspaces list and detail, suspend, and workspaces on the user detail.

Screenshots (dark, light, mobile width), design decisions logged and docs kept current after each, as
`CLAUDE.md` asks.

**Not in the first build:** member limits, deleting a workspace, per-seat pricing, a workspace avatar, the
public `/api/v1` operations, the native apps, and the console on phones.

**Native apps, later.** Until then a phone works in the Personal account only. When they follow, they need
three operations (`list_accounts`, `switch_account`, with the device session holding the current account,
and the current account in `get_me`), a switcher in Settings, and the workspace's name where the balance is
shown. Managing a workspace (inviting, roles, transfer) would stay on the web, as buying credit does.
