import { Topbar } from "@/components/layout/topbar";
import { ObservabilityCard } from "@/components/observability-card";
import { MetricRangeSelector } from "@/components/observability/metric-range-selector";
import { PrometheusErrorBanner } from "@/components/observability/prometheus-error-banner";
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
import { experimentsApi, faultsApi, rulesApi, servicesApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { bucketFaultRules, faultBucketsLabel } from "@/lib/fault-categorize";
import { grafanaDashboardUrl } from "@/lib/grafana";
import {
  type TimeSeriesPoint,
  fetchDashboardPrometheusBundle,
  fetchServiceNamesFromMetrics,
} from "@/lib/prometheus";
import { specLookup } from "@/lib/rule-target";
import { type ServiceHealth, summarizeServiceHealth } from "@/lib/service-health";
import { buildServicesPanelRows, displayServiceName } from "@/lib/service-panel";
import { formatDurationMs, formatFinite, formatRelative } from "@/lib/utils";
import { ACTIVE_PHASE_STATUSES, type ExperimentStatus, TERMINAL_PHASE_STATUSES } from "@/types/api";
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
  const faultSpecs = useQuery({
    queryKey: ["fault-specs"],
    queryFn: faultsApi.listFaultSpecs,
    staleTime: 60_000,
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

  const serviceHealth = useMemo(
    () => summarizeServiceHealth(instances.data ?? []),
    [instances.data],
  );
  const specsById = useMemo(() => specLookup(faultSpecs.data), [faultSpecs.data]);

  const enabledRulesList = useMemo(() => rules.data?.filter((r) => r.enabled) ?? [], [rules.data]);
  const activeFaults = enabledRulesList.length;
  const faultBuckets = useMemo(
    () => bucketFaultRules(enabledRulesList, specsById),
    [enabledRulesList, specsById],
  );

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
            value={serviceHealth.failing}
            footer={serviceHealthFooter(
              instances.isLoading,
              instances.isError,
              instances.data?.length ?? 0,
              serviceHealth,
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
            footer={faultBucketsLabel(faultBuckets)}
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
            <MetricRangeSelector
              value={chartRangeMin === 60 ? "1h" : `${chartRangeMin}m`}
              live={chartsLive}
              onChange={(token) => {
                setChartRangeMin(RANGE_MIN_BY_TOKEN[token] ?? 30);
                setChartsLive(false);
              }}
              onLive={() => setChartsLive(true)}
            />
          </div>
          {dashboardMetrics.isError ? (
            <div className="mt-3">
              <PrometheusErrorBanner
                message={`Prometheus unreachable or query failed: ${prometheusErrorMessage(
                  dashboardMetrics.error,
                )}. Ensure the port-forward below is running and VITE_PROMETHEUS_URL points at your dev proxy (e.g. http://localhost:5173/prometheus).`}
                hint="kubectl port-forward svc/prometheus 9091:9090"
              />
            </div>
          ) : null}
          <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <ObservabilityCard
              title="Requests / sec"
              subtitle={`platform total · ${rangeLabel}`}
              value={formatPlatformRps(dashboardMetrics.data?.requestRate)}
              trend={dashboardMetrics.data?.requestRateRange}
              color="blue"
              grafanaUrl={grafanaDashboardUrl(grafanaBase, "requests-sec")}
            />
            <ObservabilityCard
              title="p99 latency"
              subtitle={`checkout workflow · ${rangeLabel}`}
              value={formatFinite(dashboardMetrics.data?.p99Latency, (v) => `${Math.round(v)} ms`)}
              trend={dashboardMetrics.data?.p99LatencyRange}
              color="red"
              grafanaUrl={grafanaDashboardUrl(grafanaBase, "p99-latency")}
            />
            <ObservabilityCard
              title="Error rate"
              subtitle={`OTel span errors + HTTP 4xx/5xx · ${rangeLabel}`}
              value={formatFinite(dashboardMetrics.data?.errorRate, (v) => `${v.toFixed(2)}%`)}
              valueHint={trendQualifier(dashboardMetrics.data?.errorRateRange, "stable", "spiky")}
              trend={dashboardMetrics.data?.errorRateRange}
              trendClassName="bg-muted-foreground"
              grafanaUrl={grafanaDashboardUrl(grafanaBase, "error-rate")}
            />
            <ObservabilityCard
              title="Cache-box hit rate"
              subtitle={`productcatalog · replay · ${rangeLabel}`}
              value={formatFinite(dashboardMetrics.data?.cacheHitRate, (v) => `${v.toFixed(1)}%`)}
              valueHint={trendQualifier(
                dashboardMetrics.data?.cacheHitRateRange,
                "active",
                "variable",
              )}
              trend={dashboardMetrics.data?.cacheHitRateRange}
              color="blue"
              grafanaUrl={grafanaDashboardUrl(grafanaBase, "cache-hit-rate")}
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
                    <TableHead className="text-right">Progress</TableHead>
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
                    // The phase in flight, else the last one in plan order.
                    const currentPhase =
                      e.phases.find((p) => ACTIVE_PHASE_STATUSES.has(p.status)) ??
                      e.phases[e.phases.length - 1];
                    const durationMs =
                      e.started_at && e.completed_at
                        ? new Date(e.completed_at).getTime() - new Date(e.started_at).getTime()
                        : null;
                    const donePhases = e.phases.filter((p) =>
                      TERMINAL_PHASE_STATUSES.has(p.status),
                    );
                    const progress = e.phases.length
                      ? `${donePhases.length}/${e.phases.length}`
                      : "—";
                    const workflowIds = experimentsApi.workflowIdsForExperiment(e);
                    const wf = workflowIds.length > 0 ? `${workflowIds.length}` : "—";
                    const { dotStatus, label } = experimentStatusPresentation(e.status);
                    return (
                      <TableRow key={e.id}>
                        <TableCell className="font-medium">{e.name}</TableCell>
                        <TableCell className="font-mono text-xs">{wf}</TableCell>
                        <TableCell className="font-mono text-xs">
                          {currentPhase?.name ?? "—"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatRelative(e.started_at)}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {formatDurationMs(durationMs)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">{progress}</TableCell>
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

/** Range tokens rendered by MetricRangeSelector → minutes for the metrics bundle. */
const RANGE_MIN_BY_TOKEN: Record<string, 5 | 15 | 30 | 60> = {
  "5m": 5,
  "15m": 15,
  "30m": 30,
  "1h": 60,
};

function serviceHealthFooter(
  loading: boolean,
  error: boolean,
  registrations: number,
  health: ServiceHealth,
): string {
  if (loading) return "Loading SDK instances…";
  if (error) return "Could not load /api/v1/sdk/instances";
  if (!registrations) return "No SDK registrations yet";
  const parts = [`${health.healthy} healthy`, `${health.degraded} degraded`];
  if (health.unknown) parts.push(`${health.unknown} unknown`);
  return `${parts.join(" · ")} of ${health.services} services`;
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
