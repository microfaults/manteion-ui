/**
 * The landing page's "Run the sample experiment" restarts a fixture in the
 * mock engine. Vitest pins VITE_USE_MOCK=false, so the engine is driven
 * directly; each test loads fresh module state, as a full page reload would.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type SampleModule = typeof import("../sample-experiment");
type Engine = typeof import("../api/mock-experiments");

let sample: SampleModule;
let engine: Engine;
let SAMPLE_EXPERIMENT_ID: string;

beforeEach(async () => {
  vi.useFakeTimers();
  vi.resetModules();
  sample = await import("../sample-experiment");
  engine = await import("../api/mock-experiments");
  ({ SAMPLE_EXPERIMENT_ID } = await import("../api/mock-fixtures"));
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe("startSampleExperiment", () => {
  it("exists in a fresh mock store, so its URL resolves after a reload", () => {
    expect(() => engine.mockGet(SAMPLE_EXPERIMENT_ID)).not.toThrow();
  });

  it("restarts the sample and returns its id", () => {
    expect(sample.startSampleExperiment()).toBe(SAMPLE_EXPERIMENT_ID);
    expect(engine.mockGet(SAMPLE_EXPERIMENT_ID).phases[0]?.status).toBe("running");
  });

  it("can be run again after it has started", () => {
    sample.startSampleExperiment();
    vi.advanceTimersByTime(engine.MOCK_PHASE_STEP_MS);
    expect(sample.startSampleExperiment()).toBe(SAMPLE_EXPERIMENT_ID);
    expect(engine.mockGet(SAMPLE_EXPERIMENT_ID).phases.map((p) => p.status)).toEqual([
      "running",
      "pending",
      "pending",
    ]);
  });
});

describe("indexRedirect", () => {
  it("sends operator builds to the dashboard", () => {
    expect(sample.indexRedirect(false)).toBe("/dashboard");
  });

  it("keeps the mock build on the landing page", () => {
    expect(sample.indexRedirect(true)).toBeUndefined();
  });
});
