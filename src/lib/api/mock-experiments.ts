/**
 * In-memory experiment store for VITE_USE_MOCK=true.
 *
 * Mirrors the orchestrator's observable behaviour closely enough to build the
 * UI against: admission control by service footprint (409), the lifecycle
 * verbs with the backend's status codes, and a timer that walks a started
 * experiment through pending → running → (draining when the phase froze
 * services) → completed, writing results the way harvest.go does at phase
 * end. Fixture experiments are static — only experiments started through the
 * API progress.
 */
import type {
  CreateExperimentInput,
  CreatePhaseInput,
  Experiment,
  ExperimentStatus,
  PhaseDetail,
  PhaseFaults,
  PhaseListItem,
  PhaseResults,
  PhaseStatus,
  PhaseSummary,
  PhaseWorkflow,
  ZeusRun,
  ZeusRunStats,
} from "@/types/api";
import { ApiError } from "./client";
import { datasetExpiresAt, mockDatasetList } from "./datasets";
import { mockExperiments, mockPhaseResults } from "./mock-fixtures";
import { mockServicesForRules } from "./rules";

/** Wall-clock per orchestrator step in mock mode (a real phase runs minutes). */
export const MOCK_PHASE_STEP_MS = 8_000;

let store: Experiment[] = mockExperiments.map(cloneExperiment);
const results = new Map<string, PhaseResults>(Object.entries(mockPhaseResults));
const timers = new Map<string, ReturnType<typeof setTimeout>>();
let seq = 0;

const now = () => new Date().toISOString();
const nextId = (prefix: string) => `${prefix}-${Date.now().toString(36)}${(++seq).toString(36)}`;
const byPosition = (a: PhaseSummary, b: PhaseSummary) => (a.position ?? 0) - (b.position ?? 0);
const isActive = (s: PhaseStatus) => s === "running" || s === "draining" || s === "paused";

function cloneExperiment(e: Experiment): Experiment {
  return {
    ...e,
    targeted_services: [...e.targeted_services],
    phases: e.phases.map(clonePhase),
  };
}
function clonePhase(p: PhaseSummary): PhaseSummary {
  return {
    ...p,
    workflows: p.workflows.map((w) => ({ ...w })),
    frozen_services: p.frozen_services.map((f) => ({ ...f })),
    rule_ids: [...p.rule_ids],
    dataset_ids: datasetUnion(p),
  };
}

/** Derived read-only union the backend puts on every phase read-out (B5). */
function datasetUnion(p: { workflows: readonly { dataset_id?: string }[] }): string[] {
  const out: string[] = [];
  for (const w of p.workflows)
    if (w.dataset_id && !out.includes(w.dataset_id)) out.push(w.dataset_id);
  return out;
}

const PLAN_SLACK_MS = 5 * 60 * 1000;

/** manteion-go B5: every referenced dataset must exist in zeus and its TTL
 *  must outlive the plan (+5 min), else 422 dataset_missing / dataset_expiring. */
function preflightDatasets(phases: readonly PhaseSummary[]): void {
  const needed: string[] = [];
  let planMs = 0;
  for (const p of phases) {
    for (const id of datasetUnion(p)) if (!needed.includes(id)) needed.push(id);
    planMs += Math.max(0, ...p.workflows.map((w) => (w.duration_sec ?? 0) * 1000));
  }
  if (needed.length === 0) return;
  const byId = new Map(mockDatasetList().map((d) => [d.id, d]));
  const missing = needed.filter((id) => !byId.has(id));
  if (missing.length) {
    throw fail(422, `dataset(s) not found in zeus: ${missing.join(", ")}`, {
      code: "dataset_missing",
      dataset_ids: missing,
    });
  }
  const deadline = Date.now() + planMs + PLAN_SLACK_MS;
  const expiring = needed.filter((id) => {
    const ds = byId.get(id);
    const at = ds ? datasetExpiresAt(ds) : null;
    return at !== null && at.getTime() <= deadline;
  });
  if (expiring.length) {
    throw fail(422, `dataset(s) expire before the plan would finish: ${expiring.join(", ")}`, {
      code: "dataset_expiring",
      dataset_ids: expiring,
    });
  }
}

const fail = (status: number, message: string, body: Record<string, unknown> = {}) =>
  new ApiError(status, "mock://manteion", { error: message, ...body }, message);
const notFound = (what: string) => fail(404, `${what} not found`);

