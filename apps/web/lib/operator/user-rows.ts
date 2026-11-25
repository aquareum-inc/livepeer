import type { Allocation, KnownActor, Plan, ProviderUser } from "@livepeer/api-client";
import type { UserRow } from "@livepeer/operator-console";

/** The engine's default tenant, where accounts live unless the instance names another. */
const DEFAULT_TENANT = "default";

export interface UserSources {
  /** Whether the provider can list its people. Without it, the engine's accounts stand in for them. */
  listsUsers: boolean;
  /** The provider's people. */
  users: ReadonlyArray<ProviderUser>;
  /** The engine's builder accounts. */
  actors: ReadonlyArray<KnownActor>;
  allocationFor: (id: string) => Allocation | null;
  planFor: (id: string) => Plan | null;
}

function row(id: string, user: ProviderUser | null, actor: KnownActor | null, sources: UserSources): UserRow {
  const allocation = sources.allocationFor(id);
  return {
    id,
    tenantId: actor?.tenant_id ?? DEFAULT_TENANT,
    name: user?.name ?? (actor ? actor.label || actor.name || actor.actor_id : id),
    email: user?.email ?? null,
    role: user?.role ?? "user",
    status: allocation?.status ?? actor?.allocation?.status ?? (actor ? (actor.allotted ? "active" : "not allotted") : (user?.status ?? "active")),
    plan: sources.planFor(id)?.name ?? null,
    budget: allocation ? Number(allocation.granted.amount) : null,
    spent: allocation ? Number(allocation.spent.amount) : null,
    remaining: allocation ? Number(allocation.available.amount) : null,
    lastSeen: actor?.last_seen_at ?? null,
  };
}

export interface JoinedUsers {
  /** The people on this instance, each joined to its engine account. */
  people: UserRow[];
  /** Engine accounts no one who signs in owns: made on the engine directly, for a service, a test or another app. */
  unlinked: UserRow[];
}

/**
 * The people on this instance, joined to their engine accounts by id, kept apart from engine accounts
 * no one owns. With a provider that can't list people, the engine's accounts are the people.
 */
export function joinUserRows(sources: UserSources): JoinedUsers {
  if (!sources.listsUsers) return { people: sources.actors.map((actor) => row(actor.actor_id, null, actor, sources)), unlinked: [] };
  const actors = new Map(sources.actors.map((actor) => [actor.actor_id, actor]));
  const owned = new Set(sources.users.map((user) => user.id));
  return {
    people: sources.users.map((user) => row(user.id, user, actors.get(user.id) ?? null, sources)),
    unlinked: sources.actors.filter((actor) => !owned.has(actor.actor_id)).map((actor) => row(actor.actor_id, null, actor, sources)),
  };
}
