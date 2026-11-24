import { schema } from "@livepeer/db";
import { testDatabase } from "@livepeer/db/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { memoryStore } from "../data/store";
import { postgresOutboxStore } from "../push/postgres";
import { documentOutboxStore, type OutboxContents, type OutboxStore, type RecordedPush } from "../push/recording";
import { quietState } from "./decide";
import { postgresAlertsStore } from "./postgres";
import { memoryAlertsStore, type AlertsStore } from "./service";

const T0 = Date.parse("2026-11-21T09:00:00Z");
const push = (body: string): RecordedPush => ({ at: new Date(T0).toISOString(), platform: "ios", environment: "production", payload: { aps: { alert: { body } }, opens: "status" } });

interface Opened {
  store: AlertsStore;
  outbox: OutboxStore;
  recorded: () => Promise<RecordedPush[]>;
  reset: () => Promise<void>;
  close: () => Promise<void>;
}

const implementations: Array<[string, () => Promise<Opened>]> = [
  [
    "a document",
    async () => {
      let sent = memoryStore<OutboxContents>({ sent: [] });
      const opened: Opened = {
        store: memoryAlertsStore(),
        outbox: documentOutboxStore(sent),
        recorded: async () => sent.read().sent,
        reset: async () => {
          sent = memoryStore<OutboxContents>({ sent: [] });
          opened.store = memoryAlertsStore();
          opened.outbox = documentOutboxStore(sent);
        },
        close: async () => undefined,
      };
      return opened;
    },
  ],
  [
    "Postgres",
    async () => {
      const { db, close } = await testDatabase();
      return {
        store: postgresAlertsStore(db),
        outbox: postgresOutboxStore(db),
        recorded: async () => (await db.select().from(schema.pushOutbox).orderBy(schema.pushOutbox.seq)).map((row) => ({ at: row.at.toISOString(), platform: row.platform, environment: row.environment, payload: row.payload as Record<string, unknown> })),
        reset: async () => {
          for (const table of [schema.alertState, schema.pushRefusals, schema.pushOutbox]) await db.delete(table);
        },
        close,
      };
    },
  ],
];

describe.each(implementations)("the alerts store over %s", (_kind, open) => {
  let opened: Opened;
  beforeAll(async () => {
    opened = await open();
  });
  beforeEach(() => opened.reset());
  afterAll(() => opened.close());

  it("starts a round for one caller, however many ask at once, and again only when it is due", async () => {
    expect(await opened.store.lastRoundAt()).toBeNull();
    const asked = await Promise.all(Array.from({ length: 6 }, () => opened.store.claimRound(T0, 50_000)));
    expect(asked.filter((answer) => answer !== null)).toEqual([{ jobsReadAt: null }]);
    expect(await opened.store.lastRoundAt()).toBe(T0);

    expect(await opened.store.claimRound(T0 + 49_999, 50_000)).toBeNull();
    expect(await opened.store.lastRoundAt()).toBe(T0);
    await opened.store.jobsRead(T0 + 1000);
    expect(await opened.store.claimRound(T0 + 50_000, 50_000)).toEqual({ jobsReadAt: T0 + 1000 });
    expect(await opened.store.lastRoundAt()).toBe(T0 + 50_000);
  });

  it("takes the state through the rules as one step, and keeps every part of it", async () => {
    expect(await opened.store.advance((state) => ({ state, result: state }))).toEqual(quietState());
    const changed = { engine: { down: true, streak: 1, told: ["opd_1", "opd_2"] }, jobs: { failing: true, lastSeenAt: T0 }, reports: { lastSentAt: T0 + 5, unannounced: true } };
    expect(await opened.store.advance(() => ({ state: changed, result: "said" }))).toBe("said");
    expect(await opened.store.advance((state) => ({ state, result: state }))).toEqual(changed);

    await opened.store.setEngineTold(["opd_3"]);
    expect((await opened.store.advance((state) => ({ state, result: state }))).engine).toEqual({ down: true, streak: 1, told: ["opd_3"] });
    // A round being claimed in between changes none of it.
    await opened.store.claimRound(T0, 50_000);
    expect((await opened.store.advance((state) => ({ state, result: state }))).jobs).toEqual({ failing: true, lastSeenAt: T0 });
  });

  it("counts every step when several arrive together", async () => {
    await Promise.all(Array.from({ length: 5 }, () => opened.store.advance((state) => ({ state: { ...state, engine: { ...state.engine, streak: state.engine.streak + 1 } }, result: null }))));
    expect((await opened.store.advance((state) => ({ state, result: state }))).engine.streak).toBe(5);
  });

  it("remembers a platform refusing the instance's credentials until that platform accepts them", async () => {
    expect(await opened.store.refusals()).toEqual({});
    await opened.store.setRefusal("ios", { at: "2026-11-21T09:00:00.000Z", detail: "InvalidProviderToken" });
    await opened.store.setRefusal("ios", { at: "2026-11-21T09:05:00.000Z", detail: "ExpiredProviderToken" });
    await opened.store.setRefusal("android", { at: "2026-11-21T09:06:00.000Z", detail: "UNAUTHENTICATED" });
    expect(await opened.store.refusals()).toEqual({ ios: { at: "2026-11-21T09:05:00.000Z", detail: "ExpiredProviderToken" }, android: { at: "2026-11-21T09:06:00.000Z", detail: "UNAUTHENTICATED" } });
    await opened.store.setRefusal("ios", null);
    await opened.store.setRefusal("ios", null);
    expect(await opened.store.refusals()).toEqual({ android: { at: "2026-11-21T09:06:00.000Z", detail: "UNAUTHENTICATED" } });
  });

  it("writes down what mock-only mode would have sent, in order, and keeps only the latest", async () => {
    for (const body of ["one", "two", "three", "four", "five"]) await opened.outbox.record(push(body), 3);
    expect(await opened.recorded()).toEqual([push("three"), push("four"), push("five")]);
  });
});
