/**
 * Topbar action for the experiments list. Experiments attach load per phase
 * (every phase row references a workflow_id), so creation is gated on at
 * least one workflow existing — the disabled button always says why.
 */
import { Button } from "@/components/ui/button";
import { workflowsApi } from "@/lib/api";
import { experimentCreateGate } from "@/lib/gating";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Plus } from "lucide-react";

export function NewExperimentButton() {
  const navigate = useNavigate();
  const workflows = useQuery({
    queryKey: ["workflows"],
    queryFn: workflowsApi.listWorkflows,
    staleTime: 30_000,
    retry: false,
  });

  const gate = experimentCreateGate(
    {
      status: workflows.isLoading ? "loading" : workflows.isError ? "error" : "ready",
      count: workflows.data?.length ?? 0,
    },
    // POST /api/v1/experiments is wired (experimentsApi.createExperiment).
    { backendSupportsCreate: true },
  );

  return (
    <div className="flex items-center gap-3">
      {gate.message ? (
        <span className="hidden text-xs text-muted-foreground sm:inline">{gate.message}</span>
      ) : null}
      <Button
        disabled={!gate.allowed}
        title={gate.message || undefined}
        onClick={() => navigate({ to: "/experiments/new" })}
      >
        <Plus className="size-4" />
        New experiment
      </Button>
    </div>
  );
}
