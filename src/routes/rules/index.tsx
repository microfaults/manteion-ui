import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { rulesApi } from "@/lib/api";

export const Route = createFileRoute("/rules/")({
  component: RulesPage,
});

function RulesPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["rules"],
    queryFn: rulesApi.listRules,
  });

  return (
    <>
      <Topbar
        breadcrumbs={["Rules"]}
        action={
          <Button asChild>
            <Link to="/rules/$ruleId" params={{ ruleId: "new" }}>
              <Plus className="size-4" />
              New rule
            </Link>
          </Button>
        }
      />
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rule</TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead className="text-right">Priority</TableHead>
                  <TableHead>Enabled</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-muted-foreground">
                      Loading…
                    </TableCell>
                  </TableRow>
                ) : null}
                {isError ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-muted-foreground">
                      Could not reach manteion.
                    </TableCell>
                  </TableRow>
                ) : null}
                {data?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-muted-foreground">
                      No rules yet. Create one with <em>New rule</em>.
                    </TableCell>
                  </TableRow>
                ) : null}
                {data?.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Link
                        to="/rules/$ruleId"
                        params={{ ruleId: r.id }}
                        className="font-mono text-xs text-primary hover:underline"
                      >
                        {r.name}
                      </Link>
                      <div className="mt-0.5 text-[11px] text-muted-foreground">
                        {r.mode} ·{" "}
                        {r.fault_spec_id
                          ? `fault:${r.fault_spec_id}`
                          : r.fault_composition_id
                            ? `composition:${r.fault_composition_id}`
                            : "—"}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {r.service}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{r.mode}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs tabular-nums">
                      {r.priority}
                    </TableCell>
                    <TableCell>
                      <Switch checked={r.enabled} disabled />
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
