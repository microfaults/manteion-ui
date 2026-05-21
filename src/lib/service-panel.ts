/**
 * Service-panel data shaping for the dashboard "Services" tile.
 *
 * The dashboard merges two sources of truth into one table:
 *
 *  1. manteion-go's SDK registry (`GET /api/v1/sdk/instances`) — the
 *     authoritative list of services that called sdk.Register().
 *  2. Prometheus span-metrics (`group by(service_name) (rate(calls_total[5m]))`)
 *     — surfaces services that are taking traffic but haven't (yet)
 *     registered an SDK, e.g. legacy currencyservice on online-boutique.
 *
 * We render one row per service. SDK rows win when both sources see a
 * service (we trust SDK status); metrics-only rows show up as
 * `dotStatus: "unknown"`. The OTel `service_name` label and the SDK
 * `service` field don't always agree — see `promServiceNameMatchesSdk`
 * for the matching heuristic.
 *
 * Extracted from src/routes/dashboard.tsx so the route component stays
 * focused on data orchestration.
 */
import type { SDKInstance } from "@/types/api";

export type ServicePanelRow = {
  key: string;
  name: string;
  version?: string;
  instanceCount: number;
  source: "sdk" | "metrics";
  dotStatus: "healthy" | "degraded" | "down" | "unknown";
  hint: string;
};

export function buildServicesPanelRows(
  instances: SDKInstance[] | undefined,
  metricNames: string[] | undefined,
  rates: Record<string, number> | undefined,
  rateQuery: { ratesLoading: boolean; ratesError: boolean },
): { total: number; rows: ServicePanelRow[] } {
  const rows: ServicePanelRow[] = [];
  const seen = new Set<string>();

  if (instances?.length) {
    const byService = new Map<string, SDKInstance[]>();
    for (const i of instances) {
      const list = byService.get(i.service) ?? [];
      list.push(i);
      byService.set(i.service, list);
    }
    for (const [serviceName, group] of [...byService.entries()].sort((a, b) =>
      a[0].localeCompare(b[0]),
    )) {
      let dotStatus: ServicePanelRow["dotStatus"] = "healthy";
      for (const i of group) {
        dotStatus = worseDotStatus(dotStatus, sdkInstanceToDotStatus(i.status));
      }
      const versions = new Set(group.map((i) => i.version).filter(Boolean) as string[]);
      let version: string | undefined;
      if (versions.size === 0) version = undefined;
      else if (versions.size === 1) version = [...versions][0];
      else version = "mixed";

      rows.push({
        key: `sdk:${serviceName}`,
        name: serviceName,
        version,
        instanceCount: group.length,
        source: "sdk",
        dotStatus,
        hint: formatServiceRateHint(group.length, rates, serviceName, rateQuery),
      });
      seen.add(serviceName);
    }
  }

  for (const name of [...(metricNames ?? [])].sort((a, b) => a.localeCompare(b))) {
    if (seen.has(name)) continue;
    rows.push({
      key: `m:${name}`,
      name,
      instanceCount: 1,
      source: "metrics",
      dotStatus: "unknown",
      hint: formatServiceRateHint(1, rates, name, rateQuery),
    });
    seen.add(name);
  }

  rows.sort((a, b) => a.name.localeCompare(b.name));
  return { total: rows.length, rows };
}

/** Strip the conventional "service" suffix so e.g. "productcatalogservice"
 *  renders as "productcatalog" in the table. Falls back to the original
 *  name when stripping would leave an empty string. */
export function displayServiceName(name: string): string {
  const trimmed = name.replace(/service$/i, "");
  return trimmed.length > 0 ? trimmed : name;
}

// ── internals ──────────────────────────────────────────────────────────

function sdkInstanceToDotStatus(status: SDKInstance["status"]): ServicePanelRow["dotStatus"] {
  if (status === "alive") return "healthy";
  if (status === "stale") return "degraded";
  if (status === "dead") return "down";
  return "unknown";
}

function worseDotStatus(
  a: ServicePanelRow["dotStatus"],
  b: ServicePanelRow["dotStatus"],
): ServicePanelRow["dotStatus"] {
  const rank = { down: 3, degraded: 2, unknown: 1, healthy: 0 };
  return rank[a] >= rank[b] ? a : b;
}

function compactServiceId(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function stripTrailingServiceToken(compact: string): string {
  if (compact.endsWith("service") && compact.length > "service".length) {
    return compact.slice(0, -"service".length);
  }
  return compact;
}

/**
 * Match span-metrics `service_name` to manteion SDK `service` (OTel often
 * shortens names, uses different punctuation, or embeds the workload in a
 * longer string).
 */
function promServiceNameMatchesSdk(promKey: string, sdkService: string): boolean {
  const a = compactServiceId(promKey);
  const b = compactServiceId(sdkService);
  if (!a || !b) return false;
  if (a === b) return true;
  const as = stripTrailingServiceToken(a);
  const bs = stripTrailingServiceToken(b);
  if (as.length > 0 && as === bs) return true;
  if (as === b || a === bs) return true;
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length > b.length ? a : b;
  /* Avoid matching e.g. "ad" inside unrelated strings; suffix heuristic needs length. */
  return shorter.length >= 4 && longer.endsWith(shorter);
}

function lookupCallRate(
  rates: Record<string, number> | undefined,
  service: string,
): number | undefined {
  if (!rates) return undefined;
  let sum = 0;
  let n = 0;
  for (const [k, v] of Object.entries(rates)) {
    if (!Number.isFinite(v)) continue;
    if (promServiceNameMatchesSdk(k, service)) {
      sum += v;
      n++;
    }
  }
  return n > 0 ? sum : undefined;
}

function formatServiceRateHint(
  instanceCount: number,
  rates: Record<string, number> | undefined,
  serviceName: string,
  rateQuery: { ratesLoading: boolean; ratesError: boolean },
): string {
  const prefix = instanceCount > 1 ? `${instanceCount} pods · ` : "";
  if (rateQuery.ratesLoading) return `${prefix}loading req/s…`;
  if (rateQuery.ratesError) return `${prefix}req/s unavailable (Prometheus)`;
  const r = lookupCallRate(rates, serviceName);
  if (r != null && r > 0) return `${prefix}${r.toFixed(2)} req/s`;
  if (r != null && r === 0) return `${prefix}0 req/s`;
  return `${prefix}no req/s in Prometheus for this SDK name (span service_name may differ)`;
}
