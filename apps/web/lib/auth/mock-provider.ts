import "server-only";

import type { AuthProvider, Identity, Role } from "./types";

const PEOPLE: Record<Role, Identity> = {
  user: { userId: "usr_demo_adam", name: "Adam Soffer", email: "adam@example.test", role: "user" },
  operator: { userId: "usr_demo_sam", name: "Sam Whitfield", email: "sam@example.test", role: "operator" },
};

/** Addresses at this domain sign in as someone the instance has never seen, named from the address. */
const NEWCOMER_DOMAIN = "@new.example.test";

function newcomer(email: string): Identity {
  const local = email.slice(0, -NEWCOMER_DOMAIN.length).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "someone";
  const name = local.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
  return { userId: `usr_new_${local}`, name, email, role: "user" };
}

/**
 * Development and mock-only sign-in. There is no outside provider to visit: whichever method is
 * picked, the flow comes straight back signed in as a test user. The test operator signs in with the
 * operator method, or by giving the operator's own address to the email method, which is how the apps'
 * ordinary sign-in reaches an account that runs the instance. An address at `new.example.test` signs in as
 * a person with no account, which is how joining a closed instance is tried.
 */
export const mockProvider: AuthProvider = {
  id: "mock",
  async authorizationUrl({ redirectUri, state, method, email }) {
    const url = new URL(redirectUri);
    const address = email?.trim().toLowerCase() ?? "";
    const asOperator = method === "operator" || address === PEOPLE.operator.email;
    url.searchParams.set("code", asOperator ? "operator" : method === "email" && address.endsWith(NEWCOMER_DOMAIN) ? `new:${address}` : "user");
    url.searchParams.set("state", state);
    return url.toString();
  },
  async exchange({ code }) {
    const identity = code === "operator" ? PEOPLE.operator : code.startsWith("new:") && code.endsWith(NEWCOMER_DOMAIN) ? newcomer(code.slice(4)) : PEOPLE.user;
    // There is no provider session to reuse: every mock sign-in is a new one.
    return { identity: { ...identity }, authenticatedAt: Math.floor(Date.now() / 1000) };
  },
};