const find = (id: string) => store.find((e) => e.id === id);
function must(id: string): Experiment {
  const e = find(id);
  if (!e) throw notFound("experiment");
  return e;
}
function mustPhase(phaseId: string): { exp: Experiment; phase: PhaseSummary } {
  for (const exp of store) {
    const phase = exp.phases.find((p) => p.id === phaseId);
    if (phase) return { exp, phase };
  }
  throw notFound("phase");
}

// ─── Reads ─────────────────────────────────────────────────────────────

export function mockList(): Experiment[] {
  return store.map(cloneExperiment);
}
export function mockGet(id: string): Experiment {
  return cloneExperiment(must(id));
}
export function mockGetPhase(experimentId: string, phaseId: string): PhaseSummary {
  const phase = must(experimentId).phases.find((p) => p.id === phaseId);
  if (!phase) throw notFound("phase");
  return clonePhase(phase);
}
export function mockPhaseResultsFor(phaseId: string): PhaseResults | undefined {
  return results.get(phaseId);
}

/** Services an experiment touches: frozen services ∪ services of its rules. */
export function footprint(e: Experiment): string[] {
  const out = new Set<string>();
  for (const p of e.phases) {
    for (const f of p.frozen_services) out.add(f.service);
    for (const s of mockServicesForRules(p.rule_ids)) out.add(s);
  }
  return [...out];
}

// ─── Create / delete ───────────────────────────────────────────────────

export function mockCreate(input: CreateExperimentInput): Experiment {
  if (!input.name.trim()) throw fail(400, "name required");
  const id = nextId("exp");
  const phases = input.phases.map((ph, i) => materializePhase(id, ph, i));
  validatePhaseSet(phases);
  preflightDatasets(phases);
  const exp: Experiment = {
    id,
    name: input.name,
    description: input.description,
    hypothesis: input.hypothesis,
    status: "planned",
    targeted_services: [],
    phases,
    created_by: input.created_by,
    created_at: now(),
  };
  exp.targeted_services = footprint(exp);
  store = [exp, ...store];
  return cloneExperiment(exp);
}

function materializePhase(
  experimentId: string,
  ph: CreatePhaseInput,
  position: number,
): PhaseSummary {
  if (!ph.name.trim()) throw fail(400, "phase name required");
  for (const w of ph.workflows) {
    if (!(w.vus > 0)) throw fail(400, "phase workflow: vus must be > 0");
    if (!(w.duration_sec > 0)) throw fail(400, "phase workflow: duration_sec must be > 0");
  }
  for (const f of ph.frozen_services) {
    if (!f.mutation_policy) throw fail(400, "cachebox config: mutation_policy required");
  }
  return {
    id: nextId("ph"),
    experiment_id: experimentId,
    name: ph.name,
    position: ph.position ?? position,
    status: "pending",
    persist_cache: ph.persist_cache ?? false,
    workflows: ph.workflows.map((w) => ({ ...w })),
    frozen_services: ph.frozen_services.map((f) => ({ ...f })),
    rule_ids: [...ph.rule_ids],
  };
}

/** UNIQUE(experiment_id, name) and INV-2 (one key strategy per frozen service). */
function validatePhaseSet(phases: PhaseSummary[]) {
  const names = new Set<string>();
  const strategies = new Map<string, string>();
  for (const p of phases) {
    if (names.has(p.name)) throw fail(409, `phase name ${p.name} already exists in experiment`);
    names.add(p.name);
    for (const f of p.frozen_services) {
      const ks = f.key_strategy || "canonical_v2";
      const prev = strategies.get(f.service);
      if (prev && prev !== ks) {
        throw fail(
          400,
          `cache-box key strategy for ${f.service} differs across phases (${prev} vs ${ks})`,
        );
      }
      strategies.set(f.service, ks);
    }
  }
}

export function mockDelete(id: string): void {
  const e = must(id);
  if (e.status === "running") throw fail(409, "experiment is running; stop or cancel it first");
  clearTimer(id);
  store = store.filter((x) => x.id !== id);
}

export function mockCreatePhase(experimentId: string, input: CreatePhaseInput): PhaseSummary {
  const e = must(experimentId);
  if (e.status !== "planned") throw fail(409, `experiment is ${e.status}, not planned`);
  const maxPos = e.phases.reduce((m, p) => Math.max(m, p.position ?? 0), -1);
  const phase = materializePhase(e.id, input, maxPos + 1);
  validatePhaseSet([...e.phases, phase]);
  preflightDatasets([phase]);
  e.phases = [...e.phases, phase].sort(byPosition);
  e.targeted_services = footprint(e);
  return clonePhase(phase);
}

