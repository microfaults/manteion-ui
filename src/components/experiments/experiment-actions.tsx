/**
 * Lifecycle controls for one experiment. Start confirms the plan and lists
 * attached rules that are disabled (the orchestrator skips them silently —
 * decision 1: this UI never enables rules for you). Stop takes the final
 * status, Delete is allowed for anything not running. Backend refusals
 * (admission 409, state 400/409) are shown verbatim.
 */
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { experimentsApi } from "@/lib/api";
import { describeApiError } from "@/lib/api-errors";
import type { ExperimentFinalStatus } from "@/lib/api/experiments";
import type { RuleRef } from "@/lib/experiment-draft";
import type { Experiment } from "@/types/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

interface ExperimentActionsProps {
  experiment: Experiment;
  rules: readonly RuleRef[];
  onDeleted?: () => void;
}

type Pending = "start" | "stop" | "cancel" | "delete" | null;

export function ExperimentActions({ experiment, rules, onDeleted }: ExperimentActionsProps) {
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<Pending>(null);
  const [stopStatus, setStopStatus] = useState<ExperimentFinalStatus>("completed");
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["experiment", experiment.id] });
    queryClient.invalidateQueries({ queryKey: ["experiments"] });
    queryClient.invalidateQueries({ queryKey: ["phases"] });
  };
  const act = useMutation({
    mutationFn: async (action: Exclude<Pending, null> | "pause" | "resume") => {
      const id = experiment.id;
      if (action === "start") await experimentsApi.startExperiment(id);
      else if (action === "pause") await experimentsApi.pauseExperiment(id);
      else if (action === "resume") await experimentsApi.resumeExperiment(id);
      else if (action === "cancel") await experimentsApi.cancelExperiment(id);
      else if (action === "stop") await experimentsApi.stopExperiment(id, stopStatus);
      else await experimentsApi.deleteExperiment(id);
      return action;
    },
    onSuccess: (action) => {
      setDialog(null);
      setError(null);
      if (action === "delete") {
        queryClient.invalidateQueries({ queryKey: ["experiments"] });
        onDeleted?.();
      } else refresh();
    },
    onError: (e: unknown) => setError(describeApiError(e)),
  });

  const status = experiment.status;
  const running = status === "running";
  const anyPaused = experiment.phases.some((p) => p.status === "paused");
  const anyInFlight = experiment.phases.some(
    (p) => p.status === "running" || p.status === "draining",
  );
  const rulesById = new Map(rules.map((r) => [r.id, r]));
  const disabledAttached = experiment.phases.flatMap((p) =>
    p.rule_ids
      .map((id) => rulesById.get(id))
      .filter((r): r is RuleRef => !!r && !r.enabled)
      .map((r) => ({ rule: r, phase: p.name })),
  );
  const busy = act.isPending;

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {error && dialog === null ? (
        <p className="max-w-md text-xs text-status-down">{error}</p>
      ) : null}
      {status === "planned" ? (
        <Button size="sm" disabled={busy} onClick={() => setDialog("start")}>
          Start
        </Button>
      ) : null}
      {running && anyInFlight ? (
        <Button size="sm" variant="outline" disabled={busy} onClick={() => act.mutate("pause")}>
          Pause
        </Button>
      ) : null}
      {running && anyPaused ? (
        <Button size="sm" variant="outline" disabled={busy} onClick={() => act.mutate("resume")}>
          Resume
        </Button>
      ) : null}
      {running ? (
        <>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => setDialog("stop")}>
            Stop
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => setDialog("cancel")}>
            Cancel
          </Button>
        </>
      ) : (
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => setDialog("delete")}>
          Delete
        </Button>
      )}

      <Dialog
        open={dialog === "start"}
        onClose={() => setDialog(null)}
        title={`Start ${experiment.name}?`}
        description={`${experiment.phases.length} phase${experiment.phases.length === 1 ? "" : "s"} run in order; each phase pushes its rules, freezes its services and drives its workflows through zeus.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDialog(null)}>
              Back
            </Button>
            <Button disabled={busy} onClick={() => act.mutate("start")}>
              Start experiment
            </Button>
          </>
        }
      >
        {disabledAttached.length > 0 ? (
          <div className="rounded-md border border-status-degraded/30 bg-status-degraded/10 p-3 text-xs">
            <p className="font-medium text-status-degraded">
              {disabledAttached.length} attached rule{disabledAttached.length > 1 ? "s are" : " is"}{" "}
              disabled and will be skipped:
            </p>
            <ul className="mt-1 space-y-0.5 font-mono">
              {disabledAttached.map(({ rule, phase }) => (
                <li key={`${phase}-${rule.id}`}>
                  {rule.name} <span className="text-muted-foreground">· on {phase}</span>
                </li>
              ))}
            </ul>
            <p className="mt-1 text-muted-foreground">
              Enable them on the Rules page first, or start anyway.
            </p>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Every attached rule is enabled.</p>
        )}
        {error ? <p className="mt-2 text-xs text-status-down">{error}</p> : null}
      </Dialog>

      <Dialog
        open={dialog === "stop"}
        onClose={() => setDialog(null)}
        title={`Stop ${experiment.name}?`}
        description="The in-flight phase is torn down (rules withdrawn, cache-box released) and remaining phases are skipped."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDialog(null)}>
              Back
            </Button>
            <Button variant="destructive" disabled={busy} onClick={() => act.mutate("stop")}>
              Stop experiment
            </Button>
          </>
        }
      >
        <div className="flex items-center gap-2 text-xs">
          <Label htmlFor="stop-final-status">Final status</Label>
          <NativeSelect
            id="stop-final-status"
            className="h-8 w-36 text-xs"
            value={stopStatus}
            onChange={(e) => setStopStatus(e.target.value as ExperimentFinalStatus)}
            options={["completed", "failed", "cancelled"]}
          />
        </div>
        {error ? <p className="mt-2 text-xs text-status-down">{error}</p> : null}
      </Dialog>

      <Dialog
        open={dialog === "cancel"}
        onClose={() => setDialog(null)}
        title={`Cancel ${experiment.name}?`}
        description="Marks the experiment cancelled and skips every remaining phase."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDialog(null)}>
              Back
            </Button>
            <Button variant="destructive" disabled={busy} onClick={() => act.mutate("cancel")}>
              Cancel experiment
            </Button>
          </>
        }
      >
        {error ? <p className="text-xs text-status-down">{error}</p> : null}
      </Dialog>

      <Dialog
        open={dialog === "delete"}
        onClose={() => setDialog(null)}
        title={`Delete ${experiment.name}?`}
        description="Removes the plan, its phases and any harvested results. This cannot be undone."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDialog(null)}>
              Back
            </Button>
            <Button variant="destructive" disabled={busy} onClick={() => act.mutate("delete")}>
              Delete experiment
            </Button>
          </>
        }
      >
        {error ? <p className="text-xs text-status-down">{error}</p> : null}
      </Dialog>
    </div>
  );
}
