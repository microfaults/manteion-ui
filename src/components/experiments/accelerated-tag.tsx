import { IS_MOCK } from "@/lib/env";

/** Mock build only: phases there advance on a fixed short step, not their plan. */
export function AcceleratedTag() {
  if (!IS_MOCK) return null;
  return (
    <span
      className="ml-1.5 rounded border border-border px-1 py-px text-[10px] text-muted-foreground"
      title="Phases advance every 8 seconds in this simulation"
    >
      accelerated
    </span>
  );
}
