import { isEngineDrivenPhase } from "@/lib/api/mock-experiments";
import { IS_MOCK } from "@/lib/env";

/** Mock build only: a phase the mock engine drives advances on a fixed short
 *  step, not its plan. Fixture phases with fixed timings carry no tag. */
export function AcceleratedTag({ phaseId }: { phaseId: string }) {
  if (!IS_MOCK || !isEngineDrivenPhase(phaseId)) return null;
  return (
    <span
      className="ml-1.5 rounded border border-border px-1 py-px text-[10px] text-muted-foreground"
      title="Phases advance every 8 seconds in this simulation"
    >
      accelerated
    </span>
  );
}
