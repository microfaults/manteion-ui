/**
 * The landing page quotes three browse p95 figures measured on the real
 * testbed, and the one-click sample experiment has exactly those three phases.
 * The sample must therefore end on the recorded figures, not on the mock
 * engine's generated ones; every other experiment keeps generated results.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Engine = typeof import("../mock-experiments");
type Fixtures = typeof import("../mock-fixtures");
type Rules = typeof import("../rules");

let m: Engine;
let f: Fixtures;
let r: Rules;

beforeEach(async () => {
  vi.useFakeTimers();
  vi.resetModules();
  m = await import("../mock-experiments");
  f = await import("../mock-fixtures");
  r = await import("../rules");
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

const ms = (v: number) => Math.round(v * 1000);

function runToEnd(id: string) {
  vi.advanceTimersByTime(3 * m.MOCK_PHASE_STEP_MS + 1);
  return m.mockGet(id);
}

describe("sample experiment replays the recorded figures", () => {
  it("covers exactly the sample's three phases", () => {
    expect(Object.keys(f.SAMPLE_RECORDED_RESULTS).sort()).toEqual(
      ["catalog-latency-50ms", "plain", "plain-end"].sort(),
    );
  });

  it("writes the recorded values for every phase of the sample", () => {
    m.mockRestart(f.SAMPLE_EXPERIMENT_ID);
    const done = runToEnd(f.SAMPLE_EXPERIMENT_ID);
    expect(done.status).toBe("completed");
    expect(done.phases.map((p) => p.name)).toEqual(["plain", "catalog-latency-50ms", "plain-end"]);

    for (const phase of done.phases) {
      const rec = f.SAMPLE_RECORDED_RESULTS[phase.name];
      expect(rec).toBeDefined();
      if (!rec) continue;
      const rows = m.mockPhaseResultsFor(phase.id)?.workflow_results ?? [];
      expect(rows).toHaveLength(1);
      const row = rows[0];
      expect(row?.workflow_id).toBe("wf-browse-catalog");
      expect(row?.request_count).toBe(rec.request_count);
      expect(row?.error_rate).toBe(rec.error_rate);
      expect(row?.error_count).toBe(0);
      expect(row?.latency_p50_us).toBe(ms(rec.p50_ms));
      expect(row?.latency_p95_us).toBe(ms(rec.p95_ms));
      expect(row?.latency_p99_us).toBe(ms(rec.p99_ms));
      expect(row?.latency_p999_us).toBeUndefined();
      expect(row?.raw_metrics?.requests_dropped).toBe(rec.dropped_iterations);
    }
  });

  it("plans the sample like the recorded run: 120 s of browse at 3 per second", () => {
    const sample = m.mockGet(f.SAMPLE_EXPERIMENT_ID);
    for (const phase of sample.phases) {
      expect(phase.workflows).toHaveLength(1);
      expect(phase.workflows[0]).toMatchObject({
        workflow_id: "wf-browse-catalog",
        duration_sec: 120,
        rate_rps: 3,
      });
    }
  });

  it("keeps generated results for other experiments, even with the sample's phase names", () => {
    const workflows = [{ workflow_id: "wf-browse-catalog", vus: 10, duration_sec: 120 }];
    const exp = m.mockCreate({
      name: "visitor-copy",
      phases: [
        { name: "plain", workflows, frozen_services: [], rule_ids: [] },
        { name: "plain-end", workflows, frozen_services: [], rule_ids: [] },
      ],
    });
    m.mockStart(exp.id);
    vi.advanceTimersByTime(2 * m.MOCK_PHASE_STEP_MS + 1);
    const done = m.mockGet(exp.id);
    expect(done.status).toBe("completed");

    for (const phase of done.phases) {
      expect(m.isRecordedPhase(phase.id)).toBe(false);
      const row = m.mockPhaseResultsFor(phase.id)?.workflow_results[0];
      const rec = f.SAMPLE_RECORDED_RESULTS[phase.name];
      expect(row).toBeDefined();
      expect(row?.request_count).not.toBe(rec?.request_count);
      expect(row?.latency_p95_us).not.toBe(ms(rec?.p95_ms ?? 0));
    }
  });

  it("marks a phase recorded only once its recorded results are stored", () => {
    const phaseIds = m.mockGet(f.SAMPLE_EXPERIMENT_ID).phases.map((p) => p.id);
    for (const id of phaseIds) expect(m.isRecordedPhase(id)).toBe(false);
    m.mockRestart(f.SAMPLE_EXPERIMENT_ID);
    runToEnd(f.SAMPLE_EXPERIMENT_ID);
    for (const id of phaseIds) expect(m.isRecordedPhase(id)).toBe(true);
    expect(m.isRecordedPhase("plain")).toBe(false);
    expect(m.isRecordedPhase("ph-001-baseline")).toBe(false);
    expect(m.isRecordedPhase("")).toBe(false);
  });

  it("drops the recorded mark when the sample is restarted", () => {
    m.mockRestart(f.SAMPLE_EXPERIMENT_ID);
    runToEnd(f.SAMPLE_EXPERIMENT_ID);
    m.mockRestart(f.SAMPLE_EXPERIMENT_ID);
    for (const p of m.mockGet(f.SAMPLE_EXPERIMENT_ID).phases)
      expect(m.isRecordedPhase(p.id)).toBe(false);
  });

  it("does not throw once a visitor has deleted the sample", () => {
    const phaseIds = m.mockGet(f.SAMPLE_EXPERIMENT_ID).phases.map((p) => p.id);
    m.mockDelete(f.SAMPLE_EXPERIMENT_ID);
    expect(() => phaseIds.map((id) => m.isRecordedPhase(id))).not.toThrow();
    expect(() => m.mockList()).not.toThrow();
  });
});

describe("sample experiment generates results once it no longer matches the recording", () => {
  const expectGenerated = (phaseId: string, name: string) => {
    const row = m.mockPhaseResultsFor(phaseId)?.workflow_results[0];
    const rec = f.SAMPLE_RECORDED_RESULTS[name];
    expect(row).toBeDefined();
    expect(row?.request_count).not.toBe(rec?.request_count);
    expect(row?.latency_p95_us).not.toBe(ms(rec?.p95_ms ?? 0));
    expect(m.isRecordedPhase(phaseId)).toBe(false);
  };

  it("generates every phase when catalog-latency-50ms is disabled", () => {
    expect(r.mockDisableServiceRules("productcatalogservice")).toContain("rule-014");
    m.mockRestart(f.SAMPLE_EXPERIMENT_ID);
    const done = runToEnd(f.SAMPLE_EXPERIMENT_ID);
    expect(done.status).toBe("completed");
    for (const p of done.phases) expectGenerated(p.id, p.name);
  });

  it("generates every phase when a visitor has added a phase to the sample", () => {
    m.mockCreatePhase(f.SAMPLE_EXPERIMENT_ID, {
      name: "extra",
      workflows: [{ workflow_id: "wf-browse-catalog", vus: 10, duration_sec: 120 }],
      frozen_services: [],
      rule_ids: [],
    });
    m.mockStart(f.SAMPLE_EXPERIMENT_ID);
    vi.advanceTimersByTime(4 * m.MOCK_PHASE_STEP_MS + 1);
    const done = m.mockGet(f.SAMPLE_EXPERIMENT_ID);
    expect(done.status).toBe("completed");
    for (const p of done.phases.filter((p) => p.name in f.SAMPLE_RECORDED_RESULTS))
      expectGenerated(p.id, p.name);
  });

  it("does not record a phase stopped before the end of its plan", () => {
    m.mockRestart(f.SAMPLE_EXPERIMENT_ID);
    vi.advanceTimersByTime(m.MOCK_PHASE_STEP_MS + 1);
    const [plain, latency] = m.mockGet(f.SAMPLE_EXPERIMENT_ID).phases;
    expect(latency?.status).toBe("running");
    m.mockStopPhase(latency?.id ?? "", "completed");
    expect(m.isRecordedPhase(plain?.id ?? "")).toBe(true);
    expectGenerated(latency?.id ?? "", "catalog-latency-50ms");
  });

  it("does not record a phase completed by stopping the experiment", () => {
    m.mockRestart(f.SAMPLE_EXPERIMENT_ID);
    m.mockStop(f.SAMPLE_EXPERIMENT_ID, "completed");
    const [plain] = m.mockGet(f.SAMPLE_EXPERIMENT_ID).phases;
    expect(plain?.status).toBe("completed");
    expectGenerated(plain?.id ?? "", "plain");
  });
});
