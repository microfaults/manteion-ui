import { Topbar } from "@/components/layout/topbar";
import { ObservabilityCard } from "@/components/observability-card";
import { StatCard } from "@/components/stat-card";
import { StatusDot } from "@/components/status-dot";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { experimentsApi, rulesApi, servicesApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { bucketFaultRules } from "@/lib/fault-categorize";
import {
  type TimeSeriesPoint,
  fetchDashboardPrometheusBundle,
  fetchServiceNamesFromMetrics,
} from "@/lib/prometheus";
import { buildServicesPanelRows, displayServiceName } from "@/lib/service-panel";
import { formatDurationMs, formatRelative } from "@/lib/utils";
import type { ExperimentStatus, SDKInstance } from "@/types/api";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";

export const Route = createFileRoute("/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  const [chartRangeMin, setChartRangeMin] = useState<5 | 15 | 30 | 60>(30);
  const [chartsLive, setChartsLive] = useState(false);

  const rules = useQuery({
    queryKey: ["rules"],
    queryFn: rulesApi.listRules,
    retry: false,
  });
  const instances = useQuery({
    queryKey: ["sdk-instances"],
    queryFn: servicesApi.listSDKInstances,
    retry: false,
  });
  const experiments = useQuery({
    queryKey: ["experiments"],
    queryFn: experimentsApi.listExperimentsLenient,
    retry: false,
  });
  const servicesFromMetrics = useQuery({
    queryKey: ["metrics", "service-names"],
    queryFn: ({ signal }) => fetchServiceNamesFromMetrics(signal),
    /** Merge with SDK list so traffic-only services (e.g. currencyservice) appear after shop use. */
    enabled: !instances.isLoading,
    refetchInterval: 30_000,
    retry: false,
  });

  /** Single bundle avoids nine parallel queries each hitting refetchInterval → React Query abort → "(canceled)". */
  const metricRefreshMs = chartsLive ? 8_000 : 12_000;
  const dashboardMetrics = useQuery({
    queryKey: ["metrics", "dashboard-bundle", chartRangeMin],
    queryFn: ({ signal }) => fetchDashboardPrometheusBundle(chartRangeMin, signal),
    refetchInterval: metricRefreshMs,
    staleTime: chartsLive ? 4_000 : 8_000,
    placeholderData: keepPreviousData,
    retry: false,
  });

  const alive = instances.data?.filter((i) => i.status === "alive").length ?? 0;
  const stale = instances.data?.filter((i) => i.status === "stale").length ?? 0;
  const statusMissing = instances.data?.filter((i) => i.status == null).length ?? 0;
  const failingServices = new Set(
    instances.data?.filter((i) => i.status === "dead").map((i) => i.service) ?? [],
  ).size;

  const enabledRulesList = useMemo(() => rules.data?.filter((r) => r.enabled) ?? [], [rules.data]);
  const activeFaults = enabledRulesList.length;
  const faultBuckets = useMemo(() => bucketFaultRules(enabledRulesList), [enabledRulesList]);

  const runningExps = experiments.data?.filter((e) => e.status === "running") ?? [];
  const plannedExps = experiments.data?.filter((e) => e.status === "planned") ?? [];
  const activeExperiments = runningExps.length;
  const queuedExperiments = plannedExps.length;
  const runningNames =
    runningExps.length > 0 ? runningExps.map((e) => e.name).join(" · ") : "none running";
  const nextQueued = plannedExps[0]?.name;

  const grafanaBase = import.meta.env.VITE_GRAFANA_URL as string | undefined;

  const servicesPanel = useMemo(
    () =>
      buildServicesPanelRows(
        instances.data,
        servicesFromMetrics.data,
        dashboardMetrics.data?.perServiceCallRate,
        {
          /* isLoading stays true during background refetch; isPending is only before first successful data. */
          ratesLoading: dashboardMetrics.isPending,
          ratesError: dashboardMetrics.isError,
        },
      ),
    [
      instances.data,
      servicesFromMetrics.data,
      dashboardMetrics.data?.perServiceCallRate,
      dashboardMetrics.isPending,
      dashboardMetrics.isError,
    ],
  );

  const rangeLabel = `last ${chartRangeMin}m`;

  return (
    <>
      <Topbar breadcrumbs={["Dashboard"]} />

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <p className="-mt-2 mb-6 max-w-2xl text-sm text-muted-foreground">
          Platform health at a glance — services, active experiments, active faults.
        </p>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <StatCard
            label="Failing services"
            value={failingServices}
            footer={sdkInstancesFooter(
              instances.isLoading,
              instances.isError,
              instances.data,
              alive,
              stale,
              statusMissing,
            )}
          />
          <StatCard
            label="Active experiments"
            value={activeExperiments}
            footer={experiments.data ? runningNames : "—"}
          />
          <StatCard
            label="Experiments queued"
            value={queuedExperiments}
            footer={nextQueued ? `next: ${nextQueued}` : "—"}
          />
          <StatCard
            label="Active faults"
            value={activeFaults}
            footer={`${faultBuckets.inline} inline · ${faultBuckets.network} network · ${faultBuckets.cacheBox} cache-box`}
          />
        </div>

        <section className="mt-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold">Live observability</h2>
              <p className="text-sm text-muted-foreground">
                Grafana panels: online-boutique namespace
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1">
              {([5, 15, 30, 60] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-label={`Show last ${m === 60 ? "1 hour" : `${m} minutes`}`}
                  aria-pressed={chartRangeMin === m && !chartsLive}
                  onClick={() => {
                    setChartRangeMin(m);
                    setChartsLive(false);
                  }}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    chartRangeMin === m && !chartsLive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  {m === 60 ? "1h" : `${m}m`}
                </button>
              ))}
              <button
                type="button"
                aria-label="Enable live auto-refresh (8 second interval)"
                aria-pressed={chartsLive}
                onClick={() => setChartsLive(true)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  chartsLive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                live
              </button>
            </div>
          </div>
          {dashboardMetrics.isError ? (
            <p className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              Prometheus unreachable or query failed:{" "}
              {prometheusErrorMessage(dashboardMetrics.error)}. Ensure{" "}
              <code className="rounded bg-muted px-1 font-mono text-xs">
                kubectl port-forward svc/prometheus 9091:9090
              </code>{" "}
              is running and{" "}
              <code className="rounded bg-muted px-1 font-mono text-xs">VITE_PROMETHEUS_URL</code>{" "}
              points at your dev proxy (e.g.{" "}
              <code className="font-mono text-xs">http://localhost:5173/prometheus</code>).
            </p>
          ) : null}
          <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <ObservabilityCard
              title="Requests / sec"
              subtitle={`platform total · ${rangeLabel}`}
              value={formatPlatformRps(dashboardMetrics.data?.requestRate)}
              trend={dashboardMetrics.data?.requestRateRange}
              trendClassName="bg-blue-500"
              grafanaUrl={makeGrafanaUrl(grafanaBase, "requests-sec")}
            />
            <ObservabilityCard
              title="p99 latency"
              subtitle={`checkout workflow · ${rangeLabel}`}
              value={`${Math.round(dashboardMetrics.data?.p99Latency ?? 0)} ms`}
              trend={dashboardMetrics.data?.p99LatencyRange}
              trendClassName="bg-red-500"
              grafanaUrl={makeGrafanaUrl(grafanaBase, "p99-latency")}
            />
            <ObservabilityCard
              title="Error rate"
              subtitle={`OTel span errors + HTTP 4xx/5xx · ${rangeLabel}`}
              value={`${(dashboardMetrics.data?.errorRate ?? 0).toFixed(2)}%`}
              valueHint={trendQualifier(dashboardMetrics.data?.errorRateRange, "stable", "spiky")}
              trend={dashboardMetrics.data?.errorRateRange}
              trendClassName="bg-zinc-500"
              grafanaUrl={makeGrafanaUrl(grafanaBase, "error-rate")}
            />
            <ObservabilityCard
              title="Cache-box hit rate"
              subtitle={`productcatalog · replay · ${rangeLabel}`}
              value={`${(dashboardMetrics.data?.cacheHitRate ?? 0).toFixed(1)}%`}
              valueHint={trendQualifier(
                dashboardMetrics.data?.cacheHitRateRange,
                "active",
                "variable",
              )}
              trend={dashboardMetrics.data?.cacheHitRateRange}
              trendClassName="bg-blue-500"
              grafanaUrl={makeGrafanaUrl(grafanaBase, "cache-hit-rate")}
            />
          </div>
        </section>

        <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardHeader className="flex-row items-end justify-between">
              <div>
                <CardTitle className="text-base">Recent experiments</CardTitle>
                <p className="text-xs text-muted-foreground">Last 7 days</p>
              </div>
              <Link to="/experiments" className="text-sm text-primary hover:underline">
                View all →
              </Link>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Experiment</TableHead>
                    <TableHead>Workflows</TableHead>
                    <TableHead>Phase</TableHead>
                    <TableHead>Started</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead className="text-right">P99</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {experiments.isLoading ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-muted-foreground">
                        Loading…
                      </TableCell>
                    </TableRow>
                  ) : null}
                  {experiments.isError ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-muted-foreground">
                        {experimentsLoadErrorMessage(experiments.error)}
                      </TableCell>
                    </TableRow>
                  ) : null}
                  {experiments.data?.slice(0, 8).map((e) => {
                    const latestPhase = e.phases[e.phases.length - 1];
                    const durationMs =
                      e.started_at && e.completed_at
                        ? new Date(e.completed_at).getTime() - new Date(e.started_at).getTime()
                        : null;
                    const p99us = latestPhase?.metrics?.p99_us;
                    const p99Display = p99us != null ? `${Math.round(p99us / 1000)} ms` : "—";
                    const wf = e.workflow_ids?.length > 0 ? `${e.workflow_ids.length}` : "—";
                    const { dotStatus, label } = experimentStatusPresentation(e.status);
                    return (
                      <TableRow key={e.id}>
                        <TableCell className="font-medium">{e.name}</TableCell>
                        <TableCell className="font-mono text-xs">{wf}</TableCell>
                        <TableCell className="font-mono text-xs">
                          {latestPhase?.name ?? "—"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatRelative(e.started_at)}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {formatDurationMs(durationMs)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">{p99Display}</TableCell>
                        <TableCell>
                          <StatusDot status={dotStatus} label={label} />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Services{" "}
                <span className="font-normal text-muted-foreground">
                  · {servicesPanel.total} total
                </span>
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                SDK registrations from manteion (grouped by service), plus any other{" "}
                <code className="font-mono">service_name</code> seen in Prometheus{" "}
                <code className="font-mono">calls_total</code> (traffic-only rows show as unknown
                until they register).
              </p>
            </CardHeader>
            <CardContent className="max-h-[28rem] space-y-0 overflow-y-auto pr-1">
              {instances.isLoading ? (
                <p className="text-xs text-muted-foreground">Loading SDK instances…</p>
              ) : null}
              {servicesPanel.rows.length > 0 ? (
                <ul className="divide-y divide-border">
                  {servicesPanel.rows.map((row) => (
                    <li
                      key={row.key}
                      className="flex items-center justify-between gap-3 py-2.5 first:pt-0"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-medium">{displayServiceName(row.name)}</div>
                        <div className="text-xs text-muted-foreground">
                          {row.source === "sdk" ? (
                            <>
                              {row.instanceCount > 1 ? `${row.instanceCount} pods · ` : ""}
                              {row.version === "mixed"
                                ? "mixed versions"
                                : row.version
                                  ? `v${row.version}`
                                  : "v?"}
                            </>
                          ) : (
                            <>Prometheus traffic only (no SDK registration)</>
                          )}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <span className="text-[11px] tabular-nums text-muted-foreground">
                          {row.hint}
                        </span>
                        <StatusDot status={row.dotStatus} />
                      </div>
                    </li>
                  ))}
                </ul>
              ) : null}
              {!instances.isLoading && servicesFromMetrics.isLoading ? (
                <p className="text-xs text-muted-foreground">
                  {(instances.data?.length ?? 0) === 0
                    ? "Loading services from metrics…"
                    : "Loading Prometheus service names to merge…"}
                </p>
              ) : null}
              {servicesPanel.rows.length === 0 &&
              !instances.isLoading &&
              !servicesFromMetrics.isLoading ? (
                <p className="text-xs text-muted-foreground">
                  {instances.isError
                    ? "Could not reach manteion — check VITE_MANTEION_URL and that manteion-go is running."
                    : "No services yet. Run shop traffic for Prometheus calls_total, or register SDK instances from instrumented services."}
                </p>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

/** Bundled dashboard in `microservices-demo-go/kubernetes-manifests/grafana-dashboards.yaml`. */
const GRAFANA_OVERVIEW_UID = "atropos-overview";

/** Panel IDs on that dashboard (not slugs — `viewPanel` must be numeric). */
const GRAFANA_PANEL_BY_METRIC: Record<string, number | undefined> = {
  "requests-sec": 3,
  "p99-latency": 5,
  "error-rate": 6,
  /* No cache panel in the overview dashboard — open the board without deep-link. */
  "cache-hit-rate": undefined,
};

function makeGrafanaUrl(base: string | undefined, metric: string): string | undefined {
  if (!base) return undefined;
  const trimmed = base.replace(/\/+$/, "");
  const panel = GRAFANA_PANEL_BY_METRIC[metric];
  const q = new URLSearchParams({ orgId: "1" });
  if (typeof panel === "number" && panel > 0) q.set("viewPanel", String(panel));
  return `${trimmed}/d/${GRAFANA_OVERVIEW_UID}?${q.toString()}`;
}

function sdkInstancesFooter(
  loading: boolean,
  error: boolean,
  data: SDKInstance[] | undefined,
  alive: number,
  stale: number,
  statusMissing: number,
): string {
  if (loading) return "Loading SDK instances…";
  if (error) return "Could not load /api/v1/sdk/instances";
  if (!data?.length) return "No SDK registrations yet";
  if (statusMissing === data.length) {
    return `${data.length} instance(s) — health status not reported by manteion yet`;
  }
  if (statusMissing > 0) {
    return `${stale} degraded · ${alive} healthy · ${statusMissing} unknown`;
  }
  return `${stale} degraded · ${alive} healthy`;
}

function experimentStatusPresentation(status: ExperimentStatus): {
  dotStatus: "healthy" | "degraded" | "down" | "unknown" | "complete" | "stopped";
  label: string;
} {
  switch (status) {
    case "running":
      return { dotStatus: "healthy", label: "running" };
    case "planned":
      return { dotStatus: "degraded", label: "planned" };
    case "completed":
      return { dotStatus: "complete", label: "complete" };
    case "failed":
      return { dotStatus: "down", label: "failed" };
    case "cancelled":
      return { dotStatus: "stopped", label: "stopped" };
    default:
      return { dotStatus: "unknown", label: String(status) };
  }
}

function experimentsLoadErrorMessage(err: unknown): string {
  if (err instanceof ApiError && err.status === 404) {
    return "GET /api/v1/experiments returned 404 — manteion-go running on :8080 is missing that route (rebuild/restart manteion-go from current source), or the UI proxy target is wrong.";
  }
  if (err instanceof ApiError) {
    return `Could not load experiments (HTTP ${err.status}).`;
  }
  return "Could not load experiments from manteion.";
}

/** Span-metric totals are often under 10 for manual browsing; avoid rounding away signal. */
function formatPlatformRps(r: number | undefined): string {
  const x = r ?? 0;
  if (!Number.isFinite(x) || x <= 0) return "0 RPS";
  if (x < 10) return `${x.toFixed(1)} RPS`;
  return `${Math.round(x)} RPS`;
}

function prometheusErrorMessage(err: unknown): string {
  // AbortSignal.timeout() throws DOMException("TimeoutError"); user cancellations
  // throw Error("AbortError"). Distinguish them so the dashboard banner is honest
  // about whether the query exceeded the budget vs. was cancelled by a re-render.
  if (err instanceof DOMException && err.name === "TimeoutError") return "request timed out";
  if (err instanceof Error && err.name === "AbortError") return "query was cancelled";
  if (err instanceof Error) return err.message;
  return String(err);
}

function trendQualifier(
  trend: TimeSeriesPoint[] | undefined,
  flatWord: string,
  varyWord: string,
): string | undefined {
  if (!trend?.length || trend.length < 2) return flatWord;
  const vals = trend.map((p) => p.value);
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  if (mean === 0) return flatWord;
  const variance = vals.reduce((acc, v) => acc + (v - mean) ** 2, 0) / vals.length;
  const cv = Math.sqrt(variance) / Math.abs(mean);
  return cv < 0.2 ? flatWord : varyWord;
}
