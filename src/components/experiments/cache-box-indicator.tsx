import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";
import { DatabaseZap } from "lucide-react";

export interface CacheBoxInfo {
  /** Replay mode. */
  mode: "passthrough" | "replay" | "replay_with_delay";
  /** Request-matching key strategy. */
  keyStrategy: "exact" | "exact_with_host" | "exact_with_body";
  /** Cache-hit rate 0–1 (colored: ≥0.85 green, ≥0.6 amber, else red). */
  hitRate: number;
  /** Exchanges recorded into the cache. */
  recorded: number;
  /** Responses served from the cache. */
  replayed: number;
  /** Human duration the mode has been active, e.g. "12m". */
  since?: string;
}

export interface CacheBoxIndicatorProps {
  /** Telemetry; renders nothing when null/undefined. */
  info?: CacheBoxInfo | null;
  size?: number;
  style?: React.CSSProperties;
}

/** Hit-rate buckets — matches the contract thresholds. */
function hitRateClass(hitRate: number): string {
  if (hitRate >= 0.85) return "text-status-healthy";
  if (hitRate >= 0.6) return "text-status-degraded";
  return "text-status-down";
}

function SummaryRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono text-foreground">{value}</span>
    </div>
  );
}

/** Database-zap icon + hover pill summarizing a service's cache-box telemetry. */
export function CacheBoxIndicator({ info, size = 16, style }: CacheBoxIndicatorProps) {
  if (!info) return null;

  const colorClass = hitRateClass(info.hitRate);
  const hitPct = `${Math.round(info.hitRate * 100)}%`;

  return (
    <HoverCard openDelay={120} closeDelay={80}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center justify-center rounded-sm outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            colorClass,
          )}
          aria-label={`Cache box — ${info.mode}, ${hitPct} hit rate`}
          style={style}
        >
          <DatabaseZap size={size} aria-hidden />
        </button>
      </HoverCardTrigger>
      <HoverCardContent className="w-56 space-y-2">
        <div className="flex items-center justify-between gap-4">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">Cache box</span>
          <span className={cn("font-mono text-sm font-medium", colorClass)}>{hitPct}</span>
        </div>
        <div className="space-y-1">
          <SummaryRow label="Mode" value={info.mode} />
          <SummaryRow label="Key strategy" value={info.keyStrategy} />
          <SummaryRow label="Hit rate" value={hitPct} />
          <SummaryRow label="Recorded" value={info.recorded.toLocaleString()} />
          <SummaryRow label="Replayed" value={info.replayed.toLocaleString()} />
          {info.since ? <SummaryRow label="Since" value={info.since} /> : null}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
