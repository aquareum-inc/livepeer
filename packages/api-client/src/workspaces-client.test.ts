import { describe, expect, it } from "vitest";

import { NotAllowed, createApiClient, createMockProvider, type PaymentProvider } from "./index";

const NORTHLIGHT = "wsp_northlight";
const PEOPLE = {
  ines: { id: "usr_demo_ines", name: "Inés Castellanos" },
  adam: { id: "usr_demo_adam", name: "Adam Soffer" },
  priya: { id: "usr_demo_priya", name: "Priya Raman" },
  sam: { id: "usr_demo_sam", name: "Sam Whitfield" },
};
const as = (provider: PaymentProvider, who: keyof typeof PEOPLE, workspaceId: string | null = NORTHLIGHT) =>
  createApiClient({ env: { MOCK_ONLY: "1" }, provider, user: PEOPLE[who], workspaceId });

describe("accounts", () => {
  it("lists the personal account first, then workspaces, with the invitations waiting", async () => {
    const { data } = await as(createMockProvider(), "adam", null).listAccounts();
    expect(data.current).toBe("usr_demo_adam");
    expect(data.accounts.map((entry) => [entry.kind, entry.name, entry.role])).toEqual([
      ["personal", "Adam Soffer", "owner"],
      ["workspace", "Northlight Studio", "admin"],
    ]);
    expect(data.accounts[1]?.credits).toBe(36660);
    expect(data.invitations.map((entry) => entry.workspace_name)).toEqual(["Harbour Films"]);
  });

  it("the current account decides whose credit, plan and usage are read", async () => {
    const provider = createMockProvider();
    expect((await as(provider, "adam", null).getCreditBalance()).data.credits).toBe(2480);
    expect((await as(provider, "adam").getCreditBalance()).data.credits).toBe(36660);
    expect((await as(provider, "adam", null).getAccount()).data.plan).toBeNull();
    expect((await as(provider, "adam").getAccount()).data.plan?.name).toBe("Studio");
  });

  it("falls back to the personal account for a workspace the person isn't in", async () => {
    const api = as(createMockProvider(), "sam");
    expect((await api.listAccounts()).data.current).toBe("usr_demo_sam");
    await expect(api.getWorkspace()).rejects.toBeInstanceOf(NotAllowed);
  });
});

describe("the main flow: create, invite, join, see members", () => {
  it("a person creates a workspace, invites someone, and they join with the role they were given", async () => {
    const provider = createMockProvider();
    const workspace = (await as(provider, "adam", null).createWorkspace("Tide Pool")).data;
    const owner = as(provider, "adam", workspace.id);
    expect((await owner.getWorkspace()).data).toMatchObject({ role: "owner", members: [{ user_id: "usr_demo_adam", role: "owner" }] });
    expect((await owner.getCreditBalance()).data.credits).toBe(0);

    const invitation = (await owner.inviteMember({ email: "sam@example.test", role: "member" })).data;
    expect((await owner.getWorkspace()).data?.invitations.map((entry) => entry.email)).toEqual(["sam@example.test"]);

    const invitee = as(provider, "sam", null);
    expect((await invitee.getInvitation(invitation.token)).data).toMatchObject({ workspace_name: "Tide Pool", invited_by_name: "Adam Soffer" });
    expect((await invitee.acceptInvitation(invitation.token)).data.id).toBe(workspace.id);
    expect((await invitee.listAccounts()).data.accounts.map((entry) => entry.id)).toContain(workspace.id);

    const detail = (await owner.getWorkspace()).data;
    expect(detail?.members.map((member) => [member.name, member.role])).toEqual([["Adam Soffer", "owner"], ["Sam Whitfield", "member"]]);
    expect(detail?.invitations).toEqual([]);
  });
});

