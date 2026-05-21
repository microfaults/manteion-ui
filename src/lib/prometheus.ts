/**
 * Prometheus HTTP API client — instant + range queries.
 */

/** Never fall back to VITE_MANTEION_URL — that sends PromQL to manteion and yields 404s. */
const BASE = import.meta.env.VITE_PROMETHEUS_URL ?? "http://localhost:9091";

/** Dev dashboards fire many parallel Prom queries; HTTP/1.1 caps ~6 connections/host so extras sit "(pending)". */
const MAX_PROM_CONCURRENT = 5;
let promInFlight = 0;
const promWaitQueue: Array<() => void> = [];

function promAcquire(): Promise<void> {
  if (promInFlight < MAX_PROM_CONCURRENT) {
    promInFlight++;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    promWaitQueue.push(() => {
      promInFlight++;
      resolve();
    });
  });
}

function promRelease(): void {
  promInFlight--;
  const next = promWaitQueue.shift();
  if (next) next();
}

const FETCH_TIMEOUT_MS = 25_000;

/** Combines React Query cancellation with a hard timeout so fetches do not hang forever. */
function mergeAbortSignals(external?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(FETCH_TIMEOUT_MS);
  if (!external) return timeout;
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  external.addEventListener("abort", onAbort, { once: true });
  timeout.addEventListener("abort", onAbort, { once: true });
  return ctrl.signal;
}

async function prometheusFetch(url: string, signal?: AbortSignal): Promise<Response> {
  await promAcquire();
  try {
    return await fetch(url, { signal: mergeAbortSignals(signal) });
  } finally {
    promRelease();
  }
}

interface PrometheusInstantResult {
  metric: Record<string, string>;
  value: [number, string];
}

interface PrometheusRangeResult {
  metric: Record<string, string>;
  values: [number, string][];
}

export interface TimeSeriesPoint {
  ts: number; // unix ms
  value: number;
}

export interface DashboardPrometheusBundle {
  requestRate: number;
  requestRateRange: TimeSeriesPoint[];
  p99Latency: number;
  p99LatencyRange: TimeSeriesPoint[];
  errorRate: number;
  errorRateRange: TimeSeriesPoint[];
  cacheHitRate: number;
  cacheHitRateRange: TimeSeriesPoint[];
  perServiceCallRate: Record<string, number>;
}

// ─── Raw fetchers ─────────────────────────────────────────────────────

async function queryInstant(
  promql: string,
  signal?: AbortSignal,
): Promise<PrometheusInstantResult[]> {
  const url = new URL(`${BASE}/api/v1/query`);
  url.searchParams.set("query", promql);
  const res = await prometheusFetch(url.toString(), signal);
  if (!res.ok) throw new Error(`Prometheus ${res.status}`);
  const json = await res.json();
  if (json.status !== "success") throw new Error(json.error ?? "Unknown");
  return json.data.result;
}

async function queryRange(
  promql: string,
  startSec: number,
  endSec: number,
  step = 15,
  signal?: AbortSignal,
): Promise<PrometheusRangeResult[]> {
  const url = new URL(`${BASE}/api/v1/query_range`);
  url.searchParams.set("query", promql);
  url.searchParams.set("start", String(startSec));
  url.searchParams.set("end", String(endSec));
  url.searchParams.set("step", String(step));
  const res = await prometheusFetch(url.toString(), signal);
  if (!res.ok) throw new Error(`Prometheus ${res.status}`);
  const json = await res.json();
  if (json.status !== "success") throw new Error(json.error ?? "Unknown");
  return json.data.result;
}

// ─── Helpers ──────────────────────────────────────────────────────────

function now() {
  return Math.floor(Date.now() / 1000);
}
function toPoints(values: [number, string][]): TimeSeriesPoint[] {
  return values.map(([ts, v]) => ({ ts: ts * 1000, value: Number.parseFloat(v) }));
}

/** OTel spanmetrics may expose `service.name` (dotted) or normalized `service_name` on `calls_total`. */
let cachedCallsServiceLabel: { key: string; expiresAt: number } | null = null;
const CALLS_SERVICE_LABEL_TTL_MS = 120_000;

