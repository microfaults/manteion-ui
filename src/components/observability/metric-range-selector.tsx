/**
 * MetricRangeSelector — segmented time-window control for observability
 * panels. A row of range segments ("5m", "30m", "1h", …) plus a trailing
 * "Live" toggle. When `live` is active it overrides the range highlight.
 */
import { cn } from "@/lib/utils";

export interface MetricRangeSelectorProps {
  /** Active range token, e.g. "30m". */
  value?: string;
  options?: string[];
  /** Whether the live toggle is active (overrides range highlight). */
  live?: boolean;
  onChange?: (value: string) => void;
  onLive?: () => void;
  style?: React.CSSProperties;
}

const DEFAULT_OPTIONS = ["5m", "15m", "30m", "1h"];

const segmentClass = (active: boolean) =>
  cn(
    "rounded-md px-2.5 py-1 font-mono text-xs font-medium transition-colors",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    active
      ? "bg-primary text-primary-foreground"
      : "text-muted-foreground hover:bg-muted hover:text-foreground",
  );

export function MetricRangeSelector({
  value,
  options = DEFAULT_OPTIONS,
  live,
  onChange,
  onLive,
  style,
}: MetricRangeSelectorProps) {
  return (
    <div className="flex flex-wrap items-center gap-1" style={style}>
      {options.map((opt) => {
        const active = !live && value === opt;
        return (
          <button
            key={opt}
            type="button"
            aria-pressed={active}
            onClick={() => onChange?.(opt)}
            className={segmentClass(active)}
          >
            {opt}
          </button>
        );
      })}
      <button
        type="button"
        aria-pressed={!!live}
        onClick={() => onLive?.()}
        className={cn(
          "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          live
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
      >
        Live
      </button>
    </div>
  );
}
