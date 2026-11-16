/**
 * Mock-mode parity: with VITE_USE_MOCK=true the experiments client keeps a
 * mutable in-memory plan and walks a started experiment through
 * pending → running → (draining when the phase records, persist_cache) → completed on a
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
          persist_cache: true,
          frozen_services: [],
          workflows: [{ workflow_id: "wf-checkout-burst", vus: 5, duration_sec: 60 }],
          rule_ids: [],
        },
        {
          // emailservice is outside the running fixture's footprint (exp-001: cartservice, shippingservice, checkoutservice)
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

    // one tick: the recording baseline drains first
    await vi.advanceTimersByTimeAsync(api.MOCK_PHASE_STEP_MS);
    let snap = api.getExperiment(exp.id);
    await vi.advanceTimersByTimeAsync(100);
    let e = await snap;
    expect(e.phases.map((p) => p.status)).toEqual(["draining", "pending"]);

    // next tick: baseline completes, the frozen isolation phase starts
    await vi.advanceTimersByTimeAsync(api.MOCK_PHASE_STEP_MS);
    snap = api.getExperiment(exp.id);
    await vi.advanceTimersByTimeAsync(100);
    e = await snap;
    expect(e.phases.map((p) => p.status)).toEqual(["completed", "running"]);
    expect(api.mockPhaseResultsFor(e.phases[0]?.id ?? "")?.workflow_results.length).toBe(1);

    // last tick: the frozen phase does not record, so it completes without draining
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
    // exp-001 (fixture) is running and freezes cartservice
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

describe("experimentsApi in mock mode — dataset preflight (B5 parity)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("refuses a plan referencing a dataset zeus does not have with 422 dataset_missing", async () => {
    const api = await loadMockApi();
    const rejected = expect(
      api.createExperiment({
        name: "needs-data",
        phases: [
          {
            name: "baseline",
            frozen_services: [],
            workflows: [
              { workflow_id: "wf-checkout-burst", vus: 5, duration_sec: 60, dataset_id: "ds-nope" },
            ],
            rule_ids: [],
          },
        ],
      }),
    ).rejects.toMatchObject({
      status: 422,
      body: expect.objectContaining({ code: "dataset_missing", dataset_ids: ["ds-nope"] }),
    });
    await vi.runAllTimersAsync();
    await rejected;
  });

  it("accepts a plan whose datasets exist and surfaces the union on the phase read-out", async () => {
    const api = await loadMockApi();
    const created = api.createExperiment({
      name: "with-data",
      phases: [
        {
          name: "baseline",
          frozen_services: [],
          workflows: [
            {
              workflow_id: "wf-checkout-burst",
              vus: 5,
              duration_sec: 60,
              dataset_id: "ds-checkout-seed",
            },
            {
              workflow_id: "wf-browse-catalog",
              vus: 5,
              duration_sec: 60,
              dataset_id: "ds-browse-capture",
            },
          ],
          rule_ids: [],
        },
      ],
    });
    await vi.runAllTimersAsync();
    const exp = await created;
    expect(exp.phases[0]?.dataset_ids).toEqual(["ds-checkout-seed", "ds-browse-capture"]);
  });
});
