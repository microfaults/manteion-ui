/**
 * ObservabilityCard — one tile on the dashboard's Live observability row.
 *
 * Renders a single metric (RPS, p99, error rate, cache-hit) with a large
 * value, an optional context hint, a 24-point trend bar chart, and an
 * "Open in Grafana ↗" deep link.
 *
 * Extracted from src/routes/dashboard.tsx so the route component stays
 * focused on data orchestration, not presentation. The trend bar
 * (`MiniBars`) is private to this file.
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { TimeSeriesPoint } from "@/lib/prometheus";

export function ObservabilityCard({
  title,
  subtitle,
  value,
  valueHint,
  trend,
  trendClassName,
  grafanaUrl,
}: {
  title: string;
  subtitle: string;
  value: string;
  valueHint?: string;
  trend: TimeSeriesPoint[] | undefined;
  trendClassName: string;
  grafanaUrl?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-base">
          <span>{title}</span>
          {grafanaUrl ? (
            <a
              href={grafanaUrl}
              target="_blank"
              rel="noreferrer"
              title="Grafana is opened at VITE_GRAFANA_URL from your browser. If the connection fails, run kubectl port-forward svc/grafana 3001:3000 (or match your .env.local port)."
              className="text-xs font-normal text-primary hover:underline"
            >
              Open in Grafana ↗
            </a>
          ) : null}
        </CardTitle>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-baseline gap-2">
          <div className="text-3xl font-semibold tabular-nums">{value}</div>
          {valueHint ? <span className="text-sm text-muted-foreground">{valueHint}</span> : null}
        </div>
        <MiniBars trend={trend} trendClassName={trendClassName} />
      </CardContent>
    </Card>
  );
}

function MiniBars({
  trend,
  trendClassName,
}: { trend: TimeSeriesPoint[] | undefined; trendClassName: string }) {
  if (!trend?.length) {
    return <div className="mt-3 h-20 rounded bg-muted/40" />;
  }
  const points = trend.slice(-24);
  const max = Math.max(...points.map((p) => p.value), 1);
  return (
    <div className="mt-3 flex h-20 items-end gap-1">
      {points.map((p, idx) => (
        // Range queries can occasionally land two points on the same
        // timestamp — fall back to index to keep the React key unique.
        <div
          key={`${p.ts}-${idx}`}
          className={`w-2 rounded-sm ${trendClassName}`}
          style={{ height: `${Math.max((p.value / max) * 100, 5)}%` }}
        />
      ))}
    </div>
  );
}
