import type { OperatorRole } from "@livepeer/api-client";

import type { KeptIdentity } from "../data/identity";

/** Someone as the store needs them: the provider's id, and the name and email to keep sealed beside it. */
export interface Person extends KeptIdentity {
  userId: string;
}

/** One person on the team, as kept. */
export interface OperatorRecord extends Person {
  role: OperatorRole;
  /** `grant` makes its person an operator. `claim` only records that the identity provider does. */
  source: "grant" | "claim";
  grantedBy: string | null;
  invitationId: string | null;
  createdAt: string;
}

/** An invitation, as kept: the HMAC of its token, never the token. */
export interface InvitationRecord {
  id: string;
  role: OperatorRole;
  /** Null for a link the CLI signed, which is only written down once used. */
  tokenHash: string | null;
  invitedBy: string | null;
  createdAt: string;
  /** Milliseconds. */
  expiresAt: number;
  revokedAt: string | null;
  acceptedBy: string | null;
  acceptedAt: string | null;
}

/**
 * How a change to someone's place on the team ended. `last_owner`: it would have left nobody able to manage
 * the team. `from_provider`: the identity provider decides for this person, so the console can't.
 */
export type TeamChange = "done" | "missing" | "last_owner" | "from_provider";

/**
 * Where the team and its invitations are kept. Every method that could leave the team without an owner, or
 * let one link be used twice, decides and writes in one transaction.
 */
export interface OperatorTeamStore {
  operator(userId: string): Promise<OperatorRecord | null>;
  /** Oldest first. */
  operators(): Promise<OperatorRecord[]>;
  /** Records that the identity provider calls this person an operator. A row already there keeps its role and source. */
  putClaim(person: Person, at: string): Promise<void>;
  /** Forgets a claim the person no longer signs in with. A grant is left alone. */
  dropClaim(userId: string): Promise<void>;
  /** Keeps the name and email from the person's newest sign-in. */
  refresh(person: Person): Promise<void>;
  /**
   * Puts someone on the team. Someone already on it by grant keeps the higher of the two roles; a claim
   * becomes a grant with the role given.
   */
  grant(person: Person, grant: { role: OperatorRole; grantedBy: string | null; invitationId: string | null; at: string }): Promise<OperatorRecord>;
  /** Whether anyone on the team is an owner, by grant or on the identity provider's word. */
  hasOwner(): Promise<boolean>;
  /**
   * Makes someone the owner of a team that has none, or nothing. Decided and written with the team held, so
   * of two people asking at once only one is answered. Null when the team already has an owner.
   */
  grantFirstOwner(person: Person, at: string): Promise<OperatorRecord | null>;
  setRole(userId: string, role: OperatorRole): Promise<TeamChange>;
  remove(userId: string): Promise<TeamChange>;

  createInvitation(invitation: InvitationRecord): Promise<void>;
  invitation(id: string): Promise<InvitationRecord | null>;
  invitationByTokenHash(tokenHash: string): Promise<InvitationRecord | null>;
  /** Newest first, whatever became of them. */
  invitations(): Promise<InvitationRecord[]>;
  /** True if it was still waiting. */
  revokeInvitation(id: string, at: string): Promise<boolean>;
  /** Uses a waiting invitation and puts its person on the team, or neither. Null if it is no longer waiting. */
  accept(id: string, person: Person, at: number): Promise<OperatorRecord | null>;
  /** Uses a link the CLI signed, which is written down here for the first time. Null if it was used before. */
  acceptSigned(link: { id: string; role: OperatorRole; expiresAt: number }, person: Person, at: number): Promise<OperatorRecord | null>;
  /** Drops invitations that were used, revoked or ran out before a time. */
  sweep(before: string): Promise<void>;
}
