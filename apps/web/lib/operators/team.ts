import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import type { NewOperatorInvitation, OperatorInvitation, OperatorRole, TeamOperator } from "@livepeer/api-client";

import type { InvitationRecord, OperatorRecord, OperatorTeamStore, Person, TeamChange } from "./store";

/** How long an invitation can be used for. */
export const INVITATION_HOURS = 72;
/** How long a used, revoked or lapsed invitation is kept, so the team list can say who invited whom. */
const KEEP_DAYS = 90;

const INVITATION_PREFIX = "opi_";
/** A link the CLI signed with SESSION_SECRET (`livepeer invite-operator`). It always makes an owner. */
const SIGNED_PREFIX = "ops_";

/** What the join page may show for a link. Anything but `waiting` says only that the link can't be used. */
export type InvitationView = { state: "waiting"; role: OperatorRole; invitedBy: string | null; expiresAt: string } | { state: "used" | "revoked" | "expired" | "unknown" };

/** Whether a sign-in makes an operator, and on whose word: the identity provider's (`claim`) or this instance's (`grant`). */
export interface Standing {
  role: "user" | "operator";
  source: "claim" | "grant" | null;
}

export interface OperatorTeamService {
  /**
   * Called at every sign-in with whether the identity provider calls the person an operator. Answers the
   * role their session gets, and keeps the team list's record of them current.
   */
  signIn(person: Person, claimed: boolean): Promise<Standing>;
  /** The person's place on the team by grant, read fresh. Null for anyone else, a claim included. */
  granted(userId: string): Promise<OperatorRecord | null>;
  operators(): Promise<TeamOperator[]>;
  invitations(): Promise<OperatorInvitation[]>;
  invite(role: OperatorRole, by: string): Promise<NewOperatorInvitation>;
  revoke(id: string): Promise<boolean>;
  read(token: string): Promise<InvitationView>;
  /** Puts the person on the team if the link is still good. Null if it isn't. */
  accept(token: string, person: Person): Promise<OperatorRecord | null>;
  /** Puts someone who already has an account on the team. */
  add(person: Person, role: OperatorRole, by: string): Promise<OperatorRecord>;
  setRole(userId: string, role: OperatorRole): Promise<TeamChange>;
  remove(userId: string): Promise<TeamChange>;
  sweep(): Promise<void>;
}

