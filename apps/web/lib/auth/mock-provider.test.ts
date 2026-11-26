import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { mockProvider } from "./mock-provider";

async function signIn(input: { method: "email" | "google" | "operator"; email?: string }) {
  const target = new URL(await mockProvider.authorizationUrl({ redirectUri: "http://localhost:3100/auth/callback", state: "state", codeVerifier: "verifier", ...input }));
  expect(target.searchParams.get("state")).toBe("state");
  return (await mockProvider.exchange({ code: target.searchParams.get("code") ?? "", redirectUri: "http://localhost:3100/auth/callback", codeVerifier: "verifier" })).identity;
}

describe("the development provider", () => {
  it("signs anyone in as the test user", async () => {
    expect(await signIn({ method: "google" })).toMatchObject({ userId: "usr_demo_adam", role: "user" });
    expect(await signIn({ method: "email", email: "adam@example.test" })).toMatchObject({ role: "user" });
    expect(await signIn({ method: "email", email: "someone@example.test" })).toMatchObject({ role: "user" });
  });

  it("signs an address at new.example.test in as someone with no account", async () => {
    expect(await signIn({ method: "email", email: " Ola.Nilsen@new.example.test" })).toEqual({ userId: "usr_new_ola-nilsen", name: "Ola Nilsen", email: "ola.nilsen@new.example.test", role: "user" });
    // Only the email method reaches them: no other method carries an address.
    expect(await signIn({ method: "google", email: "ola@new.example.test" })).toMatchObject({ userId: "usr_demo_adam" });
  });

  it("signs the test operator in by the operator method or the operator's own address", async () => {
    expect(await signIn({ method: "operator" })).toMatchObject({ userId: "usr_demo_sam", role: "operator" });
    expect(await signIn({ method: "email", email: "sam@example.test" })).toMatchObject({ userId: "usr_demo_sam", role: "operator" });
    expect(await signIn({ method: "email", email: " Sam@Example.test " })).toMatchObject({ role: "operator" });
  });
});
