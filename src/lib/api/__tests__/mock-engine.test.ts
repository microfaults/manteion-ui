/**
 * The mock engine is what the public demo runs on, so its state machine must
 * follow the real orchestrator: recording (persist_cache) phases drain, only a
 * running phase pauses and a paused phase's load stops, and rule fault events
 * are named after the fault they inject. Vitest pins VITE_USE_MOCK=false, so
 * the engine is called directly; each test loads a fresh copy of it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Engine = typeof import("../mock-experiments");

let m: Engine;
let SAMPLE_EXPERIMENT_ID: string;

beforeEach(async () => {
  vi.useFakeTimers();
  vi.resetModules();
  m = await import("../mock-experiments");
  ({ SAMPLE_EXPERIMENT_ID } = await import("../mock-fixtures"));
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

const workflows = [{ workflow_id: "wf-checkout-burst", vus: 5, duration_sec: 60 }];

/** recording (persist_cache) → replay of emailservice, outside every running fixture. */
function createRecordThenReplay() {
  return m.mockCreate({
    name: "record-then-replay",
    phases: [
      { name: "record", persist_cache: true, frozen_services: [], workflows, rule_ids: [] },
      {
        name: "replay-emailservice",
        frozen_services: [{ service: "emailservice", mode: "replay", mutation_policy: "deny" }],
        workflows,
        rule_ids: [],
      },
    ],
  });
}

const statuses = (id: string) => m.mockGet(id).phases.map((p) => p.status);

describe("mock engine phase semantics", () => {
  it("starts the sample experiment from the initial fixture state", () => {
    const e = m.mockStart(SAMPLE_EXPERIMENT_ID);
    expect(e.status).toBe("running");
    expect(e.phases.map((p) => p.status)).toEqual(["running", "pending", "pending"]);
  });

  it("drains recording phases, not frozen ones", () => {
    const exp = createRecordThenReplay();
    m.mockStart(exp.id);
    expect(statuses(exp.id)).toEqual(["running", "pending"]);

    vi.advanceTimersByTime(m.MOCK_PHASE_STEP_MS);
    expect(statuses(exp.id)).toEqual(["draining", "pending"]);

    vi.advanceTimersByTime(m.MOCK_PHASE_STEP_MS);
    expect(statuses(exp.id)).toEqual(["completed", "running"]);

    vi.advanceTimersByTime(m.MOCK_PHASE_STEP_MS);
    expect(statuses(exp.id)).toEqual(["completed", "completed"]);
    expect(m.mockGet(exp.id).status).toBe("completed");
  });

  it("reports a clean drain only for phases that drained", () => {
    const exp = createRecordThenReplay();
    m.mockStart(exp.id);
    vi.advanceTimersByTime(3 * m.MOCK_PHASE_STEP_MS);
    const [recording, frozen] = m.mockGet(exp.id).phases;
    expect(m.mockPhaseResultsFor(recording?.id ?? "")?.drain?.status).toBe("clean");
    expect(m.mockPhaseResultsFor(frozen?.id ?? "")).toBeDefined();
    expect(m.mockPhaseResultsFor(frozen?.id ?? "")?.drain).toBeUndefined();
  });

  it("refuses to pause a draining phase, at the phase and the experiment level", () => {
    const exp = createRecordThenReplay();
    m.mockStart(exp.id);
    vi.advanceTimersByTime(m.MOCK_PHASE_STEP_MS);
    const draining = m.mockGet(exp.id).phases[0];
    expect(draining?.status).toBe("draining");

    expect(() => m.mockPausePhase(draining?.id ?? "")).toThrow(
      expect.objectContaining({ status: 409 }),
    );
    expect(() => m.mockPause(exp.id)).toThrow(expect.objectContaining({ status: 409 }));
    expect(statuses(exp.id)).toEqual(["draining", "pending"]);
  });

  it("stops the load run while paused", () => {
    m.mockStart(SAMPLE_EXPERIMENT_ID);
    const first = m.mockGet(SAMPLE_EXPERIMENT_ID).phases[0];
    const runId = first?.workflows[0]?.zeus_run_id ?? "";
    expect(m.mockZeusRun(runId).status).toBe("running");

    m.mockPausePhase(first?.id ?? "");
    expect(m.mockZeusRun(runId).status).toBe("stopped");
  });

  it("labels rule fault events by category and type", () => {
    m.mockStart(SAMPLE_EXPERIMENT_ID);
    vi.advanceTimersByTime(m.MOCK_PHASE_STEP_MS);
    const faultPhase = m.mockGet(SAMPLE_EXPERIMENT_ID).phases[1];
    expect(faultPhase?.status).toBe("running");

    const kinds = m.mockPhaseFaults(faultPhase?.id ?? "").fault_events.map((e) => e.kind);
    expect(kinds).toContain("inline:latency");
    expect(kinds.join()).not.toContain("rule:push");
  });

  it("restarts an experiment from any state", () => {
    m.mockRestart(SAMPLE_EXPERIMENT_ID);
    expect(m.mockGet(SAMPLE_EXPERIMENT_ID).phases[0]?.status).toBe("running");

    vi.advanceTimersByTime(3 * m.MOCK_PHASE_STEP_MS + 1);
    const done = m.mockGet(SAMPLE_EXPERIMENT_ID);
    expect(done.status).toBe("completed");
    const firstId = done.phases[0]?.id ?? "";
    expect(m.mockPhaseResultsFor(firstId)).toBeDefined();

    m.mockRestart(SAMPLE_EXPERIMENT_ID);
    const again = m.mockGet(SAMPLE_EXPERIMENT_ID);
    expect(again.status).toBe("running");
    expect(again.completed_at).toBeUndefined();
    expect(again.phases.map((p) => p.status)).toEqual(["running", "pending", "pending"]);
    expect(m.mockPhaseResultsFor(firstId)).toBeUndefined();

    // mid-run restart goes back to the first phase too
    vi.advanceTimersByTime(m.MOCK_PHASE_STEP_MS);
    expect(statuses(SAMPLE_EXPERIMENT_ID)).toEqual(["completed", "running", "pending"]);
    m.mockRestart(SAMPLE_EXPERIMENT_ID);
    expect(statuses(SAMPLE_EXPERIMENT_ID)).toEqual(["running", "pending", "pending"]);
  });

  it("restarts a paused experiment from its first phase", () => {
    m.mockStart(SAMPLE_EXPERIMENT_ID);
    vi.advanceTimersByTime(m.MOCK_PHASE_STEP_MS);
    expect(m.mockPause(SAMPLE_EXPERIMENT_ID)).toBe("paused");
    expect(statuses(SAMPLE_EXPERIMENT_ID)).toEqual(["completed", "paused", "pending"]);

    const restarted = m.mockRestart(SAMPLE_EXPERIMENT_ID);
    expect(restarted.status).toBe("running");
    expect(restarted.phases.map((p) => p.status)).toEqual(["running", "pending", "pending"]);
  });

  it("restart keeps honouring admission control against other experiments", () => {
    // exp-002 (completed) freezes cartservice; running fixture exp-001 also freezes it.
    expect(() => m.mockRestart("exp-002")).toThrow(
      expect.objectContaining({
        status: 409,
        body: expect.objectContaining({
          code: "service_overlap",
          running_experiment_id: "exp-001",
        }),
      }),
    );
    expect(m.mockGet("exp-002").status).toBe("completed");
  });
});
