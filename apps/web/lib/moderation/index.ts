import "server-only";

import { storeOver } from "../data/database";
import { moderation as build, type Moderation } from "./moderation";
import { postgresModerationStore } from "./postgres";

const store = storeOver(postgresModerationStore);

/** The instance's reports, blocks and characters taken down. */
export function moderation(): Moderation {
  return build(store());
}
