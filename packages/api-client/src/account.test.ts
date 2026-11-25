import { afterEach, describe, expect, it, vi } from "vitest";

import { createApiClient, createMockProvider } from "./index";

afterEach(() => vi.unstubAllGlobals());

const client = () => createApiClient({ env: { MOCK_ONLY: "1" }, provider: createMockProvider(), user: { id: "usr_demo_adam", name: "Adam Soffer" } });

describe("credits and plans", () => {
  it("the balance is the allocation balance", async () => {
    const { data } = await client().getCreditBalance();
    expect(data.credits).toBe(2480);
    expect(data.allowance.available).toBe("24.80");
  });

  it("buying a pack tops up the allocation by exactly the pack", async () => {
    const api = client();
    const { data } = await api.buyCreditPack("pck_usd25");
    expect(data.credits).toBe(2480 + 2500);
    await expect(api.buyCreditPack("pck_nope")).rejects.toThrow();
  });

  it("a pack no longer offered isn't shown or sold", async () => {
    const provider = createMockProvider();
    const api = createApiClient({ env: { MOCK_ONLY: "1" }, provider, user: { id: "usr_demo_adam", name: "Adam Soffer" } });
    await provider.plans.updateCreditPack("pck_usd50", { active: false });
    expect((await api.getAccount()).data.packs.map((pack) => pack.id)).not.toContain("pck_usd50");
    await expect(api.buyCreditPack("pck_usd50")).rejects.toThrow();
  });

  it("tops up an amount the user chooses, within the operator's limits", async () => {
    const provider = createMockProvider();
    const api = createApiClient({ env: { MOCK_ONLY: "1" }, provider, user: { id: "usr_demo_adam", name: "Adam Soffer" } });
    expect((await api.getAccount()).data.top_up).toMatchObject({ min: { amount: "5.00" }, max: { amount: "500.00" }, credits_per_usd: 100 });
    expect((await api.buyCredits({ amount: "37.00", currency: "USD" })).data.credits).toBe(2480 + 3700);
    await expect(api.buyCredits({ amount: "2.00", currency: "USD" })).rejects.toThrow();
    await expect(api.buyCredits({ amount: "900.00", currency: "USD" })).rejects.toThrow();
    await provider.plans.updateTopUpRange({ enabled: false });
    expect((await api.getAccount()).data.top_up).toBeNull();
    await expect(api.buyCredits({ amount: "37.00", currency: "USD" })).rejects.toThrow();
  });

  it("changes and cancels a plan", async () => {
    const api = client();
    expect((await api.getAccount()).data.plan).toBeNull();
    expect((await api.changePlan("pln_studio")).data?.name).toBe("Studio");
    expect((await api.getAccount()).data.plan?.id).toBe("pln_studio");
    expect((await api.changePlan(null)).data).toBeNull();
  });

  it("a user without an allocation has no credits", async () => {
    const api = createApiClient({ env: { MOCK_ONLY: "1" }, provider: createMockProvider(), user: { id: "usr_new", name: "New" } });
    expect((await api.getCreditBalance()).data.credits).toBe(0);
  });
});

describe("library", () => {
  it("searches by what is in the media, not only its title", async () => {
    const { data } = await client().listMedia({ query: "neon" });
    expect(data.map((item) => item.title)).toEqual(["Night run, tracking shot"]);
  });

  it("filters by kind and deletes", async () => {
    const api = client();
    const audio = (await api.listMedia({ kind: "audio" })).data;
    expect(audio.every((item) => item.kind === "audio")).toBe(true);
    expect((await api.deleteMedia(audio[0]!.id)).data).toBe(true);
    expect((await api.listMedia({ kind: "audio" })).data).toHaveLength(audio.length - 1);
  });
});

describe("characters", () => {
  it("hides mature characters unless asked", async () => {
    const api = client();
    const safe = (await api.listCharacters({ scope: "public" })).data;
    const all = (await api.listCharacters({ scope: "public", includeMature: true })).data;
    expect(safe.some((entry) => entry.mature)).toBe(false);
    expect(all.length).toBeGreaterThan(safe.length);
  });

  it("creates a private character owned by the user", async () => {
    const api = client();
    const created = (await api.createCharacter({ name: "Test Pilot", tagline: "Flies", description: "A pilot.", greeting: "Ready?", visibility: "private", mature: false })).data;
    expect(created).toMatchObject({ slug: "test-pilot", mine: true, author: "Adam Soffer" });
    expect((await api.listCharacters({ scope: "mine" })).data.map((entry) => entry.slug)).toContain("test-pilot");
    expect((await api.listCharacters({ scope: "public" })).data.map((entry) => entry.slug)).not.toContain("test-pilot");
  });
});

describe("keys and preferences", () => {
  it("shows a new key's secret once and only a prefix afterwards", async () => {
    const api = client();
    const created = (await api.createApiKey("CI")).data;
    expect(created.secret.startsWith("lpk_")).toBe(true);
    const listed = (await api.listApiKeys()).data.find((key) => key.id === created.id);
    expect(listed).toBeDefined();
    expect(listed).not.toHaveProperty("secret");
    expect((await api.verifyApiKey(created.secret)).data?.id).toBe(created.id);
    expect((await api.verifyApiKey("lpk_not_a_key")).data).toBeNull();
    expect((await api.revokeApiKey(created.id)).data?.status).toBe("revoked");
    expect((await api.verifyApiKey(created.secret)).data).toBeNull();
  });

  it("adult content is off by default and needs a confirmed age", async () => {
    const api = client();
    expect((await api.getPreferences()).data).toMatchObject({ ageConfirmed: false, adultContent: false });
    expect((await api.updatePreferences({ adultContent: true })).data.adultContent).toBe(false);
    expect((await api.updatePreferences({ ageConfirmed: true, adultContent: true })).data.adultContent).toBe(true);
    expect((await api.updatePreferences({ ageConfirmed: false })).data.adultContent).toBe(false);
  });
});

describe("live credit balance", () => {
  it("reads the builder key's own allowance and converts it to credits", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({
        allocation_id: "alloc_1",
        status: "active",
        granted: { amount: "100", currency: "USD" },
        spent: { amount: "0.50", currency: "USD" },
        available: { amount: "99.50", currency: "USD" },
      }), { status: 200 })),
    );
    const api = createApiClient({
      engine: { url: "http://engine.test", token: "lpk_builder" },
      pricing: { creditsPerUsd: 100, default: 1.3 },
      user: { id: "someone-else", name: "John Mull" },
    });
    const result = await api.getCreditBalance();
    expect(result.source).toBe("live");
    expect(result.data.credits).toBe(9950);
    expect(result.data.allowance.available).toBe("99.50");
    const call = vi.mocked(fetch).mock.calls[0] as unknown as [URL | string, RequestInit];
    expect(String(call[0])).toBe("http://engine.test/v1/allowance");
    expect(call[1].headers).toMatchObject({ Authorization: "Bearer lpk_builder" });
  });
});
