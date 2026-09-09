/**
 * Phases — the logical unit of operation (decision 2: "Runs" renamed). One
 * row per phase across every experiment, from the flat GET /api/v1/phases.
 */
import { PhasePill } from "@/components/phase-pill";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { phasesApi } from "@/lib/api";
import { describeApiError } from "@/lib/api-errors";
import { phaseDurationMs } from "@/lib/phase-metrics";
import { formatDurationMs, formatRelative } from "@/lib/utils";
import { ACTIVE_PHASE_STATUSES, type PhaseListItem, type PhaseStatus } from "@/types/api";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";

const STATUS_FILTERS: { value: "all" | "active" | PhaseStatus; label: string }[] = [
  { value: "all", label: "all statuses" },
  { value: "active", label: "in flight" },
  { value: "pending", label: "pending" },
  { value: "running", label: "running" },
  { value: "draining", label: "draining" },
  { value: "paused", label: "paused" },
  { value: "completed", label: "completed" },
  { value: "failed", label: "failed" },
  { value: "skipped", label: "skipped" },
];

const badgeVariant: Record<
  PhaseStatus,
  "secondary" | "default" | "status-degraded" | "status-healthy" | "status-down" | "outline"
> = {
  pending: "secondary",
  running: "default",
  paused: "status-degraded",
  draining: "status-degraded",
  completed: "status-healthy",
  failed: "status-down",
  skipped: "outline",
};

/** Newest activity first: in-flight phases, then by start time, then plan order. */
export function sortPhases(items: readonly PhaseListItem[]): PhaseListItem[] {
  return [...items].sort((a, b) => {
    const activeA = ACTIVE_PHASE_STATUSES.has(a.status) ? 0 : 1;
    const activeB = ACTIVE_PHASE_STATUSES.has(b.status) ? 0 : 1;
    if (activeA !== activeB) return activeA - activeB;
    const startA = a.started_at ? Date.parse(a.started_at) : 0;
    const startB = b.started_at ? Date.parse(b.started_at) : 0;
    if (startA !== startB) return startB - startA;
    if (a.experiment_id !== b.experiment_id)
      return a.experiment_name.localeCompare(b.experiment_name);
    return (a.position ?? 0) - (b.position ?? 0);
  });
}

export function PhasesList() {
  const [status, setStatus] = useState<(typeof STATUS_FILTERS)[number]["value"]>("all");
  const [search, setSearch] = useState("");
  const phases = useQuery({
    queryKey: ["phases"],
    queryFn: () => phasesApi.listPhases(),
    retry: false,
    refetchInterval: (q) =>
      q.state.data?.some((p) => ACTIVE_PHASE_STATUSES.has(p.status)) ? 10_000 : false,
  });

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return sortPhases(phases.data ?? []).filter(
      (p) =>
        (status === "all" ||
          (status === "active" ? ACTIVE_PHASE_STATUSES.has(p.status) : p.status === status)) &&
        (!needle ||
          p.name.toLowerCase().includes(needle) ||
          p.experiment_name.toLowerCase().includes(needle)),
    );
  }, [phases.data, status, search]);

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <Input
          aria-label="Filter phases"
          className="h-8 w-64 text-xs"
          placeholder="phase or experiment name"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <NativeSelect
          aria-label="Status filter"
          className="h-8 w-40 text-xs"
          value={status}
          onChange={(e) => setStatus(e.target.value as typeof status)}
          options={STATUS_FILTERS}
        />
        <span className="ml-auto text-xs text-muted-foreground">
          {phases.data ? `${rows.length} of ${phases.data.length} phases` : ""}
        </span>
      </div>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Phase</TableHead>
              <TableHead>Experiment</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Workflows</TableHead>
              <TableHead className="text-right">Frozen</TableHead>
              <TableHead>Started</TableHead>
              <TableHead>Duration</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {phases.isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            ) : null}
            {phases.isError ? (
              <TableRow>
                <TableCell colSpan={7} className="text-status-down">
                  {describeApiError(phases.error)}
                </TableCell>
              </TableRow>
            ) : null}
            {phases.data && rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-muted-foreground">
                  {phases.data.length === 0
                    ? "No phases yet — create an experiment."
                    : "No phases match."}
                </TableCell>
              </TableRow>
            ) : null}
            {rows.map((p) => {
              const duration = phaseDurationMs(p);
              return (
                <TableRow key={p.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <PhasePill name={p.name} status={p.status} widthPx={12} />
                      <Link
                        to="/phases/$phaseId"
                        params={{ phaseId: p.id }}
                        className="font-mono text-sm font-medium text-primary hover:underline"
                      >
                        {p.name}
                      </Link>
                      {p.position != null ? (
                        <span className="text-[11px] text-muted-foreground">#{p.position + 1}</span>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Link
                      to="/experiments/$experimentId"
                      params={{ experimentId: p.experiment_id }}
                      className="text-sm hover:underline"
                    >
                      {p.experiment_name || p.experiment_id}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant={badgeVariant[p.status]} dot={p.status !== "pending"}>
                      {p.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {p.workflow_ids.length}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {p.frozen_service_count}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {p.started_at ? formatRelative(p.started_at) : "—"}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {duration != null
                      ? `${formatDurationMs(duration)}${p.completed_at ? "" : " so far"}`
                      : "—"}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
