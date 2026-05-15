import { Topbar } from "@/components/layout/topbar";
import { StatCard } from "@/components/stat-card";
import { StatusDot } from "@/components/status-dot";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { runsApi } from "@/lib/api";
import { formatLatencyUs } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowUpRight, AlertCircle, RefreshCw, ArrowUpDown } from "lucide-react";
import { LiveEventTail } from "@/components/run-detail/live-event-tail";
import { RunHistogram } from "@/components/run-detail/run-histogram";
import { MOCK_EVENTS, StepStat } from "@/lib/api/runs";
import { Button } from "@/components/ui/button";
import { ColumnDef } from "@tanstack/react-table";

export const Route = createFileRoute("/runs/$runId")({
  component: RunDetailPage,
});

const columns: ColumnDef<StepStat>[] = [
  {
    accessorKey: "name",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="p-0 hover:bg-transparent font-bold"
        >
          Step
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      )
    },
    cell: ({ row }) => <div className="font-bold">{row.getValue("name")}</div>,
  },
  {
    accessorKey: "sent",
    header: () => <div className="text-right">Sent</div>,
    cell: ({ row }) => <div className="text-right text-muted-foreground">{(row.getValue("sent") as number).toLocaleString()}</div>,
  },
  {
    accessorKey: "ok",
    header: () => <div className="text-right">OK</div>,
    cell: ({ row }) => <div className="text-right text-status-healthy font-medium">{(row.getValue("ok") as number).toLocaleString()}</div>,
  },
  {
    accessorKey: "dropped",
    header: () => <div className="text-right">Dropped</div>,
    cell: ({ row }) => <div className="text-right text-status-down font-medium">{(row.getValue("dropped") as number).toLocaleString()}</div>,
  },
  {
    accessorKey: "p50_us",
    header: () => <div className="text-right">p50</div>,
    cell: ({ row }) => <div className="text-right">{formatLatencyUs(row.getValue("p50_us"))}</div>,
  },
  {
    accessorKey: "p95_us",
    header: () => <div className="text-right">p95</div>,
    cell: ({ row }) => <div className="text-right">{formatLatencyUs(row.getValue("p95_us"))}</div>,
  },
  {
    accessorKey: "p99_us",
    header: () => <div className="text-right">p99</div>,
    cell: ({ row }) => {
      const p99 = row.getValue("p99_us") as number;
      return (
        <div className={p99 > 250000 ? "text-right font-bold text-status-down" : p99 > 150000 ? "text-right font-bold text-status-degraded" : "text-right font-bold"}>
          {formatLatencyUs(p99)}
        </div>
      )
    },
  },
  {
    id: "variants",
    header: () => <div className="text-center">Variant Split</div>,
    cell: ({ row }) => {
      const variants = row.original.variants;
      return (
        <div className="flex justify-center gap-1">
          {variants?.map(v => (
            <div key={v.name} className="flex flex-col items-center justify-center size-10 rounded bg-blue-50 border border-blue-100 text-blue-700 text-[10px] leading-tight font-bold">
              <span>{v.name}</span>
              <span>{Math.round(v.weight * 100)}%</span>
            </div>
          ))}
        </div>
      )
    },
  },
];

