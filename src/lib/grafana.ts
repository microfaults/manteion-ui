/** Grafana deep links for the bundled overview dashboard
 *  (`microservices-demo-go/kubernetes-manifests/grafana-dashboards.yaml`). */
export const GRAFANA_OVERVIEW_UID = "atropos-overview";

export type GrafanaMetric = "requests-sec" | "p99-latency" | "error-rate" | "cache-hit-rate";

/** Panel IDs on that dashboard (`viewPanel` must be numeric). No cache panel
 *  exists — that link opens the board without a deep-link. */
export const GRAFANA_PANEL_BY_METRIC: Record<GrafanaMetric, number | undefined> = {
  "requests-sec": 3,
  "p99-latency": 5,
  "error-rate": 6,
  "cache-hit-rate": undefined,
};

export interface GrafanaWindow {
  /** ISO timestamps; `to` omitted = now. */
  from: string;
  to?: string;
}

/** Full-dashboard link (topbar "Open in Grafana"). */
export function grafanaDashboardUrl(
  base: string | undefined,
  metric: GrafanaMetric,
  window?: GrafanaWindow,
): string | undefined {
  if (!base) return undefined;
  const q = new URLSearchParams({ orgId: "1" });
  const panel = GRAFANA_PANEL_BY_METRIC[metric];
  if (panel) q.set("viewPanel", String(panel));
  applyWindow(q, window);
  return `${base.replace(/\/+$/, "")}/d/${GRAFANA_OVERVIEW_UID}?${q.toString()}`;
}

/** `d-solo` iframe src for one panel, pinned to a time window. `undefined`
 *  when the dashboard has no panel for the metric (render the empty tile). */
export function grafanaPanelSrc(
  base: string | undefined,
  metric: GrafanaMetric,
  window?: GrafanaWindow,
): string | undefined {
  const panel = GRAFANA_PANEL_BY_METRIC[metric];
  if (!base || !panel) return undefined;
  const q = new URLSearchParams({ orgId: "1", panelId: String(panel), theme: "dark" });
  applyWindow(q, window);
  return `${base.replace(/\/+$/, "")}/d-solo/${GRAFANA_OVERVIEW_UID}?${q.toString()}`;
}

function applyWindow(q: URLSearchParams, window?: GrafanaWindow) {
  if (!window) return;
  q.set("from", String(Date.parse(window.from)));
  q.set("to", window.to ? String(Date.parse(window.to)) : "now");
}
