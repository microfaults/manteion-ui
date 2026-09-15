/**
 * Client-side derivations over phase results. manteion-go carries no inline
 * metrics on a phase: harvested numbers live at …/phases/{id}/results, and
 * run-only phases (k6, not harvested until B4) fall back to zeus run stats.
 * Both collapse into one `PhaseMetrics` so the cards render either.
 */
import type { PhaseResults, ZeusRunStats } from "@/types/api";

export interface PhaseMetrics {
  /** Where the numbers came from — the UI captions the zeus fallback. */
  source: "harvested" | "zeus";
  request_count: number;
  error_count: number;
  /** errors / requests; undefined when nothing was sent. */
  error_rate?: number;
  rps?: number;
  p50_us?: number;
  p95_us?: number;
  p99_us?: number;
  /** k6 iterations the arrival-rate executor could not schedule because the
   *  VU pool ran out: the load ran below plan. Counted in iterations, not
   *  requests, so never part of error_count; absent when none were dropped. */
  dropped_iterations?: number;
}

const max = (a: number | undefined, b: number) => (a == null || b > a ? b : a);

/** Aggregates harvested workflow_results for a phase: counts sum, throughput
 *  sums, error rate is pooled, and each percentile is the WORST across
 *  workflows (a phase's tail is its worst workflow's tail). `undefined` when
 *  nothing was harvested (run-only phase). */
export function metricsFromResults(results: PhaseResults): PhaseMetrics | undefined {
  const rows = results.workflow_results;
  if (rows.length === 0) return undefined;
  let request_count = 0;
  let error_count = 0;
  let rps = 0;
  let p50_us: number | undefined;
  let p95_us: number | undefined;
  let p99_us: number | undefined;
  let dropped = 0;
  for (const r of rows) {
    request_count += r.request_count;
    error_count += r.error_count;
    rps += r.throughput_rps;
    p50_us = max(p50_us, r.latency_p50_us);
    p95_us = max(p95_us, r.latency_p95_us);
    p99_us = max(p99_us, r.latency_p99_us);
    const d = r.raw_metrics?.requests_dropped;
    if (typeof d === "number" && d > 0) dropped += d;
  }
  return {
    source: "harvested",
    request_count,
    error_count,
    error_rate: request_count > 0 ? error_count / request_count : undefined,
    rps,
    p50_us,
    p95_us,
    p99_us,
    ...(dropped > 0 ? { dropped_iterations: dropped } : {}),
  };
}

/** zeus RunStats (already µs/ms after ZeusRunStatsSchema) → PhaseMetrics.
 *  error_rate = (sent − ok) / sent; rps = sent / duration. Percentiles are
 *  meaningless for an empty run, so they are left undefined. */
export function metricsFromZeusStats(stats: ZeusRunStats): PhaseMetrics {
  const sent = stats.requests_sent;
  const hasTraffic = sent > 0;
  // HTTP failures only: zeus names k6 dropped_iterations "requests_dropped".
  const errors = Math.max(0, sent - stats.requests_ok);
  return {
    source: "zeus",
    request_count: sent,
    error_count: errors,
    error_rate: hasTraffic ? errors / sent : undefined,
    rps: hasTraffic && stats.duration_ms > 0 ? sent / (stats.duration_ms / 1000) : undefined,
    p50_us: hasTraffic ? stats.latency_p50_us : undefined,
    p95_us: hasTraffic ? stats.latency_p95_us : undefined,
    p99_us: hasTraffic ? stats.latency_p99_us : undefined,
    ...(stats.requests_dropped > 0 ? { dropped_iterations: stats.requests_dropped } : {}),
  };
}

/** Wall-clock length of a phase from its timestamps: completed − started when
 *  terminal, now − started while in flight, null if it never started. */
export function phaseDurationMs(
  phase: { started_at?: string | null; completed_at?: string | null },
  now: number = Date.now(),
): number | null {
  if (!phase.started_at) return null;
  const start = Date.parse(phase.started_at);
  const end = phase.completed_at ? Date.parse(phase.completed_at) : now;
  return Math.max(0, end - start);
}

/** "+25% vs baseline" / "-25% vs baseline"; "" when there is no baseline. */
export function pctDelta(baseline: number, current: number): string {
  if (!baseline) return "";
  const pct = ((current - baseline) / baseline) * 100;
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(0)}% vs baseline`;
}

/** The phase to diff against: the one named `baseline`, else the first by
 *  position (the typology is a naming convention, not a column). */
export function baselinePhase<T extends { name: string; position?: number }>(
  phases: readonly T[],
): T | undefined {
  return (
    phases.find((p) => p.name === "baseline") ??
    [...phases].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))[0]
  );
}

/** Planned wall-clock for a phase: its longest workflow leg. null when no
 *  workflow carries a duration. */
export function plannedPhaseMs(phase: { workflows: readonly { duration_sec?: number }[] }):
  | number
  | null {
  let max = 0;
  for (const w of phase.workflows) if (w.duration_sec && w.duration_sec > max) max = w.duration_sec;
  return max > 0 ? max * 1000 : null;
}

export interface PhaseProgress {
  elapsedMs: number;
  plannedMs: number | null;
  /** 0..1 against the plan, capped — the poller finishes on its own schedule. */
  fraction: number | null;
}

/** Time-based progress for an in-flight phase (zeus reports no mid-run
 *  numbers, so wall-clock against the planned duration is the only signal). */
export function phaseProgress(
  phase: {
    started_at?: string | null;
    completed_at?: string | null;
    workflows: readonly { duration_sec?: number }[];
  },
  now: number = Date.now(),
): PhaseProgress | null {
  const elapsedMs = phaseDurationMs(phase, now);
  if (elapsedMs == null) return null;
  const plannedMs = plannedPhaseMs(phase);
  return {
    elapsedMs,
    plannedMs,
    fraction: plannedMs ? Math.min(1, elapsedMs / plannedMs) : null,
  };
}

/** Datasets a phase needs: the backend's derived `dataset_ids` when present
 *  (manteion-go B5), else the union of its workflows' `dataset_id`s. */
export function phaseDatasetIds(phase: {
  dataset_ids?: readonly string[];
  workflows: readonly { dataset_id?: string }[];
}): string[] {
  if (phase.dataset_ids) return [...phase.dataset_ids];
  const out: string[] = [];
  for (const w of phase.workflows)
    if (w.dataset_id && !out.includes(w.dataset_id)) out.push(w.dataset_id);
  return out;
}
