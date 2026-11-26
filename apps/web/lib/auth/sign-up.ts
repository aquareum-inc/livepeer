import "server-only";

import { instance } from "../instance";
import { paymentProvider } from "../operator/client";
import { operators } from "../operators";
import type { Standing } from "../operators/team";
import type { Identity } from "./types";

/**
 * Whether a finished sign-in may have a session. An instance that takes new accounts admits anyone. One that
 * is closed or invitation only admits its operators, people the payment provider has seen before, and
 * someone arriving with an invitation to the team that can still be used. Invitation only admits nobody
 * else yet: a workspace's invitation will, once the provider holds them.
 */
export async function admitted(identity: Identity, standing: Standing, invitation: string | null): Promise<boolean> {
  const mode = (await instance()).auth?.signUp ?? "open";
  if (mode === "open" || standing.role === "operator") return true;
  if (invitation && (await operators().read(invitation)).state === "waiting") return true;
  return (await paymentProvider(true)).identity.isKnown(identity.userId);
}
