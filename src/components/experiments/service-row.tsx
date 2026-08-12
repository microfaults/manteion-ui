import { CacheBoxIndicator, type CacheBoxInfo } from "@/components/experiments/cache-box-indicator";
import { StatusDot, type StatusKind } from "@/components/status-dot";
import { cn } from "@/lib/utils";

export interface ServiceRowProps {
  name: string;
  /** Sub-line: "3 pods · v1.4.2" or "Prometheus traffic only". */
  subtitle?: string;
  status?: StatusKind;
  /** Right-aligned mono metric, e.g. "412 RPS" or "cpu 38%". */
  hint?: string;
  /** Cache-box telemetry object (renders the indicator) or falsy for none. */
  cacheBox?: CacheBoxInfo | boolean | null;
  selected?: boolean;
  onClick?: () => void;
  style?: React.CSSProperties;
}

/** One service row in the services list / dashboard panel. */
export function ServiceRow({
  name,
  subtitle,
  status,
  hint,
  cacheBox,
  selected,
  onClick,
  style,
}: ServiceRowProps) {
  const interactive = typeof onClick === "function";
  // Only an object payload renders the indicator — boolean true/false is a presence hint.
  const cacheBoxInfo = cacheBox && typeof cacheBox === "object" ? (cacheBox as CacheBoxInfo) : null;

  return (
    <div
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-current={selected ? "true" : undefined}
      onClick={onClick}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
      className={cn(
        "flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-left sm:min-h-12",
        selected && "bg-muted",
        interactive &&
          "cursor-pointer outline-none transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      )}
      style={style}
    >
      <StatusDot status={status ?? "unknown"} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm text-foreground">{name}</div>
        {subtitle ? <div className="truncate text-xs text-muted-foreground">{subtitle}</div> : null}
      </div>
      {hint ? (
        <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
          {hint}
        </span>
      ) : null}
      {cacheBoxInfo ? <CacheBoxIndicator info={cacheBoxInfo} /> : null}
    </div>
  );
}