function RunDetailPage() {
  const { runId } = Route.useParams();

  const { data: run, isLoading: isLoadingRun, isError: isRunError, refetch: refetchRun } = useQuery({
    queryKey: ["runs", runId],
    queryFn: () => runsApi.getRun(runId),
    retry: 1,
  });

  const { data: steps, isLoading: isLoadingSteps, isError: isStepsError } = useQuery({
    queryKey: ["runs", runId, "steps"],
    queryFn: () => runsApi.listRunSteps(runId),
    retry: 1,
  });

  if (isLoadingRun) {
    return (
      <div className="flex flex-col h-full">
        <Topbar breadcrumbs={["Runs", runId]} />
        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground font-mono space-y-4">
          <RefreshCw className="size-8 animate-spin" />
          <span>Loading run details...</span>
        </div>
      </div>
    );
  }

  if (isRunError || !run) {
    return (
      <div className="flex flex-col h-full">
        <Topbar breadcrumbs={["Runs", runId]} />
        <div className="flex-1 flex flex-col items-center justify-center p-6 space-y-4 text-center">
          <AlertCircle className="size-12 text-status-down" />
          <div className="space-y-2">
            <h3 className="text-lg font-bold">Error loading run</h3>
            <p className="text-muted-foreground max-w-md">
              Could not communicate with Manteion or the run ID <span className="font-mono">{runId}</span> does not exist.
            </p>
          </div>
          <Button onClick={() => refetchRun()} variant="outline" className="gap-2">
            <RefreshCw className="size-4" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const elapsedMs = run.started_at 
    ? Date.now() - new Date(run.started_at).getTime()
    : 0;
  
  const formatElapsed = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const rs = s % 60;
    return `${m}m ${rs}s`;
  };

  return (
    <>
      <Topbar breadcrumbs={["Runs", runId]} />
      
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6 bg-muted/10">
        {/* Header Section */}
        <Card className="border-border shadow-sm">
          <CardContent className="p-4 flex flex-wrap items-center gap-x-6 gap-y-3">
            <div className="flex items-center gap-3">
              <span className="font-mono font-bold text-lg">{run.id}</span>
              <span className="text-border">·</span>
              <span className="text-muted-foreground text-sm">workflow: <span className="text-foreground">{run.workflow_name || run.workflow_id}</span></span>
              <span className="text-border">·</span>
            </div>

            {run.experiment_id && (
              <Link 
                to="/experiments/$experimentId" 
                params={{ experimentId: run.experiment_id }}
                className="inline-flex items-center gap-2 px-3 py-1 bg-blue-50 border border-blue-100 rounded-md text-blue-600 text-sm font-medium hover:bg-blue-100 transition-colors"
              >
                <ArrowUpRight className="size-3.5" />
                Experiment: {run.experiment_name || run.experiment_id}
              </Link>
            )}

            <div className="ml-auto flex items-center gap-4">
              <div className="flex items-center gap-2">
                <StatusDot status={run.status === "running" ? "healthy" : "unknown"} />
                <span className={run.status === "running" ? "text-status-healthy font-semibold" : "text-muted-foreground font-semibold"}>
                  {run.status.charAt(0).toUpperCase() + run.status.slice(1)}
                </span>
              </div>
              <span className="text-border">·</span>
              <Badge variant="outline" className="bg-red-50 text-red-600 border-red-200 text-[10px] tracking-wider px-2 h-6">
                INJECT
              </Badge>
              <span className="text-border">·</span>
              <span className="font-mono text-sm text-muted-foreground">
                Elapsed: {formatElapsed(elapsedMs)}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard 
            label="Sent" 
            value={run.sent?.toLocaleString() ?? "0"} 
            footer="requests dispatched"
          />
          <StatCard 
            label="Dropped" 
            value={<span className="text-status-down">{run.dropped?.toLocaleString() ?? "0"}</span>} 
            footer={`${((run.dropped / (run.sent || 1)) * 100).toFixed(1)}% failure rate`}
          />
          <StatCard 
            label="Iterations Done" 
            value={`${run.iterations_done ?? 0} / ${run.iterations_total ?? 0}`} 
            footer="full workflow passes"
          />
          <StatCard 
            label="p99 Latency" 
            value={<span className="text-status-degraded">{formatLatencyUs(run.p99_us)}</span>} 
            footer="worst-tail across steps"
          />
        </div>

        {/* Main Content: Table + Histogram */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          <Card className="lg:col-span-2 shadow-sm overflow-hidden">
            <CardHeader className="py-4 border-b bg-card">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Per-Step Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <DataTable 
                columns={columns} 
                data={steps || []} 
                filterColumn="name" 
                filterPlaceholder="Search steps..."
                className="border-none"
              />
            </CardContent>
          </Card>

          <div className="h-full">
            <RunHistogram steps={steps || []} />
          </div>
        </div>

        {/* Live Event Tail */}
        <LiveEventTail runId={runId} events={MOCK_EVENTS} />
      </div>
    </>
  );
}
