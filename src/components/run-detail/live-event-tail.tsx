import { type RunEvent, pauseRun, resumeRun } from "@/lib/api/runs";
import { formatLatencyUs } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Pause, Play } from "lucide-react";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface LiveEventTailProps {
  runId: string;
  events: RunEvent[];
}

export function LiveEventTail({ runId, events }: LiveEventTailProps) {
  const [isPaused, setIsPaused] = useState(false);
  const [isApiPending, setIsApiPending] = useState(false);

  const handleTogglePause = async () => {
    setIsApiPending(true);
    try {
      if (isPaused) {
        await resumeRun(runId);
      } else {
        await pauseRun(runId);
      }
      setIsPaused(!isPaused);
    } finally {
      setIsApiPending(false);
    }
  };

  const displayedEvents = isPaused ? events : [...events].reverse();

  return (
    <Card className="flex flex-col h-[400px] shadow-sm overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between py-3 border-b bg-card">
        <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          <span className={cn("size-1.5 rounded-full", isPaused ? "bg-muted-foreground/40" : "bg-status-healthy animate-pulse")} />
          Live Event Tail
        </CardTitle>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[10px] font-mono text-status-healthy bg-status-healthy/5 border-status-healthy/20">
            step.ok
          </Badge>
          <Badge variant="outline" className="text-[10px] font-mono text-status-down bg-status-down/5 border-status-down/20">
            step.drop
          </Badge>
          <Badge variant="outline" className="text-[10px] font-mono text-primary bg-primary/5 border-primary/20">
            iter.done
          </Badge>
          <Button 
            variant="outline" 
            size="sm" 
            className="h-7 px-2 text-xs gap-1 ml-2"
            onClick={handleTogglePause}
            disabled={isApiPending}
          >
            {isPaused ? <Play className={cn("size-3", isApiPending && "animate-pulse")} /> : <Pause className={cn("size-3", isApiPending && "animate-pulse")} />}
            {isPaused ? "Resume" : "Pause"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0 flex-1 overflow-y-auto font-mono text-xs bg-muted/5">
        <table className="w-full text-left border-collapse">
          <tbody className="divide-y divide-border">
            {displayedEvents.map((ev, i) => (
              <tr key={`${ev.run_id}-${ev.timestamp}-${i}`} className="hover:bg-muted/30 transition-colors h-10">
                <td className="pl-6 pr-4 py-2 text-muted-foreground w-24 tabular-nums">
                  {new Date(ev.timestamp).toLocaleTimeString([], { hour12: false })}
                </td>
                <td className="px-4 py-2 w-28">
                  <span className={cn(
                    "font-bold",
                    ev.type === "step.ok" && "text-status-healthy",
                    ev.type === "step.drop" && "text-status-down",
                    ev.type === "iteration.done" && "text-primary",
                    ev.type === "phase.transition" && "text-status-degraded"
                  )}>
                    {ev.type}
                  </span>
                </td>
                <td className="px-4 py-2 w-40 text-foreground font-semibold">
                  {ev.step_name || "—"}
                </td>
                <td className="px-4 py-2 w-24 text-right text-muted-foreground tabular-nums">
                  {ev.duration_us ? formatLatencyUs(ev.duration_us) : "—"}
                </td>
                <td className="pl-4 pr-6 py-2 text-muted-foreground">
                  {ev.type === "iteration.done" ? (
                    `iter=${ev.iteration} of ${ev.total_iterations}`
                  ) : (
                    <>
                      {ev.variant && <span className="mr-3">variant={ev.variant}</span>}
                      {ev.reason && <span>reason={ev.reason}</span>}
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