describe("what each role may do", () => {
  it("only the owner changes the plan or buys credit", async () => {
    const provider = createMockProvider();
    await expect(as(provider, "adam").buyCreditPack("pck_usd25")).rejects.toBeInstanceOf(NotAllowed);
    await expect(as(provider, "priya").changePlan("pln_creator")).rejects.toBeInstanceOf(NotAllowed);
    expect((await as(provider, "ines").buyCreditPack("pck_usd25")).data.credits).toBe(36660 + 2500);
    // The workspace was charged, not the owner's own account.
    expect((await as(provider, "ines", null).getCreditBalance()).data.credits).toBe(10810);
  });

  it("admins manage people and keys; members do neither", async () => {
    const provider = createMockProvider();
    const admin = as(provider, "adam");
    const member = as(provider, "priya");
    await expect(member.inviteMember({ email: "new@example.test", role: "member" })).rejects.toBeInstanceOf(NotAllowed);
    await expect(member.removeMember("usr_demo_tomas")).rejects.toBeInstanceOf(NotAllowed);
    await expect(member.listApiKeys()).rejects.toBeInstanceOf(NotAllowed);
    await expect(member.renameWorkspace("Mine now")).rejects.toBeInstanceOf(NotAllowed);
    expect((await member.getWorkspace()).data?.invitations).toEqual([]);

    expect((await admin.setMemberRole("usr_demo_priya", "admin")).data.role).toBe("admin");
    expect((await admin.removeMember("usr_demo_tomas")).data).toBe(true);
    expect((await admin.renameWorkspace("Northlight")).data.name).toBe("Northlight");
    expect(Array.isArray((await admin.listApiKeys()).data)).toBe(true);
  });

  it("nobody but the owner touches the owner, and only the owner transfers", async () => {
    const provider = createMockProvider();
    const admin = as(provider, "adam");
    await expect(admin.removeMember("usr_demo_ines")).rejects.toBeInstanceOf(NotAllowed);
    await expect(admin.setMemberRole("usr_demo_ines", "member")).rejects.toBeInstanceOf(NotAllowed);
    await expect(admin.transferOwnership("usr_demo_adam")).rejects.toBeInstanceOf(NotAllowed);
    await expect(as(provider, "ines").leaveWorkspace()).rejects.toBeInstanceOf(NotAllowed);

    expect((await as(provider, "ines").transferOwnership("usr_demo_adam")).data.owner_id).toBe("usr_demo_adam");
    expect((await as(provider, "ines").getWorkspace()).data?.role).toBe("admin");
    expect((await as(provider, "ines").leaveWorkspace()).data).toBe(true);
    expect((await as(provider, "ines").listAccounts()).data.accounts.map((entry) => entry.id)).toEqual(["usr_demo_ines"]);
  });

  it("an admin can only cancel invitations to their own workspace", async () => {
    const provider = createMockProvider();
    expect((await as(provider, "adam").revokeInvitation("inv_adam")).data).toBe(false);
    expect((await as(provider, "adam").revokeInvitation("inv_lena")).data).toBe(true);
    expect((await as(provider, "adam").getWorkspace()).data?.invitations).toEqual([]);
  });
});

describe("usage in a workspace", () => {
  it("owners and admins see everyone's; a member sees only their own", async () => {
    const provider = createMockProvider();
    const all = (await as(provider, "adam").getUsage()).data;
    const own = (await as(provider, "priya").getUsage()).data;
    expect(all.entries.some((entry) => entry.member_id !== "usr_demo_adam")).toBe(true);
    expect(own.entries.every((entry) => entry.member_id === "usr_demo_priya")).toBe(true);
    expect(own.summary.credits).toBeLessThan(all.summary.credits);

    const members = (await as(provider, "priya").getWorkspace()).data?.members ?? [];
    expect(members.find((member) => member.user_id === "usr_demo_priya")?.credits).toBe(own.summary.credits);
    expect(members.filter((member) => member.user_id !== "usr_demo_priya").every((member) => member.credits === null)).toBe(true);
    await expect(as(provider, "priya").getMemberUsage()).rejects.toBeInstanceOf(NotAllowed);
  });

  it("breaks it down by member and key, and the rows add up to the total", async () => {
    const provider = createMockProvider();
    const rows = (await as(provider, "ines").getMemberUsage()).data;
    const total = (await as(provider, "ines").getUsage()).data.summary;
    expect(rows.reduce((sum, row) => sum + row.credits, 0)).toBe(total.credits);
    expect(rows.find((row) => row.kind === "key")).toMatchObject({ id: "key_northlight_render", role: null });
    expect(rows.find((row) => row.id === "usr_demo_ines")).toMatchObject({ kind: "member", role: "owner", name: "Inés Castellanos" });
  });

  it("someone removed keeps their line, as a former member", async () => {
    const provider = createMockProvider();
    await as(provider, "ines").removeMember("usr_demo_priya");
    expect((await as(provider, "ines").getMemberUsage()).data.find((row) => row.id === "usr_demo_priya")).toMatchObject({ kind: "former_member", name: "Priya Raman" });
  });
});

describe("a suspended workspace", () => {
  it("can't be spent from, while its members' own accounts still work", async () => {
    const provider = createMockProvider();
    await provider.workspaces.setStatus(NORTHLIGHT, "paused");
    const request = { app: "text-to-image", prompt: "A lighthouse at dusk" } as Parameters<ReturnType<typeof createApiClient>["createGeneration"]>[0];
    await expect(as(provider, "adam").createGeneration(request)).rejects.toThrow("suspended");
    expect((await as(provider, "adam", null).createGeneration(request)).data.id).toBeTruthy();
  });
});
