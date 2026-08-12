/**
 * ObservabilityCard — one tile on the dashboard's Live observability row.
 *
 * Renders a single metric (RPS, p99, error rate, cache-hit) with a large
 * value, an optional context hint, a 24-point trend bar chart, and a
 * GrafanaButton deep link.
 *
 * Extracted from src/routes/dashboard.tsx so the route component stays
 * focused on data orchestration, not presentation. `MiniBars` is exported
 * as a public primitive so the trend chart can be reused on its own.
 */
import { GrafanaButton } from "@/components/observability/grafana-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { TimeSeriesPoint } from "@/lib/prometheus";
import { cn } from "@/lib/utils";

/** Named series colors mapped onto the theme's chart-1..6 tokens. */
export type SeriesColor = "blue" | "red" | "green" | "amber" | "purple" | "teal";

/** SeriesColor → `bg-chart-N` bar-fill class. */
const SERIES_BAR_CLASS: Record<SeriesColor, string> = {
  blue: "bg-chart-1",
  red: "bg-chart-2",
  green: "bg-chart-3",
  amber: "bg-chart-4",
  purple: "bg-chart-5",
  teal: "bg-chart-6",
};

/** Accept either raw numbers or {value} points and normalize to numbers. */
function toTrendNumbers(trend: number[] | TimeSeriesPoint[] | undefined): number[] {
  if (!trend?.length) return [];
  return (trend as Array<number | TimeSeriesPoint>).map((p) =>
    typeof p === "number" ? p : p.value,
  );
}

/** Bar height as a percentage of the series max, with a 5% floor so zero-ish points stay visible. */
function barStyle(value: number, max: number): React.CSSProperties {
  return { height: `${Math.max((value / max) * 100, 5)}%` };
}

export interface ObservabilityCardProps {
  title: string;
  /** Context line, e.g. "checkout workflow · last 30m". */
  subtitle: string;
  value: string;
  /** Optional trailing qualifier, e.g. "stable". */
  valueHint?: string;
  /** Array of numbers (or TimeSeriesPoints); last 24 are plotted as bars. */
  trend?: number[] | TimeSeriesPoint[];
  /** Named series color → chart token for the bars. */
  color?: SeriesColor;
  /**
   * @deprecated Use `color` instead. Raw bar-fill class; when set it wins
   * over `color` (kept for the neutral `bg-muted-foreground` dashboard tile).
   */
  trendClassName?: string;
  grafanaUrl?: string;
  style?: React.CSSProperties;
}

export function ObservabilityCard({
  title,
  subtitle,
  value,
  valueHint,
  trend,
  color,
  trendClassName,
  grafanaUrl,
  style,
}: ObservabilityCardProps) {
  return (
    <Card style={style}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-base">
          <span>{title}</span>
          {grafanaUrl ? <GrafanaButton href={grafanaUrl} size={28} /> : null}
        </CardTitle>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-baseline gap-2">
          <div className="text-3xl font-semibold tabular-nums">{value}</div>
          {valueHint ? <span className="text-sm text-muted-foreground">{valueHint}</span> : null}
        </div>
        <MiniBars trend={trend} color={color} trendClassName={trendClassName} />
      </CardContent>
    </Card>
  );
}

export interface MiniBarsProps {
  trend?: number[] | TimeSeriesPoint[];
  /** Named series color → chart token for the bars. Default `blue`. */
  color?: SeriesColor;
  /** Bar-chart pixel height. Default 80 (h-20). */
  height?: number;
  /**
   * @deprecated Use `color` instead. Raw bar-fill class; wins over `color`.
   */
  trendClassName?: string;
}

export function MiniBars({ trend, color, height, trendClassName }: MiniBarsProps) {
  // Deprecated `trendClassName` wins; otherwise derive the bar color from `color`.
  const barClass = trendClassName ?? SERIES_BAR_CLASS[color ?? "blue"];
  const heightStyle = height != null ? { height: `${height}px` } : undefined;
  const points = toTrendNumbers(trend).slice(-24);

  if (!points.length) {
    return (
      <div
        className={cn("mt-3 rounded bg-muted/40", height == null && "h-20")}
        style={heightStyle}
      />
    );
  }
  const max = Math.max(...points, 1);
  return (
    <div className={cn("mt-3 flex items-end gap-1", height == null && "h-20")} style={heightStyle}>
      {points.map((v, idx) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: normalized trend points carry no stable id
        <div key={idx} className={cn("w-2 rounded-sm", barClass)} style={barStyle(v, max)} />
      ))}
    </div>
  );
}
