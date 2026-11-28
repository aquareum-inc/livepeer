import "server-only";

import type { OperatorRole } from "@livepeer/api-client";
import { and, asc, desc, eq, gt, isNull, schema, sql, type Database } from "@livepeer/db";

import { identitySeal } from "../data/identity";
import type { InvitationRecord, OperatorRecord, OperatorTeamStore, Person, TeamChange } from "./store";

const { operators, operatorInvitations: invitations } = schema;

/** What stands where an invitation's id would, for the owner who claimed an instance nobody ran yet. */
export const FIRST_SIGN_IN = "first-sign-in";

const RANK: Record<OperatorRole, number> = { viewer: 0, member: 1, owner: 2 };

/**
 * The team in Postgres. A change that could leave the team without an owner first locks every owner's row,
 * so two owners removing each other at the same moment are taken one after the other and the second is
 * refused. An invitation is used by one `UPDATE … RETURNING` inside the transaction that adds its person.
 */
export function postgresOperatorTeamStore(db: Database, secret: string): OperatorTeamStore {
  const identity = identitySeal(secret);
  type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

  const record = (row: typeof operators.$inferSelect): OperatorRecord => ({
    userId: row.userId,
    ...identity.open(row.identitySealed, row.userId),
    role: row.role,
    source: row.source,
    grantedBy: row.grantedBy,
    invitationId: row.invitationId,
    createdAt: row.createdAt.toISOString(),
  });

  const invitation = (row: typeof invitations.$inferSelect): InvitationRecord => ({
    id: row.id,
    role: row.role,
    tokenHash: row.tokenHash,
    invitedBy: row.invitedBy,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.getTime(),
    revokedAt: row.revokedAt?.toISOString() ?? null,
    acceptedBy: row.acceptedBy,
    acceptedAt: row.acceptedAt?.toISOString() ?? null,
  });

  async function grant(tx: Tx | Database, person: Person, given: { role: OperatorRole; grantedBy: string | null; invitationId: string | null; at: string }): Promise<OperatorRecord> {
    const [existing] = await tx.select().from(operators).where(eq(operators.userId, person.userId)).for("update");
    const identitySealed = identity.seal(person);
    if (!existing) {
      const [row] = await tx.insert(operators).values({ userId: person.userId, role: given.role, source: "grant", identitySealed, grantedBy: given.grantedBy, invitationId: given.invitationId, createdAt: new Date(given.at) }).returning();
      return record(row!);
    }
    if (existing.source === "grant") {
      const role = RANK[given.role] > RANK[existing.role] ? given.role : existing.role;
      const [row] = await tx.update(operators).set({ role, identitySealed }).where(eq(operators.userId, person.userId)).returning();
      return record(row!);
    }
    const [row] = await tx.update(operators).set({ role: given.role, source: "grant", identitySealed, grantedBy: given.grantedBy, invitationId: given.invitationId, createdAt: new Date(given.at) }).where(eq(operators.userId, person.userId)).returning();
    return record(row!);
  }

  /** Decides a change to one person with every owner's row held, so the answer is still true when it is written. */
  function change(userId: string, write: (tx: Tx) => Promise<unknown>, leavesAnOwner: (current: OperatorRole) => boolean): Promise<TeamChange> {
    return db.transaction(async (tx) => {
      const owners = await tx.select({ userId: operators.userId }).from(operators).where(eq(operators.role, "owner")).for("update");
      const [target] = await tx.select().from(operators).where(eq(operators.userId, userId)).for("update");
      if (!target) return "missing";
      if (target.source === "claim") return "from_provider";
      if (!leavesAnOwner(target.role) && !owners.some((owner) => owner.userId !== userId)) return "last_owner";
      await write(tx);
      return "done";
    });
  }

  return {
    async operator(userId) {
      const [row] = await db.select().from(operators).where(eq(operators.userId, userId)).limit(1);
      return row ? record(row) : null;
    },
    async operators() {
      return (await db.select().from(operators).orderBy(asc(operators.createdAt), asc(operators.userId))).map(record);
    },
    async putClaim(person, at) {
      const identitySealed = identity.seal(person);
      await db.insert(operators).values({ userId: person.userId, role: "owner", source: "claim", identitySealed, grantedBy: null, invitationId: null, createdAt: new Date(at) }).onConflictDoUpdate({ target: operators.userId, set: { identitySealed } });
    },
    async dropClaim(userId) {
      await db.delete(operators).where(and(eq(operators.userId, userId), eq(operators.source, "claim")));
    },
    async refresh(person) {
      await db.update(operators).set({ identitySealed: identity.seal(person) }).where(eq(operators.userId, person.userId));
    },
    grant: (person, given) => db.transaction((tx) => grant(tx, person, given)),
    async hasOwner() {
      return (await db.select({ userId: operators.userId }).from(operators).where(eq(operators.role, "owner")).limit(1)).length > 0;
    },
    grantFirstOwner(person, at) {
      return db.transaction(async (tx) => {
        // Nobody else may join the team until this is decided: a second asker waits here, then finds an owner.
        await tx.execute(sql`lock table ${operators} in share row exclusive mode`);
        const [owner] = await tx.select({ userId: operators.userId }).from(operators).where(eq(operators.role, "owner")).limit(1);
        if (owner) return null;
        return grant(tx, person, { role: "owner", grantedBy: null, invitationId: FIRST_SIGN_IN, at });
      });
    },
    setRole: (userId, role) => change(userId, (tx) => tx.update(operators).set({ role }).where(eq(operators.userId, userId)), (current) => current !== "owner" || role === "owner"),
    remove: (userId) => change(userId, (tx) => tx.delete(operators).where(eq(operators.userId, userId)), (current) => current !== "owner"),

    async createInvitation(made) {
      await db.insert(invitations).values({ id: made.id, role: made.role, tokenHash: made.tokenHash, invitedBy: made.invitedBy, createdAt: new Date(made.createdAt), expiresAt: new Date(made.expiresAt) });
    },
    async invitation(id) {
      const [row] = await db.select().from(invitations).where(eq(invitations.id, id)).limit(1);
      return row ? invitation(row) : null;
    },
    async invitationByTokenHash(tokenHash) {
      const [row] = await db.select().from(invitations).where(eq(invitations.tokenHash, tokenHash)).limit(1);
      return row ? invitation(row) : null;
    },
    async invitations() {
      return (await db.select().from(invitations).orderBy(desc(invitations.createdAt), desc(invitations.id))).map(invitation);
    },
    async revokeInvitation(id, at) {
      const rows = await db.update(invitations).set({ revokedAt: new Date(at) }).where(and(eq(invitations.id, id), isNull(invitations.revokedAt), isNull(invitations.acceptedAt))).returning({ id: invitations.id });
      return rows.length > 0;
    },
    accept(id, person, at) {
      return db.transaction(async (tx) => {
        const [used] = await tx
          .update(invitations)
          .set({ acceptedBy: person.userId, acceptedAt: new Date(at) })
          .where(and(eq(invitations.id, id), isNull(invitations.revokedAt), isNull(invitations.acceptedAt), gt(invitations.expiresAt, new Date(at))))
          .returning();
        if (!used) return null;
        return grant(tx, person, { role: used.role, grantedBy: used.invitedBy, invitationId: used.id, at: new Date(at).toISOString() });
      });
    },
    acceptSigned(link, person, at) {
      return db.transaction(async (tx) => {
        const written = await tx
          .insert(invitations)
          .values({ id: link.id, role: link.role, tokenHash: null, invitedBy: null, createdAt: new Date(at), expiresAt: new Date(link.expiresAt), acceptedBy: person.userId, acceptedAt: new Date(at) })
          .onConflictDoNothing()
          .returning({ id: invitations.id });
        if (written.length === 0) return null;
        return grant(tx, person, { role: link.role, grantedBy: null, invitationId: link.id, at: new Date(at).toISOString() });
      });
    },
    async sweep(before) {
      await db.delete(invitations).where(sql`coalesce(${invitations.acceptedAt}, ${invitations.revokedAt}, ${invitations.expiresAt}) < ${new Date(before)}`);
    },
  };
}
