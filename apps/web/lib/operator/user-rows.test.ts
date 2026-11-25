import type { Allocation, KnownActor, ProviderUser } from "@livepeer/api-client";
import { describe, expect, it } from "vitest";

import { joinUserRows } from "./user-rows";

const person = (id: string, name: string, email: string): ProviderUser => ({ id, name, email, role: "user", status: "active", created_at: "2026-11-01T00:00:00Z" });
const account = (id: string, label: string, lastSeen: string | null = null): KnownActor => ({
  tenant_id: "default",
  actor_id: id,
  label,
  name: null,
  allocation: null,
  first_seen_at: null,
  last_seen_at: lastSeen,
  allotted: true,
});
const usd = (amount: number) => ({ amount: amount.toFixed(2), currency: "USD" });
const allocation: Allocation = { id: "alc_ines", grant_id: "grt", user_id: "usr_ines", status: "active", granted: usd(50), spent: usd(20), available: usd(30) };

describe("joinUserRows", () => {
  it("lists the provider's people with their email, joined to their engine account", () => {
    const { people } = joinUserRows({
      listsUsers: true,
      users: [person("usr_ines", "Inés Castellanos", "ines@example.test")],
      actors: [account("usr_ines", "ines", "2026-11-18T09:00:00Z")],
      allocationFor: (id) => (id === "usr_ines" ? allocation : null),
      planFor: () => null,
    });
    expect(people).toEqual([
      expect.objectContaining({ id: "usr_ines", name: "Inés Castellanos", email: "ines@example.test", lastSeen: "2026-11-18T09:00:00Z", budget: 50, remaining: 30 }),
    ]);
  });

  it("keeps engine accounts no one owns apart from the people", () => {
    const { people, unlinked } = joinUserRows({
      listsUsers: true,
      users: [person("usr_ines", "Inés Castellanos", "ines@example.test")],
      actors: [account("acme", "Acme Studio")],
      allocationFor: () => null,
      planFor: () => null,
    });
    expect(people.map((row) => row.name)).toEqual(["Inés Castellanos"]);
    expect(unlinked.map((row) => [row.id, row.name, row.email])).toEqual([["acme", "Acme Studio", null]]);
  });

  it("falls back to the engine's accounts when the provider can't list people", () => {
    const { people, unlinked } = joinUserRows({ listsUsers: false, users: [], actors: [account("acme", "Acme Studio")], allocationFor: () => null, planFor: () => null });
    expect(people).toEqual([expect.objectContaining({ id: "acme", name: "Acme Studio", email: null, status: "active" })]);
    expect(unlinked).toEqual([]);
  });

  it("lists no engine accounts as people when the provider has no one yet", () => {
    const { people, unlinked } = joinUserRows({ listsUsers: true, users: [], actors: [account("acme", "Acme Studio")], allocationFor: () => null, planFor: () => null });
    expect(people).toEqual([]);
    expect(unlinked.map((row) => row.id)).toEqual(["acme"]);
  });
});
