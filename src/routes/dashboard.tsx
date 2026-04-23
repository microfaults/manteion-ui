import { Topbar } from "@/components/layout/topbar";
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
import { rulesApi, servicesApi } from "@/lib/api";
import { pluralize } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
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

  const down = instances.data?.filter((i) => i.status === "dead").length ?? 0;
  const enabledRules = rules.data?.filter((r) => r.enabled).length ?? 0;

  return (
    <>
      <Topbar breadcrumbs={["Dashboard"]} />

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <StatCard
            label="Failing services"
            value={down}
            footer={instances.data ? pluralize(instances.data.length, "instance") : "—"}
          />
          <StatCard label="Active experiments" value={0} footer="See Experiments (not yet wired)" />
          <StatCard
            label="Enabled rules"
            value={enabledRules}
            footer={rules.data ? pluralize(rules.data.length, "total rule") : "—"}
          />
          <StatCard
            label="Active faults"
            value={enabledRules}
            footer="mirrors enabled rules until Faults ships"
          />
        </div>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">Services</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Service</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead>Last poll</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {instances.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-muted-foreground">
                      Loading…
                    </TableCell>
                  </TableRow>
                ) : null}
                {instances.isError ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-muted-foreground">
                      Could not reach manteion — is VITE_MANTEION_URL correct?
                    </TableCell>
                  </TableRow>
                ) : null}
                {instances.data?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-muted-foreground">
                      No SDK instances have registered yet.
                    </TableCell>
                  </TableRow>
                ) : null}
                {instances.data?.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell className="font-mono text-xs">{i.service}</TableCell>
                    <TableCell>
                      <StatusDot
                        status={
                          i.status === "alive"
                            ? "healthy"
                            : i.status === "stale"
                              ? "degraded"
                              : i.status === "dead"
                                ? "down"
                                : "unknown"
                        }
                        label={i.status ?? "—"}
                      />
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {i.version ?? "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {i.last_poll_at ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