function promByClauseLabel(labelKey: string): string {
  if (/^[a-zA-Z_:][a-zA-Z0-9_:]*$/.test(labelKey)) return labelKey;
  return `"${labelKey.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function serviceIdentityFromMetric(
  metric: Record<string, string>,
  primaryKey: string,
): string | undefined {
  const v = metric[primaryKey] ?? metric.service_name ?? metric["service.name"];
  return v && v.length > 0 ? v : undefined;
}

/**
 * Which label on `calls_total` identifies the workload (for `sum by (...)` and parsing).
 * Discovered from /api/v1/series so we match OTel prometheus exporter + collector version quirks.
 */
async function resolveCallsTotalServiceLabel(signal?: AbortSignal): Promise<string> {
  const t = Date.now();
  if (cachedCallsServiceLabel && t < cachedCallsServiceLabel.expiresAt) {
    return cachedCallsServiceLabel.key;
  }
  const end = now();
  const start = end - 36 * 3600;
  const url = new URL(`${BASE}/api/v1/series`);
  url.searchParams.set("match[]", "calls_total");
  url.searchParams.set("start", String(start));
  url.searchParams.set("end", String(end));
  let key = "service_name";
  try {
    const res = await prometheusFetch(url.toString(), signal);
    if (!res.ok) throw new Error(String(res.status));
    const json = await res.json();
    if (json.status !== "success" || !Array.isArray(json.data)) throw new Error("series");
    let series: Record<string, string>[] = json.data;
    if (series.length === 0) {
      const snap = await queryInstant("topk(20, calls_total)", signal);
      series = snap.map((r) => r.metric);
    }
    const labelKeys = new Set<string>();
    for (const s of series.slice(0, 80)) {
      for (const k of Object.keys(s)) {
        if (k !== "__name__") labelKeys.add(k);
      }
    }
    if (labelKeys.has("service_name")) key = "service_name";
    else if (labelKeys.has("service.name")) key = "service.name";
    else {
      const fallback = [...labelKeys].find(
        (k) =>
          /service/i.test(k) &&
          !/span|status|method|instance|pod|namespace|container|endpoint/i.test(k),
      );
      if (fallback) key = fallback;
    }
  } catch {
    key = "service_name";
  }
  cachedCallsServiceLabel = { key, expiresAt: t + CALLS_SERVICE_LABEL_TTL_MS };
  return key;
}

function ingestPerServiceInstant(
  rows: PrometheusInstantResult[],
  labelKey: string,
  into: Record<string, number>,
): void {
  for (const row of rows) {
    const name = serviceIdentityFromMetric(row.metric, labelKey);
    if (!name) continue;
    const v = Number.parseFloat(row.value[1]);
    if (!Number.isFinite(v)) continue;
    into[name] = (into[name] ?? 0) + v;
  }
}

/**
 * OTel spanmetrics `calls_total` uses `status_code` values like `Ok`, `Error`, `STATUS_CODE_ERROR`.
 * Using `status_code!~"2.."` (HTTP 2xx) treats every successful span as a failure → ~100% error rate.
 */
const CALLS_TOTAL_ERROR_RATE_PROMQL = `100 * (
  sum(rate(calls_total{status_code=~"(?i).*error.*"}[1m]))
  + sum(rate(calls_total{status_code=~"5.."}[1m]))
  + sum(rate(calls_total{status_code=~"4.."}[1m]))
) / clamp_min(sum(rate(calls_total[1m])), 1e-12)`;

/** Distinct workload labels from recent `calls_total` traffic (for UI merge with SDK). */
export async function fetchServiceNamesFromMetrics(signal?: AbortSignal): Promise<string[]> {
  const label = await resolveCallsTotalServiceLabel(signal);
  const r = await queryInstant(
    `group by (${promByClauseLabel(label)}) (rate(calls_total[5m]))`,
    signal,
  );
  const names = r
    .map((row) => serviceIdentityFromMetric(row.metric, label))
    .filter((s): s is string => Boolean(s));
  return [...new Set(names)].sort((a, b) => a.localeCompare(b));
}

/**
 * Single React Query fetch for the dashboard. PromQL runs **sequentially** so a refetch
 * abort only cancels one in-flight HTTP call — parallel `Promise.all` made DevTools show
 * nine "(canceled)" rows whenever React Query superseded the previous run.
 */
export async function fetchDashboardPrometheusBundle(
  rangeMinutes: number,
  signal?: AbortSignal,
): Promise<DashboardPrometheusBundle> {
  const end = now();
  const start = end - rangeMinutes * 60;
  const step = 15;

  const callsSvcLabel = await resolveCallsTotalServiceLabel(signal);

  const rr = await queryInstant("sum(rate(calls_total[1m]))", signal);
  const rrR = await queryRange("sum(rate(calls_total[1m]))", start, end, step, signal);
  const p99 = await queryInstant(
    "histogram_quantile(0.99, sum by(le) (rate(duration_milliseconds_bucket[1m])))",
    signal,
  );
  const p99R = await queryRange(
    "histogram_quantile(0.99, sum by(le) (rate(duration_milliseconds_bucket[1m])))",
    start,
    end,
    step,
    signal,
  );
  const er = await queryInstant(CALLS_TOTAL_ERROR_RATE_PROMQL, signal);
  const erR = await queryRange(CALLS_TOTAL_ERROR_RATE_PROMQL, start, end, step, signal);
  const ch = await queryInstant(
    "sum(rate(cache_box_hits_total[1m])) / sum(rate(cache_box_requests_total[1m])) * 100",
    signal,
  );
  const chR = await queryRange(
    "sum(rate(cache_box_hits_total[1m])) / sum(rate(cache_box_requests_total[1m])) * 100",
    start,
    end,
    step,
    signal,
  );
  const perSvc = await queryInstant(
    `sum by(${promByClauseLabel(callsSvcLabel)}) (rate(calls_total[1m]))`,
    signal,
  );

  const perServiceCallRate: Record<string, number> = {};
  ingestPerServiceInstant(perSvc, callsSvcLabel, perServiceCallRate);

  return {
    requestRate: Number.parseFloat(rr[0]?.value[1] ?? "0"),
    requestRateRange: toPoints(rrR[0]?.values ?? []),
    p99Latency: Number.parseFloat(p99[0]?.value[1] ?? "0"),
    p99LatencyRange: toPoints(p99R[0]?.values ?? []),
    errorRate: Number.parseFloat(er[0]?.value[1] ?? "0"),
    errorRateRange: toPoints(erR[0]?.values ?? []),
    cacheHitRate: Number.parseFloat(ch[0]?.value[1] ?? "0"),
    cacheHitRateRange: toPoints(chR[0]?.values ?? []),
    perServiceCallRate,
  };
}