function same(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** What the signature of a CLI link covers. The CLI (`packages/cli`) signs the same words. */
export const signedLinkMessage = (id: string, expires: number) => `operator-invitation.v1:${id}.${expires}`;

/**
 * The people who run this instance, and the invitations to join them. The instance keeps the provider's
 * opaque id and a role for each, and their name and email only sealed. An invitation is a link that works
 * once: its token is 32 random bytes, of which only an HMAC keyed with SESSION_SECRET is kept.
 */
export function operatorTeam(store: OperatorTeamStore, secret: string, now: () => number = Date.now): OperatorTeamService {
  const hmac = (value: string) => createHmac("sha256", secret).update(value).digest("base64url");
  const iso = (ms: number) => new Date(ms).toISOString();
  const waiting = (invitation: InvitationRecord) => invitation.tokenHash !== null && !invitation.revokedAt && !invitation.acceptedAt && invitation.expiresAt > now();

  /** A CLI link's id and expiry, if its signature is this instance's. */
  function signed(token: string): { id: string; expiresAt: number } | null {
    if (!token.startsWith(SIGNED_PREFIX)) return null;
    const [id, expires, signature, ...rest] = token.split(".");
    const seconds = Number(expires);
    if (!id || !signature || rest.length > 0 || !Number.isSafeInteger(seconds)) return null;
    return same(hmac(signedLinkMessage(id, seconds)), signature) ? { id, expiresAt: seconds * 1000 } : null;
  }

  const state = (invitation: InvitationRecord): Exclude<InvitationView["state"], "unknown"> =>
    invitation.acceptedAt ? "used" : invitation.revokedAt ? "revoked" : invitation.expiresAt <= now() ? "expired" : "waiting";

  async function names(): Promise<Map<string, string>> {
    return new Map((await store.operators()).map((operator) => [operator.userId, operator.name]));
  }

  return {
    async signIn(person, claimed) {
      if (claimed) {
        await store.putClaim(person, iso(now()));
        return { role: "operator", source: "claim" };
      }
      await store.dropClaim(person.userId);
      if (!(await store.operator(person.userId))) return { role: "user", source: null };
      await store.refresh(person);
      return { role: "operator", source: "grant" };
    },

    async granted(userId) {
      const operator = await store.operator(userId);
      return operator?.source === "grant" ? operator : null;
    },

    async operators() {
      const all = await store.operators();
      const name = new Map(all.map((operator) => [operator.userId, operator.name]));
      return all.map((operator) => ({
        user_id: operator.userId,
        name: operator.name,
        email: operator.email,
        role: operator.role,
        via: operator.source === "claim" ? "provider" : !operator.invitationId ? "added" : operator.grantedBy ? "invitation" : "setup",
        added_by: operator.grantedBy ? (name.get(operator.grantedBy) ?? null) : null,
        since: operator.createdAt,
      }));
    },

    async invitations() {
      const name = await names();
      return (await store.invitations()).filter(waiting).map((invitation) => ({
        id: invitation.id,
        role: invitation.role,
        invited_by: invitation.invitedBy ? (name.get(invitation.invitedBy) ?? null) : null,
        created_at: invitation.createdAt,
        expires_at: iso(invitation.expiresAt),
      }));
    },

    async invite(role, by) {
      const token = `${INVITATION_PREFIX}${randomBytes(32).toString("base64url")}`;
      const invitation: InvitationRecord = { id: `inv_${randomBytes(9).toString("base64url")}`, role, tokenHash: hmac(token), invitedBy: by, createdAt: iso(now()), expiresAt: now() + INVITATION_HOURS * 3_600_000, revokedAt: null, acceptedBy: null, acceptedAt: null };
      await store.createInvitation(invitation);
      return { id: invitation.id, role, invited_by: (await names()).get(by) ?? null, created_at: invitation.createdAt, expires_at: iso(invitation.expiresAt), path: `/join/operator/${token}` };
    },

    revoke: (id) => store.revokeInvitation(id, iso(now())),

    async read(token) {
      const link = signed(token);
      if (link) {
        if (await store.invitation(link.id)) return { state: "used" };
        return link.expiresAt <= now() ? { state: "expired" } : { state: "waiting", role: "owner", invitedBy: null, expiresAt: iso(link.expiresAt) };
      }
      const invitation = token.startsWith(INVITATION_PREFIX) ? await store.invitationByTokenHash(hmac(token)) : null;
      if (!invitation) return { state: "unknown" };
      const found = state(invitation);
      if (found !== "waiting") return { state: found };
      return { state: "waiting", role: invitation.role, invitedBy: invitation.invitedBy ? ((await names()).get(invitation.invitedBy) ?? null) : null, expiresAt: iso(invitation.expiresAt) };
    },

    async accept(token, person) {
      const link = signed(token);
      if (link) return link.expiresAt <= now() ? null : store.acceptSigned({ ...link, role: "owner" }, person, now());
      const invitation = token.startsWith(INVITATION_PREFIX) ? await store.invitationByTokenHash(hmac(token)) : null;
      return invitation ? store.accept(invitation.id, person, now()) : null;
    },

    add: (person, role, by) => store.grant(person, { role, grantedBy: by, invitationId: null, at: iso(now()) }),
    setRole: (userId, role) => store.setRole(userId, role),
    remove: (userId) => store.remove(userId),
    sweep: () => store.sweep(iso(now() - KEEP_DAYS * 86_400_000)),
  };
}
