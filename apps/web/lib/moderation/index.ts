import "server-only";

import { chosenStore } from "../data/database";
import { jsonFileStore } from "../data/json-file";
import { documentModerationStore, moderation as build, type Moderation, type ModerationContents } from "./moderation";
import { postgresModerationStore } from "./postgres";

const store = chosenStore({
  postgres: postgresModerationStore,
  file: () => documentModerationStore(jsonFileStore<ModerationContents>("moderation.json", (value) => ({ reports: value.reports ?? [], blocks: value.blocks ?? [], hidden: value.hidden ?? [] }))),
});

/** The instance's reports, blocks and characters taken down. */
export function moderation(): Moderation {
  return build(store());
}
