import { randomUUID } from "node:crypto";

import type { Character, CharacterBlock, CharacterReport, ReportReason } from "@livepeer/api-client";

import { memoryStore, type StateStore } from "../data/store";

export interface StoredReport extends CharacterReport {
  /** Who reported it, so one person can't flood the queue. Never sent to anyone. */
  reporter: string;
}

export interface StoredBlock extends CharacterBlock {
  userId: string;
}

export interface ModerationContents {
  reports: StoredReport[];
  blocks: StoredBlock[];
  /** Characters the operator took off the instance, by slug. */
  hidden: string[];
}

/** Where reports, blocks and takedowns are kept. One method per thing moderation needs of it. */
export interface ModerationStore {
  /**
   * Files a report and answers with it as kept. One person has at most one open report of a character: a
   * second one changes the first one's reason and note, and that first report is the answer.
   */
  fileReport(report: StoredReport): Promise<StoredReport>;
  reports(): Promise<StoredReport[]>;
  /**
   * Records the operator's decision. Hiding takes the character down and closes its other open reports with
   * it, all as one step. Null when there is no such report.
   */
  resolve(id: string, outcome: "dismissed" | "hidden"): Promise<StoredReport | null>;
  /** Blocking twice is the same as blocking once. */
  block(block: StoredBlock): Promise<void>;
  blocksOf(userId: string): Promise<StoredBlock[]>;
  /** The slugs of the characters taken down. */
  hidden(): Promise<string[]>;
  /** Removes a person's blocks and takes their id off their reports. */
  forget(userId: string): Promise<void>;
}

/** Moderation kept as one document: a JSON file, or memory in tests. */
export function documentModerationStore(document: StateStore<ModerationContents>): ModerationStore {
  return {
    async fileReport(report) {
      return document.update((contents) => {
        const open = contents.reports.find((entry) => entry.reporter === report.reporter && entry.character_slug === report.character_slug && entry.state === "open");
        if (!open) {
          contents.reports.push(report);
          return report;
        }
        open.reason = report.reason;
        open.note = report.note;
        return open;
      });
    },
    async reports() {
      return document.read().reports;
    },
    async resolve(id, outcome) {
      return document.update((contents) => {
        const report = contents.reports.find((entry) => entry.id === id);
        if (!report) return null;
        report.state = outcome;
        if (outcome === "hidden") {
          if (!contents.hidden.includes(report.character_slug)) contents.hidden.push(report.character_slug);
          for (const other of contents.reports) if (other.character_slug === report.character_slug && other.state === "open") other.state = "hidden";
        }
        return report;
      });
    },
    async block(block) {
      document.update((contents) => {
        if (!contents.blocks.some((entry) => entry.userId === block.userId && entry.character_slug === block.character_slug)) contents.blocks.push(block);
      });
    },
    async blocksOf(userId) {
      return document.read().blocks.filter((entry) => entry.userId === userId);
    },
    async hidden() {
      return document.read().hidden;
    },
    async forget(userId) {
      document.update((contents) => {
        contents.blocks = contents.blocks.filter((entry) => entry.userId !== userId);
        for (const report of contents.reports) if (report.reporter === userId) report.reporter = "deleted";
      });
    },
  };
}

/** An empty store in memory, for tests. */
export const memoryModerationStore = (): ModerationStore => documentModerationStore(memoryStore<ModerationContents>({ reports: [], blocks: [], hidden: [] }));

/** Reports, blocks and characters taken down: what the stores require of an app with characters people share. */
export interface Moderation {
  /** Files a report. A second report of the same character by the same person updates the first while it's open. */
  report(userId: string, character: Character, reason: ReportReason, note: string | null): Promise<CharacterReport>;
  /** Hides a character, and everything else by its author, from this person. */
  block(userId: string, character: Character): Promise<CharacterBlock>;
  /** What this person, or a guest with null, may see: nothing taken down, nothing they blocked. */
  visible(userId: string | null): Promise<(character: Character) => boolean>;
  /** Every report, open ones first, newest first. */
  reports(): Promise<CharacterReport[]>;
  /** The operator's decision on a report. Hiding takes the character down and closes its other open reports. */
  resolve(id: string, outcome: "dismissed" | "hidden"): Promise<CharacterReport | null>;
  /** Forgets a deleted account: its blocks go, and its reports stay without saying who sent them. */
  forget(userId: string): Promise<void>;
}

const publicReport = ({ reporter: _reporter, ...report }: StoredReport): CharacterReport => report;

export function moderation(store: ModerationStore, now: () => Date = () => new Date()): Moderation {
  return {
    async report(userId, character, reason, note) {
      return publicReport(await store.fileReport({ id: `rep_${randomUUID()}`, character_slug: character.slug, character_name: character.name, author: character.author, reason, note, created_at: now().toISOString(), state: "open", reporter: userId }));
    },
    async block(userId, character) {
      const block = { character_slug: character.slug, author: character.author };
      await store.block({ ...block, userId });
      return block;
    },
    async visible(userId) {
      const [mine, hidden] = await Promise.all([userId === null ? [] : store.blocksOf(userId), store.hidden()]);
      const taken = new Set(hidden);
      const slugs = new Set(mine.map((entry) => entry.character_slug));
      const authors = new Set(mine.map((entry) => entry.author));
      return (character) => !taken.has(character.slug) && (character.mine || (!slugs.has(character.slug) && !authors.has(character.author)));
    },
    async reports() {
      return (await store.reports()).map(publicReport).sort((a, b) => Number(b.state === "open") - Number(a.state === "open") || b.created_at.localeCompare(a.created_at));
    },
    forget: (userId) => store.forget(userId),
    async resolve(id, outcome) {
      const report = await store.resolve(id, outcome);
      return report && publicReport(report);
    },
  };
}
