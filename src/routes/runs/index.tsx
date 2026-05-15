import { Topbar } from "@/components/layout/topbar";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { formatRelative } from "@/lib/utils";
import { Link, createFileRoute } from "@tanstack/react-router";
import { StatusDot } from "@/components/status-dot";
import { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { ArrowUpDown } from "lucide-react";

export const Route = createFileRoute("/runs/")({
  component: RunsPage,
});

type RunListItem = {
  id: string;
  workflow_id: string;
  experiment_name: string;
  status: string;
  started_at: string;
};

const columns: ColumnDef<RunListItem>[] = [
  {
    accessorKey: "id",
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        className="p-0 hover:bg-transparent font-bold"
      >
        Run ID
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
    cell: ({ row }) => (
      <Link
        to="/runs/$runId"
        params={{ runId: row.getValue("id") }}
        className="font-mono font-bold text-primary hover:underline"
      >
        {row.getValue("id")}
      </Link>
    ),
  },
  {
    accessorKey: "workflow_id",
    header: "Workflow",
    cell: ({ row }) => <div className="font-mono text-xs">{row.getValue("workflow_id")}</div>,
  },
  {
    accessorKey: "experiment_name",
    header: "Experiment",
    cell: ({ row }) => <div className="text-sm">{row.getValue("experiment_name") || "—"}</div>,
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const status = row.getValue("status") as string;
      return (
        <StatusDot 
          status={status === "running" ? "healthy" : status === "completed" ? "unknown" : "down"} 
          label={status.charAt(0).toUpperCase() + status.slice(1)}
          className="font-medium"
        />
      );
    },
  },
  {
    accessorKey: "started_at",
    header: "Started",
    cell: ({ row }) => (
      <div className="font-mono text-xs text-muted-foreground">
        {formatRelative(row.getValue("started_at"))}
      </div>
    ),
  },
];

function RunsPage() {
  const runs: RunListItem[] = [
    {
      id: "run_abc123",
      workflow_id: "checkout-flow",
      experiment_name: "Black Friday Load",
      status: "running",
      started_at: new Date(Date.now() - 134000).toISOString(),
    },
    {
      id: "run_xyz789",
      workflow_id: "browse-flow",
      experiment_name: "Baseline Isolation",
      status: "completed",
      started_at: new Date(Date.now() - 3600000).toISOString(),
    }
  ];

  return (
    <>
      <Topbar breadcrumbs={["Runs"]} />
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <Card className="shadow-sm">
          <CardContent className="p-4">
            <DataTable 
              columns={columns} 
              data={runs} 
              filterColumn="id" 
              filterPlaceholder="Search run ID..."
              className="border-none"
            />
          </CardContent>
        </Card>
        
        <div className="mt-4 p-4 border border-dashed rounded-md bg-muted/5 text-xs text-muted-foreground font-mono">
          Note: This list is currently mocked. Connect to manteion-go to see real runs.
          Endpoints needed: GET /api/v1/runs
        </div>
      </div>
    </>
  );
}
