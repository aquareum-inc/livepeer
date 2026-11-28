import "server-only";

import { env } from "../env";
import { instance } from "../instance";
import { operators } from "./index";

/**
 * Whether whoever signs in may make themselves this instance's owner, with nothing else asked of them. It is
 * how the person who has just deployed an instance gets into its console, and it is offered only while
 * taking it would gain a stranger nothing:
 *
 * - the team has no owner, so it closes for good the moment someone claims it;
 * - the instance holds no engine admin token, so its console can't create keys or add credits yet;
 * - sign-in is a real identity provider's. The development sign-in has an operator of its own.
 *
 * An instance deployed with its engine keys already set is claimed with a link from `livepeer
 * invite-operator` instead, which only someone holding its SESSION_SECRET can make.
 */
export async function firstOwnerOpen(): Promise<boolean> {
  const config = await instance();
  if (!config.surfaces.console || config.auth?.provider !== "oidc") return false;
  if (env("ENGINE_ADMIN_TOKEN")) return false;
  return !(await operators().hasOwner());
}
