/**
 * Live zeus run state by `zeus_run_id`, plus the run.state transitions this
 * client observed while polling — zeus keeps no history, so the timeline is
 * what we saw (seeded from started_at / ended_at).
 */
import { zeusRunsApi } from "@/lib/api";
import type { ZeusRun } from "@/types/api";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useFinalRefetch } from "./use-final-refetch";

export function useZeusRun(runId: string | undefined, live: boolean) {
  // Polling stops when the phase ends; fetch the run's final state once more.
  useFinalRefetch(["zeus-run", runId ?? ""], live);
  return useQuery({
    queryKey: ["zeus-run", runId ?? ""],
    queryFn: () => zeusRunsApi.getRun(runId ?? ""),
    enabled: !!runId,
    refetchInterval: live ? 5_000 : false,
    staleTime: live ? 4_000 : 60_000,
    retry: false,
  });
}

export interface RunTransition {
  /** ISO timestamp of the observation (or zeus's own timestamp when seeded). */
  at: string;
  from?: string;
  to: string;
}

/** run.state transitions for one run: seeded from zeus timestamps, then
 *  appended whenever a poll returns a new status. */
export function useRunStateTimeline(
  run: ZeusRun | undefined,
  now: () => number = Date.now,
): RunTransition[] {
  const [timeline, setTimeline] = useState<RunTransition[]>([]);
  const last = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!run) return;
    if (last.current === undefined) {
      const seed: RunTransition[] = [];
      if (run.started_at) seed.push({ at: run.started_at, from: "starting", to: "running" });
      if (run.ended_at && run.status !== "running") {
        seed.push({ at: run.ended_at, from: "running", to: run.status });
      } else if (run.status !== "running" && !run.started_at) {
        seed.push({ at: new Date(now()).toISOString(), to: run.status });
      }
      last.current = run.status;
      setTimeline(seed);
      return;
    }
    if (run.status !== last.current) {
      const from = last.current;
      last.current = run.status;
      setTimeline((t) => [
        ...t,
        { at: run.ended_at ?? new Date(now()).toISOString(), from, to: run.status },
      ]);
    }
  }, [run, now]);
  return timeline;
}
