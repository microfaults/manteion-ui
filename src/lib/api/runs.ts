import { z } from "zod";
import { apiClient } from "./client";
import { RunSchema, Timestamp } from "@/types/api";

export const HistogramBucketSchema = z.object({
  min_us: z.number(),
  max_us: z.number(),
  count: z.number().int(),
});

export type HistogramBucket = z.infer<typeof HistogramBucketSchema>;

export const StepStatSchema = z.object({
  name: z.string(),
  sent: z.number().int(),
  ok: z.number().int(),
  dropped: z.number().int(),
  p50_us: z.number().int(),
  p95_us: z.number().int(),
  p99_us: z.number().int(),
  histogram: z.record(z.string(), z.array(HistogramBucketSchema)).optional(), // keyed by p50, p95, p99
  variants: z
    .array(
      z.object({
        name: z.string(),
        pick_count: z.number().int(),
        weight: z.number(),
      })
    )
    .optional(),
});

export type StepStat = z.infer<typeof StepStatSchema>;

export const RunDetailSchema = RunSchema.extend({
  workflow_name: z.string().optional(),
  experiment_name: z.string().optional(),
  sent: z.number().int().default(0),
  dropped: z.number().int().default(0),
  iterations_done: z.number().int().default(0),
  iterations_total: z.number().int().default(0),
  p50_us: z.number().int().optional(),
  p95_us: z.number().int().optional(),
  p99_us: z.number().int().optional(),
});

export type RunDetail = z.infer<typeof RunDetailSchema>;

export const RunEventSchema = z.object({
  type: z.enum(["step.ok", "step.drop", "iteration.done", "phase.transition"]),
  timestamp: Timestamp,
  run_id: z.string(),
  step_name: z.string().optional(),
  duration_us: z.number().int().optional(),
  variant: z.string().optional(),
  reason: z.string().optional(),
  iteration: z.number().int().optional(),
  total_iterations: z.number().int().optional(),
});

export type RunEvent = z.infer<typeof RunEventSchema>;

export async function getRun(id: string): Promise<RunDetail> {
  try {
    return await apiClient.get(`/api/v1/runs/${encodeURIComponent(id)}`, RunDetailSchema);
  } catch (err) {
    if (id === "run_abc123") {
      return MOCK_RUN;
    }
    throw err;
  }
}

export async function listRunSteps(id: string): Promise<StepStat[]> {
  try {
    return await apiClient.get(`/api/v1/runs/${encodeURIComponent(id)}/steps`, z.array(StepStatSchema));
  } catch (err) {
    if (id === "run_abc123") {
      return MOCK_STEPS;
    }
    throw err;
  }
}

export async function pauseRun(id: string): Promise<void> {
  try {
    await apiClient.post(`/api/v1/runs/${encodeURIComponent(id)}/pause`, {});
  } catch (err) {
    console.warn("pauseRun failed (expected if backend not ready):", err);
  }
}

export async function resumeRun(id: string): Promise<void> {
  try {
    await apiClient.post(`/api/v1/runs/${encodeURIComponent(id)}/resume`, {});
  } catch (err) {
    console.warn("resumeRun failed (expected if backend not ready):", err);
  }
}

// Mock Data
const MOCK_RUN: RunDetail = {
  id: "run_abc123",
  workflow_id: "checkout-flow",
  workflow_name: "checkout-flow",
  experiment_id: "exp-456",
  experiment_name: "Black Friday Load",
  status: "running",
  started_at: new Date(Date.now() - 134000).toISOString(),
  sent: 14302,
  dropped: 187,
  iterations_done: 42,
  iterations_total: 100,
  p99_us: 312000,
};

const genHistogram = (p: number) => {
  const buckets: HistogramBucket[] = [];
  const count = 100;
  for (let i = 0; i < 20; i++) {
    const min = (p / 20) * i;
    const max = (p / 20) * (i + 1);
    const center = p * 0.7; // shift center for different latencies
    const sigma = p / 4;
    const x = (min + max) / 2;
    const val = Math.exp(-Math.pow(x - center, 2) / (2 * Math.pow(sigma, 2)));
    buckets.push({
      min_us: min,
      max_us: max,
      count: Math.floor(val * count) + (i === 18 ? 5 : 1),
    });
  }
  return buckets;
};

const MOCK_STEPS: StepStat[] = [
  {
    name: "login",
    sent: 4201,
    ok: 4100,
    dropped: 101,
    p50_us: 48000,
    p95_us: 120000,
    p99_us: 210000,
    histogram: {
      p50: genHistogram(48000),
      p95: genHistogram(120000),
      p99: genHistogram(210000),
    },
    variants: [
      { name: "A", weight: 0.6, pick_count: 2520 },
      { name: "B", weight: 0.4, pick_count: 1681 },
    ],
  },
  {
    name: "add-to-cart",
    sent: 3890,
    ok: 3800,
    dropped: 90,
    p50_us: 52000,
    p95_us: 140000,
    p99_us: 290000,
    histogram: {
      p50: genHistogram(52000),
      p95: genHistogram(140000),
      p99: genHistogram(290000),
    },
    variants: [
      { name: "A", weight: 0.6, pick_count: 2334 },
      { name: "B", weight: 0.4, pick_count: 1556 },
    ],
  },
  {
    name: "checkout",
    sent: 3201,
    ok: 3100,
    dropped: 101,
    p50_us: 61000,
    p95_us: 180000,
    p99_us: 312000,
    histogram: {
      p50: genHistogram(61000),
      p95: genHistogram(180000),
      p99: genHistogram(312000),
    },
    variants: [
      { name: "A", weight: 0.55, pick_count: 1760 },
      { name: "B", weight: 0.45, pick_count: 1441 },
    ],
  },
];

export const MOCK_EVENTS: RunEvent[] = [
  {
    type: "step.ok",
    timestamp: new Date().toISOString(),
    run_id: "run_abc123",
    step_name: "login",
    duration_us: 48000,
    variant: "A",
  },
  {
    type: "step.drop",
    timestamp: new Date().toISOString(),
    run_id: "run_abc123",
    step_name: "add-to-cart",
    reason: "timeout",
    variant: "B",
  },
  {
    type: "step.ok",
    timestamp: new Date().toISOString(),
    run_id: "run_abc123",
    step_name: "checkout",
    duration_us: 61000,
    variant: "A",
  },
  {
    type: "iteration.done",
    timestamp: new Date().toISOString(),
    run_id: "run_abc123",
    iteration: 43,
    total_iterations: 100,
  },
];
