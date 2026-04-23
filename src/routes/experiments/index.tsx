import { Topbar } from "@/components/layout/topbar";
import { PhaseHoverCard } from "@/components/phase-hover-card";
import { PhasePill } from "@/components/phase-pill";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { experimentsApi } from "@/lib/api";
import { formatDurationMs, formatRelative } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Plus } from "lucide-react";

export const Route = createFileRoute("/experiments/")({
  component: ExperimentsPage,
});

function ExperimentsPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["experiments"],
    queryFn: experimentsApi.listExperiments,
    retry: false,
  });

  return (
    <>
      <Topbar
        breadcrumbs={["Experiments"]}
        action={
          <Button disabled>
            <Plus className="size-4" />
            New experiment
          </Button>
        }
      />
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Experiment</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Phases</TableHead>
                  <TableHead>Workflows</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Created by</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-muted-foreground">
                      Loading…
                    </TableCell>
                  </TableRow>
                ) : null}
                {isError ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-muted-foreground">
                      <code className="font-mono">/api/v1/experiments</code> is not yet exposed by
                      manteion-go — see <code className="font-mono">docs/API-NEEDED.md</code>.
                      Showing an empty list for now.
                    </TableCell>
                  </TableRow>
                ) : null}
                {data?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-muted-foreground">
                      No experiments yet.
                    </TableCell>
                  </TableRow>
                ) : null}
                {data?.map((e) => {
                  const durationMs =
                    e.started_at && e.completed_at
                      ? new Date(e.completed_at).getTime() - new Date(e.started_at).getTime()
                      : null;
                  return (
                    <TableRow key={e.id}>
                      <TableCell>
                        <Link
                          to="/experiments/$experimentId"
                          params={{ experimentId: e.id }}
                          className="font-medium text-primary hover:underline"
                        >
                          {e.name}
                        </Link>
                        <div className="mt-0.5 text-[11px] font-mono text-muted-foreground">
                          {e.workflow_ids.join(" + ") || "—"}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="capitalize">
                          {e.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {e.phases.map((p) => (
                            <PhaseHoverCard
                              key={p.name}
                              experimentId={e.id}
                              phase={p.name}
                              statusHint={p.status}
                              fallbackSummary={p}
                            >
                              <span>
                                <PhasePill name={p.name} status={p.status} widthPx={28} />
                              </span>
                            </PhaseHoverCard>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {e.workflow_ids.join(", ") || "—"}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {e.started_at ? formatRelative(e.started_at) : "—"}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {durationMs ? formatDurationMs(durationMs) : "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {e.created_by ?? "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