export function mockDeletePhase(experimentId: string, phaseId: string): void {
  const e = must(experimentId);
  if (e.status !== "planned") throw fail(409, `experiment is ${e.status}, not planned`);
  if (!e.phases.some((p) => p.id === phaseId)) throw notFound("phase");
  e.phases = e.phases.filter((p) => p.id !== phaseId);
  e.targeted_services = footprint(e);
}

// ─── Lifecycle ─────────────────────────────────────────────────────────

export function mockStart(id: string): Experiment {
  const e = must(id);
  if (e.status !== "planned") throw fail(409, `experiment is ${e.status}, not planned`);
  const mine = footprint(e);
  for (const other of store) {
    if (other.id === id || other.status !== "running") continue;
    const overlap = footprint(other).filter((s) => mine.includes(s));
    if (overlap.length) {
      throw fail(
        409,
        `service footprint overlaps running experiment ${other.id}: ${overlap.join(", ")}`,
        { code: "service_overlap", running_experiment_id: other.id, services: overlap },
      );
    }
  }
  preflightDatasets(e.phases.filter((p) => p.status === "pending"));
  e.status = "running";
  e.started_at = now();
  advance(e);
  return cloneExperiment(e);
}

export function mockPause(id: string): ExperimentStatus | "paused" {
  const e = must(id);
  if (e.status !== "running") throw fail(409, `experiment is ${e.status}, not running`);
  const cur = e.phases.find((p) => p.status === "running" || p.status === "draining");
  if (cur) cur.status = "paused";
  clearTimer(id);
  return "paused";
}

export function mockResume(id: string): ExperimentStatus {
  const e = must(id);
  if (e.status !== "running") throw fail(409, `experiment is ${e.status}, not running`);
  const cur = e.phases.find((p) => p.status === "paused");
  if (!cur) throw fail(409, "experiment is not paused");
  cur.status = "running";
  schedule(id);
  return "running";
}

export function mockCancel(id: string): ExperimentStatus {
  return finishExperiment(must(id), "cancelled");
}

export function mockStop(id: string, status?: string): ExperimentStatus {
  const final = (status || "cancelled") as ExperimentStatus;
  if (!["completed", "failed", "cancelled"].includes(final)) {
    throw fail(400, `invalid final status ${status}`);
  }
  return finishExperiment(must(id), final);
}

function finishExperiment(e: Experiment, status: ExperimentStatus): ExperimentStatus {
  if (e.status !== "running") throw fail(409, `experiment is ${e.status}, not running`);
  clearTimer(e.id);
  for (const p of e.phases) {
    if (isActive(p.status)) finishPhase(p, status === "completed" ? "completed" : "skipped");
    else if (p.status === "pending") p.status = "skipped";
  }
  e.status = status;
  e.completed_at = now();
  return status;
}

export function mockStartPhase(experimentId: string, phaseId: string): void {
  const e = must(experimentId);
  if (e.status !== "running") throw fail(409, `experiment is ${e.status}, not running`);
  const phase = e.phases.find((p) => p.id === phaseId);
  if (!phase) throw notFound("phase");
  if (phase.status !== "pending") throw fail(409, `phase is ${phase.status}, not pending`);
  if (e.phases.some((p) => isActive(p.status))) throw fail(409, "another phase is in flight");
  startPhase(phase);
  schedule(e.id);
}

export function mockPausePhase(phaseId: string): void {
  const { exp, phase } = mustPhase(phaseId);
  if (phase.status !== "running" && phase.status !== "draining") {
    throw fail(409, `phase is ${phase.status}, not running`);
  }
  phase.status = "paused";
  clearTimer(exp.id);
}

export function mockResumePhase(phaseId: string): void {
  const { exp, phase } = mustPhase(phaseId);
  if (phase.status !== "paused") throw fail(409, `phase is ${phase.status}, not paused`);
  phase.status = "running";
  schedule(exp.id);
}

