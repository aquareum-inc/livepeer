import "server-only";

import { jsonFileStore } from "../data/json-file";
import { documentModerationStore, moderation as build, type Moderation, type ModerationContents } from "./moderation";

let instance: Moderation | null = null;

/** The instance's reports, blocks and characters taken down. */
export function moderation(): Moderation {
  instance ??= build(documentModerationStore(jsonFileStore<ModerationContents>("moderation.json", (value) => ({ reports: value.reports ?? [], blocks: value.blocks ?? [], hidden: value.hidden ?? [] }))));
  return instance;
}
