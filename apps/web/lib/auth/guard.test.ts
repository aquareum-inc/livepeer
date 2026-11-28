import { describe, expect, it } from "vitest";

import { checkAccess, requiredRole } from "./guard";

const future = Math.floor(Date.now() / 1000) + 3600;
const user = { role: "user" as const, expiresAt: future };
const operator = { role: "operator" as const, expiresAt: future };

describe("role guard", () => {
  it("leaves sign-in, the auth flow and the health check public", () => {
    for (const path of ["/", "/sign-in", "/auth/start", "/auth/callback", "/api/health"]) {
      expect(requiredRole(path)).toBeNull();
      expect(checkAccess(path, null)).toBe("allow");
    }
  });

  it("lets anyone read an invitation to the team, and nothing else under it", () => {
    expect(checkAccess("/join/operator/opi_abc", null)).toBe("allow");
    expect(checkAccess("/join/operator/opi_abc", user)).toBe("allow");
    // A workspace's invitation still asks for a sign-in, and a deeper path is no invitation.
    expect(checkAccess("/join/abc", null)).toBe("sign-in");
    // Claiming an instance nobody runs yet asks for a sign-in, and nothing more.
    expect(checkAccess("/setup", null)).toBe("sign-in");
    expect(checkAccess("/setup", user)).toBe("allow");
    expect(checkAccess("/join/operator/opi_abc/more", null)).toBe("sign-in");
  });

  it("lets guests look around the product", () => {
    for (const path of ["/studio", "/studio/video", "/studio/live", "/characters", "/characters/mira", "/library", "/developers", "/developers/models", "/developers/models/livepeer/text-to-video", "/developers/examples", "/developers/playground"]) {
      expect(checkAccess(path, null)).toBe("allow");
    }
  });

  it("sends signed-out visitors to sign in for account pages", () => {
    for (const path of ["/chat/cnv_1", "/settings", "/settings/plan", "/developers/keys", "/characters/new", "/characters/mira/edit", "/characters/mira/call", "/operator"]) {
      expect(checkAccess(path, null)).toBe("sign-in");
    }
  });

  it("lets users into the app and keeps them out of the console", () => {
    expect(checkAccess("/library", user)).toBe("allow");
    expect(checkAccess("/operator", user)).toBe("forbidden");
    expect(checkAccess("/operator/users/abc", user)).toBe("forbidden");
  });

  it("lets operators into both", () => {
    expect(checkAccess("/operator/grants", operator)).toBe("allow");
    expect(checkAccess("/", operator)).toBe("allow");
  });

  it("does not treat a lookalike path as the console", () => {
    expect(requiredRole("/operators-guide")).toBe("user");
  });

  it("treats an expired session as signed out", () => {
    expect(checkAccess("/settings", { role: "operator", expiresAt: 1 })).toBe("sign-in");
  });
});