export function mockStopPhase(phaseId: string, status?: string): void {
  const final = (status || "completed") as PhaseStatus;
  if (!["completed", "failed", "skipped"].includes(final)) {
    throw fail(400, `invalid final status ${status}`);
  }
  const { exp, phase } = mustPhase(phaseId);
  if (!isActive(phase.status)) throw fail(409, `phase is ${phase.status}, not in flight`);
  finishPhase(phase, final);
  clearTimer(exp.id);
  if (final === "failed") {
    exp.status = "failed";
    exp.completed_at = now();
    exp.failure_reason = `phase ${phase.name} stopped as failed by operator`;
    for (const p of exp.phases) if (p.status === "pending") p.status = "skipped";
    return;
  }
  advance(exp);
}

// ─── The orchestrator loop ─────────────────────────────────────────────

/** Start the next pending phase, or complete the experiment. */
function advance(e: Experiment): void {
  const next = [...e.phases].sort(byPosition).find((p) => p.status === "pending");
  if (!next) {
    clearTimer(e.id);
    e.status = "completed";
    e.completed_at = now();
    return;
  }
  startPhase(next);
  schedule(e.id);
}

/** One orchestrator step: a running phase drains first when it froze
 *  services, a draining one completes, then the next pending phase starts. */
function tick(id: string): void {
  const e = find(id);
  if (!e || e.status !== "running") return;
  const cur = e.phases.find((p) => p.status === "running" || p.status === "draining");
  if (cur?.status === "running" && cur.frozen_services.length > 0) {
    cur.status = "draining";
    schedule(id);
    return;
  }
  if (cur) finishPhase(cur, "completed");
  advance(e);
}

function schedule(id: string): void {
  clearTimer(id);
  timers.set(
    id,
    setTimeout(() => tick(id), MOCK_PHASE_STEP_MS),
  );
}
function clearTimer(id: string): void {
  const t = timers.get(id);
  if (t) clearTimeout(t);
  timers.delete(id);
}

function startPhase(p: PhaseSummary): void {
  p.status = "running";
  p.started_at = now();
  p.completed_at = undefined;
  p.workflows = p.workflows.map((w, i) => stampZeusIds(w, p.id, i));
}
function stampZeusIds(w: PhaseWorkflow, phaseId: string, i: number): PhaseWorkflow {
  return {
    ...w,
    zeus_run_id: w.zeus_run_id ?? `run-${phaseId}-${i}`,
    ...(w.target_url ? { zeus_attack_id: w.zeus_attack_id ?? `atk-${phaseId}-${i}` } : {}),
  };
}
function finishPhase(p: PhaseSummary, status: PhaseStatus): void {
  p.status = status;
  p.completed_at = now();
  if (status === "completed") results.set(p.id, synthesizeResults(p));
}

/** Plausible harvested numbers: a faulted phase is slower and errors more,
 *  a frozen (replayed) phase is faster than a baseline. */
function synthesizeResults(p: PhaseSummary): PhaseResults {
  const frozen = p.frozen_services.length > 0;
  const faulted = p.rule_ids.length > 0;
  const scale = faulted ? 2.4 : frozen ? 0.4 : 1;
  const error_rate = faulted ? 0.018 : 0.001;
  const workflow_results = p.workflows.map((w, i) => {
    const seconds = w.duration_sec ?? 60;
    const rps = ((w.vus ?? 1) * 4) / (faulted ? 1.6 : 1);
    const request_count = Math.round(rps * seconds);
    const base = (12_000 + 1_500 * i) * scale;
    return {
      phase_id: p.id,
      workflow_id: w.workflow_id,
      request_count,
      error_count: Math.round(request_count * error_rate),
      error_rate,
      throughput_rps: rps,
      latency_p50_us: Math.round(base),
      latency_p95_us: Math.round(base * 2.3),
      latency_p99_us: Math.round(base * 3.3),
      latency_p999_us: Math.round(base * 5),
      computed_at: now(),
    };
  });
  return {
    workflow_results,
    service_latency: [],
    service_cache: p.frozen_services.map((f) => ({
      phase_id: p.id,
      service: f.service,
      cache_hit_rate: 0.97,
      cache_exact_match: 0.9,
      cache_staleness: 0.05,
      request_count: 1_000,
      recorded_entry_count: 800,
    })),
    verdict: frozen
      ? {
          verdict: "VALID",
          collision_rate: 0.001,
          replay_age_max_ms: 1_200,
          replay_age_mean_ms: 300,
        }
      : undefined,
    drain: frozen ? undefined : { status: "clean" },
  };
}

// ─── Flat phase views (GET /api/v1/phases…) ────────────────────────────

