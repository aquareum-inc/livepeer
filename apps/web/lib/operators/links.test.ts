import { describe, expect, it } from "vitest";

import { invitationIn, joinPath } from "./links";

describe("an invitation's link", () => {
  it("is found in the path a sign-in returns to, and nowhere else", () => {
    expect(invitationIn(joinPath("opi_abc-DEF_123"))).toBe("opi_abc-DEF_123");
    expect(invitationIn("/join/operator/ops_first.1795000000.sig?from=email")).toBe("ops_first.1795000000.sig");
    expect(invitationIn("/join/operator/")).toBeNull();
    expect(invitationIn("/join/operator/a/b")).toBeNull();
    expect(invitationIn("/join/wsp_token")).toBeNull();
    expect(invitationIn("/operator")).toBeNull();
  });
});
