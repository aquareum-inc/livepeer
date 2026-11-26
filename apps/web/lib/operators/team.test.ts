import { createHmac } from "node:crypto";

import { schema, type Database } from "@livepeer/db";
import { testDatabase } from "@livepeer/db/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { postgresOperatorTeamStore } from "./postgres";
import type { OperatorTeamStore, Person } from "./store";
import { INVITATION_HOURS, operatorTeam, signedLinkMessage } from "./team";

const SECRET = "s".repeat(32);
const T0 = Date.parse("2026-11-25T09:00:00Z");
const HOUR = 3_600_000;

const sam: Person = { userId: "usr_sam", name: "Sam Whitfield", email: "sam@example.test" };
const adam: Person = { userId: "usr_adam", name: "Adam Soffer", email: "adam@example.test" };
const ines: Person = { userId: "usr_ines", name: "Ines Okafor", email: "ines@example.test" };

const token = (path: string) => path.replace("/join/operator/", "");
const signedLink = (id: string, expiresMs: number, secret = SECRET) => {
  const seconds = Math.floor(expiresMs / 1000);
  return `${id}.${seconds}.${createHmac("sha256", secret).update(signedLinkMessage(id, seconds)).digest("base64url")}`;
};

describe("the operator team", () => {
  let db: Database;
  let close: () => Promise<void>;
  let store: OperatorTeamStore;
  let clock = T0;
  const team = () => operatorTeam(store, SECRET, () => clock);

  beforeAll(async () => {
    ({ db, close } = await testDatabase());
    store = postgresOperatorTeamStore(db, SECRET);
  });
  beforeEach(async () => {
    clock = T0;
    await db.delete(schema.operators);
    await db.delete(schema.operatorInvitations);
  });
  afterAll(() => close());

  /** Sam, an owner by the first link from setup. */
  const withOwner = async () => {
    expect(await team().accept(signedLink("ops_first", T0 + HOUR), sam)).toMatchObject({ role: "owner", source: "grant" });
  };

  describe("a link from setup", () => {
    it("makes the first owner, once", async () => {
      const link = signedLink("ops_first", T0 + HOUR);
      expect(await team().read(link)).toEqual({ state: "waiting", role: "owner", invitedBy: null, expiresAt: new Date(T0 + HOUR).toISOString() });
      expect(await team().accept(link, sam)).toMatchObject({ userId: "usr_sam", role: "owner" });
      expect(await team().read(link)).toEqual({ state: "used" });
      expect(await team().accept(link, adam)).toBeNull();
      expect(await team().operators()).toEqual([{ user_id: "usr_sam", name: "Sam Whitfield", email: "sam@example.test", role: "owner", via: "setup", added_by: null, since: new Date(T0).toISOString() }]);
    });

    it("is refused once it has run out, or when another secret signed it", async () => {
      const link = signedLink("ops_late", T0 + HOUR);
      clock = T0 + HOUR;
      expect(await team().read(link)).toEqual({ state: "expired" });
      expect(await team().accept(link, sam)).toBeNull();
      clock = T0;
      const forged = signedLink("ops_forged", T0 + HOUR, "x".repeat(32));
      expect(await team().read(forged)).toEqual({ state: "unknown" });
      expect(await team().accept(forged, sam)).toBeNull();
      // A later expiry than the one that was signed is a different message.
      const [id, , signature] = link.split(".");
      expect(await team().accept(`${id}.${Math.floor((T0 + 9 * HOUR) / 1000)}.${signature}`, sam)).toBeNull();
      expect(await team().operators()).toEqual([]);
    });

    it("is used by one of two people who open it at the same moment", async () => {
      const link = signedLink("ops_race", T0 + HOUR);
      const results = await Promise.all([team().accept(link, sam), team().accept(link, adam)]);
      expect(results.filter(Boolean)).toHaveLength(1);
      expect(await team().operators()).toHaveLength(1);
    });
  });

  describe("an invitation", () => {
    beforeEach(withOwner);

    it("is listed while it waits, with who made it, and keeps no token and no address", async () => {
      const made = await team().invite("member", "usr_sam");
      expect(made).toMatchObject({ role: "member", invited_by: "Sam Whitfield", expires_at: new Date(T0 + INVITATION_HOURS * HOUR).toISOString() });
      expect(made.path).toMatch(/^\/join\/operator\/opi_[\w-]{43}$/);
      expect(await team().invitations()).toEqual([{ id: made.id, role: "member", invited_by: "Sam Whitfield", created_at: new Date(T0).toISOString(), expires_at: made.expires_at }]);
      const kept = JSON.stringify(await db.select().from(schema.operatorInvitations));
      expect(kept).not.toContain(token(made.path));
      expect(JSON.stringify(await db.select().from(schema.operators))).not.toMatch(/Sam Whitfield|sam@example\.test/);
    });

    it("puts whoever accepts it on the team with its role, once", async () => {
      const made = await team().invite("viewer", "usr_sam");
      expect(await team().read(token(made.path))).toEqual({ state: "waiting", role: "viewer", invitedBy: "Sam Whitfield", expiresAt: made.expires_at });
      clock = T0 + HOUR;
      expect(await team().accept(token(made.path), adam)).toMatchObject({ userId: "usr_adam", role: "viewer", source: "grant", grantedBy: "usr_sam" });
      expect(await team().read(token(made.path))).toEqual({ state: "used" });
      expect(await team().accept(token(made.path), ines)).toBeNull();
      expect(await team().invitations()).toEqual([]);
      expect((await team().operators())[1]).toEqual({ user_id: "usr_adam", name: "Adam Soffer", email: "adam@example.test", role: "viewer", via: "invitation", added_by: "Sam Whitfield", since: new Date(T0 + HOUR).toISOString() });
    });

    it("can't be used after it runs out or is revoked", async () => {
      const lapsed = await team().invite("member", "usr_sam");
      const revoked = await team().invite("member", "usr_sam");
      expect(await team().revoke(revoked.id)).toBe(true);
      expect(await team().revoke(revoked.id)).toBe(false);
      expect(await team().read(token(revoked.path))).toEqual({ state: "revoked" });
      expect(await team().accept(token(revoked.path), adam)).toBeNull();
      clock = T0 + INVITATION_HOURS * HOUR;
      expect(await team().read(token(lapsed.path))).toEqual({ state: "expired" });
      expect(await team().accept(token(lapsed.path), adam)).toBeNull();
      expect(await team().invitations()).toEqual([]);
      expect(await team().operators()).toHaveLength(1);
    });

    it("is used by one of two people who accept it at the same moment", async () => {
      const made = await team().invite("member", "usr_sam");
      const results = await Promise.all([team().accept(token(made.path), adam), team().accept(token(made.path), ines)]);
      expect(results.filter(Boolean)).toHaveLength(1);
      expect(await team().operators()).toHaveLength(2);
    });

    it("says nothing about a link it doesn't know", async () => {
      expect(await team().read("opi_not-a-real-token")).toEqual({ state: "unknown" });
      expect(await team().read("anything")).toEqual({ state: "unknown" });
      expect(await team().accept("opi_not-a-real-token", adam)).toBeNull();
    });

    it("leaves someone already on the team with the higher of the two roles", async () => {
      await team().add(adam, "member", "usr_sam");
      const lower = await team().invite("viewer", "usr_sam");
      expect(await team().accept(token(lower.path), adam)).toMatchObject({ role: "member" });
      const higher = await team().invite("owner", "usr_sam");
      expect(await team().accept(token(higher.path), adam)).toMatchObject({ role: "owner" });
    });

    it("is dropped ninety days after it was used, revoked or ran out", async () => {
      const used = await team().invite("member", "usr_sam");
      await team().accept(token(used.path), adam);
      await team().invite("member", "usr_sam");
      clock = T0 + 89 * 24 * HOUR;
      await team().sweep();
      expect(await db.select().from(schema.operatorInvitations)).toHaveLength(3);
      clock = T0 + 91 * 24 * HOUR;
      await team().sweep();
      // The one that only ran out did so three days later than the others were used.
      expect(await db.select().from(schema.operatorInvitations)).toHaveLength(1);
      clock = T0 + 94 * 24 * HOUR;
      await team().sweep();
      expect(await db.select().from(schema.operatorInvitations)).toHaveLength(0);
      expect(Object.fromEntries((await team().operators()).map((operator) => [operator.user_id, operator.via]))).toEqual({ usr_sam: "setup", usr_adam: "invitation" });
    });
  });

  describe("roles and removal", () => {
    beforeEach(withOwner);

    it("adds someone who already has an account, and changes their role", async () => {
      expect(await team().add(adam, "viewer", "usr_sam")).toMatchObject({ role: "viewer", grantedBy: "usr_sam", invitationId: null });
      expect((await team().operators()).find((operator) => operator.user_id === "usr_adam")).toMatchObject({ via: "added", added_by: "Sam Whitfield" });
      expect(await team().setRole("usr_adam", "member")).toBe("done");
      expect((await team().granted("usr_adam"))?.role).toBe("member");
      expect(await team().setRole("usr_nobody", "member")).toBe("missing");
    });

    it("never leaves the team without an owner", async () => {
      expect(await team().setRole("usr_sam", "member")).toBe("last_owner");
      expect(await team().remove("usr_sam")).toBe("last_owner");
      await team().add(adam, "owner", "usr_sam");
      expect(await team().setRole("usr_sam", "viewer")).toBe("done");
      expect(await team().remove("usr_adam")).toBe("last_owner");
      expect(await team().remove("usr_sam")).toBe("done");
      expect(await team().remove("usr_sam")).toBe("missing");
      expect((await team().operators()).map((operator) => operator.user_id)).toEqual(["usr_adam"]);
    });

    it("refuses one of two owners who remove each other at the same moment", async () => {
      await team().add(adam, "owner", "usr_sam");
      const results = await Promise.all([team().remove("usr_sam"), team().remove("usr_adam")]);
      expect(results.sort()).toEqual(["done", "last_owner"]);
      expect(await team().operators()).toHaveLength(1);
    });

    it("no longer names an inviter who has left", async () => {
      await team().add(adam, "owner", "usr_sam");
      const made = await team().invite("member", "usr_sam");
      await team().remove("usr_sam");
      expect(await team().invitations()).toMatchObject([{ id: made.id, invited_by: null }]);
      expect(await team().read(token(made.path))).toMatchObject({ state: "waiting", invitedBy: null });
    });
  });

  describe("signing in", () => {
    it("makes nobody an operator who isn't on the team", async () => {
      expect(await team().signIn(adam, false)).toEqual({ role: "user", source: null });
      expect(await team().operators()).toEqual([]);
    });

    it("makes an operator of someone with a grant, and keeps their newest name", async () => {
      await withOwner();
      expect(await team().signIn({ ...sam, name: "Samantha Whitfield" }, false)).toEqual({ role: "operator", source: "grant" });
      expect((await team().operators())[0]).toMatchObject({ name: "Samantha Whitfield", role: "owner" });
    });

    it("lists someone the identity provider calls an operator, as an owner the console can't change, until they sign in without it", async () => {
      expect(await team().signIn(ines, true)).toEqual({ role: "operator", source: "claim" });
      expect(await team().operators()).toEqual([{ user_id: "usr_ines", name: "Ines Okafor", email: "ines@example.test", role: "owner", via: "provider", added_by: null, since: new Date(T0).toISOString() }]);
      expect(await team().granted("usr_ines")).toBeNull();
      expect(await team().setRole("usr_ines", "viewer")).toBe("from_provider");
      expect(await team().remove("usr_ines")).toBe("from_provider");
      expect(await team().signIn(ines, false)).toEqual({ role: "user", source: null });
      expect(await team().operators()).toEqual([]);
    });

    it("counts an owner from the identity provider when deciding whether one would remain", async () => {
      await withOwner();
      await team().signIn(ines, true);
      expect(await team().remove("usr_sam")).toBe("done");
    });

    it("keeps a grant when its person also arrives with the provider's role, and after they stop", async () => {
      await withOwner();
      await team().add(adam, "viewer", "usr_sam");
      expect(await team().signIn(adam, true)).toEqual({ role: "operator", source: "claim" });
      expect(await team().granted("usr_adam")).toMatchObject({ role: "viewer" });
      expect(await team().signIn(adam, false)).toEqual({ role: "operator", source: "grant" });
    });

    it("turns a claim into a grant when its person accepts an invitation", async () => {
      await withOwner();
      await team().signIn(ines, true);
      const made = await team().invite("member", "usr_sam");
      expect(await team().accept(token(made.path), ines)).toMatchObject({ role: "member", source: "grant" });
      expect(await team().signIn(ines, false)).toEqual({ role: "operator", source: "grant" });
    });
  });
});
