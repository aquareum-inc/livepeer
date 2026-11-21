import "server-only";

import type { AuthProvider, Identity, Role } from "./types";

const PEOPLE: Record<Role, Identity> = {
  user: { userId: "usr_demo_adam", name: "Adam Soffer", email: "adam@example.test", role: "user" },
  operator: { userId: "usr_demo_sam", name: "Sam Whitfield", email: "sam@example.test", role: "operator" },
};

/**
 * Development and mock-only sign-in. There is no outside provider to visit: whichever method is
 * picked, the flow comes straight back signed in as a test user. The test operator signs in with the
 * operator method, or by giving the operator's own address to the email method, which is how the apps'
 * ordinary sign-in reaches an account that runs the instance.
 */
export const mockProvider: AuthProvider = {
  id: "mock",
  async authorizationUrl({ redirectUri, state, method, email }) {
    const url = new URL(redirectUri);
    const asOperator = method === "operator" || email?.trim().toLowerCase() === PEOPLE.operator.email;
    url.searchParams.set("code", asOperator ? "operator" : "user");
    url.searchParams.set("state", state);
    return url.toString();
  },
  async exchange({ code }) {
    const identity = code === "operator" ? PEOPLE.operator : PEOPLE.user;
    // There is no provider session to reuse: every mock sign-in is a new one.
    return { identity: { ...identity }, authenticatedAt: Math.floor(Date.now() / 1000) };
  },
};
