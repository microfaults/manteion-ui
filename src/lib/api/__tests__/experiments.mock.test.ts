/**
 * Mock-mode parity: with VITE_USE_MOCK=true the experiments client keeps a
 * mutable in-memory plan and walks a started experiment through
 * pending → running → (draining when services are frozen) → completed on a
 * timer, filling mockPhaseResults — the same observable sequence the
 * orchestrator produces. Loaded with fresh modules so the env flag applies.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type ExperimentsApi = typeof import("@/lib/api/experiments");

async function loadMockApi(): Promise<ExperimentsApi> {
  vi.resetModules();
  vi.stubEnv("VITE_USE_MOCK", "true");
  return import("@/lib/api/experiments");
}

describe("experimentsApi in mock mode", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("createExperiment adds a planned experiment with ids; deleteExperiment removes it", async () => {
    const api = await loadMockApi();
    const created = api.createExperiment({
      name: "mock-exp",
      phases: [
        {
          name: "baseline",
          frozen_services: [],
          workflows: [{ workflow_id: "wf-checkout-burst", vus: 5, duration_sec: 60 }],
          rule_ids: [],
        },
      ],
    });
    await vi.runAllTimersAsync();
    const exp = await created;
    expect(exp.status).toBe("planned");
    expect(exp.phases[0]?.id).toBeTruthy();
    const listed = api.listExperiments();
    await vi.runAllTimersAsync();
    expect((await listed).some((e) => e.id === exp.id)).toBe(true);
    const del = api.deleteExperiment(exp.id);
    await vi.runAllTimersAsync();
    await del;
    const after = api.listExperiments();
    await vi.runAllTimersAsync();
    expect((await after).some((e) => e.id === exp.id)).toBe(false);
  });

  it("startExperiment walks phases pending → running → draining → completed and fills results", async () => {
    const api = await loadMockApi();
    const created = api.createExperiment({
      name: "mock-walk",
      phases: [
        {
          name: "baseline",
          frozen_services: [],
          workflows: [{ workflow_id: "wf-checkout-burst", vus: 5, duration_sec: 60 }],
          rule_ids: [],
        },
        {
          // emailservice is outside the running fixture's footprint (exp-001: cartservice + productcatalog)
          name: "isolation-emailservice",
          frozen_services: [{ service: "emailservice", mode: "replay", mutation_policy: "deny" }],
          workflows: [{ workflow_id: "wf-checkout-burst", vus: 5, duration_sec: 60 }],
          rule_ids: [],
        },
      ],
    });
    await vi.runAllTimersAsync();
    const exp = await created;

    const started = api.startExperiment(exp.id);
    await vi.advanceTimersByTimeAsync(100);
    const running = await started;
    expect(running.status).toBe("running");
    expect(running.phases.map((p) => p.status)).toEqual(["running", "pending"]);
    expect(running.phases[0]?.workflows[0]?.zeus_run_id).toBeTruthy();

    // one tick: baseline completes (no frozen services → no draining), isolation starts
    await vi.advanceTimersByTimeAsync(api.MOCK_PHASE_STEP_MS);
    let snap = api.getExperiment(exp.id);
    await vi.advanceTimersByTimeAsync(100);
    let e = await snap;
    expect(e.phases.map((p) => p.status)).toEqual(["completed", "running"]);
    expect(api.mockPhaseResultsFor(e.phases[0]?.id ?? "")?.workflow_results.length).toBe(1);

    // next tick: the frozen phase drains first
    await vi.advanceTimersByTimeAsync(api.MOCK_PHASE_STEP_MS);
    snap = api.getExperiment(exp.id);
    await vi.advanceTimersByTimeAsync(100);
    e = await snap;
    expect(e.phases[1]?.status).toBe("draining");

    await vi.advanceTimersByTimeAsync(api.MOCK_PHASE_STEP_MS);
    snap = api.getExperiment(exp.id);
    await vi.advanceTimersByTimeAsync(100);
    e = await snap;
    expect(e.phases.map((p) => p.status)).toEqual(["completed", "completed"]);
    expect(e.status).toBe("completed");
    expect(e.completed_at).toBeTruthy();
  });

  it("startExperiment refuses a service-footprint overlap with a running experiment (admission control)", async () => {
    const api = await loadMockApi();
    // exp-001 (fixture) is running and freezes cartservice + rule-001 (productcatalog)
    const created = api.createExperiment({
      name: "overlap",
      phases: [
        {
          name: "isolation-cartservice",
          frozen_services: [{ service: "cartservice", mode: "replay", mutation_policy: "deny" }],
          workflows: [{ workflow_id: "wf-checkout-burst", vus: 5, duration_sec: 60 }],
          rule_ids: [],
        },
      ],
    });
    await vi.runAllTimersAsync();
    const exp = await created;
    // attach the expectation before the timers fire so the rejection is handled
    const rejected = expect(api.startExperiment(exp.id)).rejects.toMatchObject({
      status: 409,
      body: expect.objectContaining({ code: "service_overlap", running_experiment_id: "exp-001" }),
    });
    await vi.runAllTimersAsync();
    await rejected;
  });
});
