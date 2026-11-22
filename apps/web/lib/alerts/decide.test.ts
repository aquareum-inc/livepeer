import { describe, expect, it } from "vitest";

import { FAILING_JOBS } from "../public-api/operations";
import { ENGINE_CHECKS, JOBS_CLEAR_MS, REPORTS_EVERY_MS, decide, quietState, type AlertState, type Observation } from "./decide";

const MINUTE = 60_000;
const start = Date.parse("2026-11-21T09:00:00Z");

/** Feeds observations a minute apart and answers with what was sent after each, as "kind" or "kind, over". */
function run(observations: Observation[], from: AlertState = quietState(), every = MINUTE) {
  let state = from;
  const sent = observations.map((observation, index) => {
    const step = decide(state, observation, start + index * every);
    state = step.state;
    return step.alerts.map((alert) => `${alert.kind}${alert.over ? ", over" : ""}${alert.count === null ? "" : ` ${alert.count}`}`);
  });
  return { sent, state };
}

const engine = (ready: boolean): Observation => ({ type: "engine", ready });
const jobs = (failed: number): Observation => ({ type: "jobs", failed });

describe("the engine", () => {
  it("alerts on the second check in a row that finds it not ready, not the first, and never again while it lasts", () => {
    expect(ENGINE_CHECKS).toBe(2);
    expect(run([engine(true), engine(false), engine(false), engine(false), engine(false)]).sent).toEqual([[], [], ["engine_not_ready"], [], []]);
  });

  it("says nothing about a single bad answer, such as a restart", () => {
    expect(run([engine(false), engine(true), engine(false), engine(true)]).sent.flat()).toEqual([]);
  });

  it("says it is ready again once, after two checks in a row find it ready", () => {
    const down = run([engine(false), engine(false)]).state;
    expect(down.engine.down).toBe(true);
    expect(run([engine(true), engine(false), engine(true), engine(true), engine(true)], down).sent).toEqual([[], [], [], ["engine_not_ready, over"], []]);
  });

  it("can alert again after it has recovered", () => {
    expect(run([engine(false), engine(false), engine(true), engine(true), engine(false), engine(false)]).sent.flat()).toEqual(["engine_not_ready", "engine_not_ready, over", "engine_not_ready"]);
  });
});

describe("failing jobs", () => {
  it("alerts when Status's own rule starts to hold, with its count, and not again while it lasts", () => {
    expect(run([jobs(FAILING_JOBS - 1), jobs(FAILING_JOBS), jobs(FAILING_JOBS + 9), jobs(FAILING_JOBS)]).sent).toEqual([[], [`jobs_failing ${FAILING_JOBS}`], [], []]);
  });

  it("doesn't alert each time a count hovering at the line crosses it", () => {
    const hover = Array.from({ length: 12 }, (_, index) => jobs(index % 2 === 0 ? FAILING_JOBS : FAILING_JOBS - 1));
    expect(run(hover, quietState(), 5 * MINUTE).sent.flat()).toEqual([`jobs_failing ${FAILING_JOBS}`]);
  });

  it("can alert again only after half an hour without failing", () => {
    const failing = run([jobs(8)]).state;
    const clear = JOBS_CLEAR_MS / (5 * MINUTE);
    const quiet = Array.from({ length: clear }, () => jobs(0));
    // Five short of half an hour clear, it has not ended; a new run of failures is the same one.
    expect(run([...quiet.slice(1), jobs(9)], failing, 5 * MINUTE).sent.flat()).toEqual([]);
    expect(run([...quiet, jobs(0), jobs(9)], failing, 5 * MINUTE).sent.flat()).toEqual(["jobs_failing 9"]);
  });
});

describe("reports", () => {
  it("alerts when one is filed and nobody has been told, with how many are waiting", () => {
    expect(run([{ type: "report_filed", waiting: 1 }]).sent).toEqual([["reports_waiting 1"]]);
    // Reports that were already waiting before anyone listened are counted too.
    expect(run([{ type: "report_filed", waiting: 4 }]).sent).toEqual([["reports_waiting 4"]]);
  });

  it("tells phones of more at most once an hour, and then says them together", () => {
    const hour = REPORTS_EVERY_MS / MINUTE;
    const flood: Observation[] = Array.from({ length: hour + 2 }, (_, index) => (index < 20 ? { type: "report_filed", waiting: index + 1 } : { type: "reports", waiting: 20 }));
    const { sent } = run(flood);
    expect(sent[0]).toEqual(["reports_waiting 1"]);
    expect(sent.slice(1, hour).flat()).toEqual([]);
    expect(sent[hour]).toEqual(["reports_waiting 20"]);
    expect(sent.slice(hour + 1).flat()).toEqual([]);
  });

  it("says nothing on a check when nothing new was filed, however long reports wait", () => {
    const told = run([{ type: "report_filed", waiting: 2 }]).state;
    expect(run(Array.from({ length: 200 }, (): Observation => ({ type: "reports", waiting: 2 })), told).sent.flat()).toEqual([]);
  });

  it("starts again once the queue has been emptied", () => {
    expect(run([{ type: "report_filed", waiting: 1 }, { type: "reports", waiting: 0 }, { type: "report_filed", waiting: 1 }]).sent).toEqual([["reports_waiting 1"], [], ["reports_waiting 1"]]);
  });
});

describe("a phone being added", () => {
  it("is told every time, to everyone but the phone itself", () => {
    const step = decide(quietState(), { type: "phone_added", sessionId: "opd_new" }, start);
    expect(step.alerts).toEqual([{ kind: "phone_added", over: false, count: null, except: "opd_new" }]);
    expect(step.state).toEqual(quietState());
  });
});

it("never changes the state it was given", () => {
  const before = quietState();
  decide(before, engine(false), start);
  decide(before, jobs(50), start);
  decide(before, { type: "report_filed", waiting: 3 }, start);
  expect(before).toEqual(quietState());
});
