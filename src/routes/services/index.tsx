import { Topbar } from "@/components/layout/topbar";
import { StatusDot } from "@/components/status-dot";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { servicesApi } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";

export const Route = createFileRoute("/services/")({
  component: ServicesPage,
});

function ServicesPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["sdk-instances"],
    queryFn: servicesApi.listSDKInstances,
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
  });

  const sortedInstances = useMemo(() => {
    const rows = data ?? [];
    return [...rows].sort((a, b) => {
      const byService = a.service.localeCompare(b.service);
      if (byService !== 0) return byService;
      return (b.registered_at ?? "").localeCompare(a.registered_at ?? "");
    });
  }, [data]);

  return (
    <>
      <Topbar breadcrumbs={["Services"]} />
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <Card>
          <CardHeader>
            <CardTitle>SDK instances</CardTitle>
            <CardDescription className="max-w-3xl">
              One row per registered process (pod). Same service name can appear many times after
              scaling or deploys — that is expected, not a duplicate bug.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Service</TableHead>
                  <TableHead>Instance ID</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead>Registered</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-muted-foreground">
                      Loading…
                    </TableCell>
                  </TableRow>
                ) : null}
                {isError ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-muted-foreground">
                      Could not reach manteion.
                    </TableCell>
                  </TableRow>
                ) : null}
                {data?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-muted-foreground">
                      No SDK instances registered.
                    </TableCell>
                  </TableRow>
                ) : null}
                {sortedInstances.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell className="font-mono text-xs">
                      <Link
                        to="/services/$instanceId"
                        params={{ instanceId: i.id }}
                        className="text-primary hover:underline"
                      >
                        {i.service}
                      </Link>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {i.id}
                    </TableCell>
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
                    <TableCell className="font-mono text-xs">{i.version ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {i.address ?? "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {i.registered_at}
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