export function mockListPhases(): PhaseListItem[] {
  return store.flatMap((e) =>
    e.phases.map((p) => ({
      id: p.id,
      experiment_id: e.id,
      experiment_name: e.name,
      name: p.name,
      position: p.position,
      workflow_ids: p.workflows.map((w) => w.workflow_id),
      frozen_service_count: p.frozen_services.length,
      status: p.status,
      started_at: p.started_at,
      completed_at: p.completed_at,
    })),
  );
}

export function mockPhaseDetail(phaseId: string): PhaseDetail {
  const { exp, phase } = mustPhase(phaseId);
  const wr = results.get(phaseId)?.workflow_results ?? [];
  const total_request_count = wr.reduce((n, r) => n + r.request_count, 0);
  const total_error_count = wr.reduce((n, r) => n + r.error_count, 0);
  return {
    ...clonePhase(phase),
    experiment_id: exp.id,
    experiment_name: exp.name,
    workflow_results: wr.map((r) => ({ ...r })),
    total_request_count,
    total_error_count,
    overall_error_rate: total_request_count ? total_error_count / total_request_count : 0,
  };
}

export function mockPhaseFaults(phaseId: string): PhaseFaults {
  const { phase } = mustPhase(phaseId);
  const started = phase.started_at;
  const ended = phase.completed_at;
  const events = started
    ? [
        ...phase.frozen_services.map((f, i) => ({
          id: `fe-${phase.id}-cb-${i}`,
          phase_id: phase.id,
          source: "cachebox",
          service: f.service,
          kind: `cachebox:${f.mode}`,
          started_at: started,
          ended_at: ended,
        })),
        ...phase.rule_ids.map((ruleId, i) => ({
          id: `fe-${phase.id}-rule-${i}`,
          phase_id: phase.id,
          source: "rule",
          service: mockServicesForRules([ruleId])[0],
          kind: "rule:push",
          detail: { rule_id: ruleId },
          started_at: started,
          ended_at: ended,
        })),
      ]
    : [];
  return {
    frozen_services: phase.frozen_services.map((f) => ({ ...f })),
    phase_rules: phase.rule_ids.map((rule_id, position) => ({
      phase_id: phase.id,
      rule_id,
      position,
    })),
    fault_events: events,
  };
}

// ─── Zeus runs (one per phase workflow) ────────────────────────────────

function findRun(runId: string): { exp: Experiment; phase: PhaseSummary; workflow: PhaseWorkflow } {
  for (const exp of store) {
    for (const phase of exp.phases) {
      const workflow = phase.workflows.find((w) => w.zeus_run_id === runId);
      if (workflow) return { exp, phase, workflow };
    }
  }
  throw fail(404, "run not found");
}

const zeusStatus: Record<PhaseStatus, string> = {
  pending: "pending",
  running: "running",
  paused: "running",
  draining: "completed",
  completed: "completed",
  failed: "failed",
  skipped: "stopped",
};

export function mockZeusRun(runId: string): ZeusRun {
  const { exp, phase, workflow } = findRun(runId);
  return {
    id: runId,
    workflow_id: workflow.workflow_id,
    experiment_id: exp.id,
    status: zeusStatus[phase.status],
    workflow_label: phase.name,
    k6_job_name: `k6-${runId}`,
    started_at: phase.started_at,
    ended_at:
      phase.status === "running" || phase.status === "paused" ? undefined : phase.completed_at,
    reason: phase.status === "failed" ? "k6 exited with code 99 (threshold breached)" : undefined,
  };
}

export function mockZeusRunStats(runId: string): ZeusRunStats | undefined {
  const { phase, workflow } = findRun(runId);
  const r = results
    .get(phase.id)
    ?.workflow_results.find((x) => x.workflow_id === workflow.workflow_id);
  if (!r) return undefined;
  const duration_ms = (workflow.duration_sec ?? 60) * 1000;
  return {
    run_id: runId,
    workflow_id: workflow.workflow_id,
    status: "completed",
    duration_ms,
    iterations: Math.round(r.request_count / 4),
    requests_sent: r.request_count,
    requests_ok: r.request_count - r.error_count,
    requests_dropped: 0,
    latency_p50_us: r.latency_p50_us,
    latency_p95_us: r.latency_p95_us,
    latency_p99_us: r.latency_p99_us,
    finalized_at: phase.completed_at,
  };
}
