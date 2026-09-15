import type { SDKInstance } from "@/types/api";

export interface ServiceHealth {
  services: number;
  healthy: number;
  degraded: number;
  failing: number;
  unknown: number;
}

/** Best state wins per service: alive > stale > unreported > dead. */
const RANK = { alive: 4, stale: 3, unknown: 2, dead: 1 } as const;

/**
 * Health per service rather than per registration. Pods get replaced, so
 * dead registrations of old pods linger next to the live one; a service is
 * failing only when every one of its registrations is dead.
 */
export function summarizeServiceHealth(
  instances: readonly Pick<SDKInstance, "service" | "status">[],
): ServiceHealth {
  const best = new Map<string, number>();
  for (const i of instances) {
    const rank = RANK[i.status ?? "unknown"];
    best.set(i.service, Math.max(best.get(i.service) ?? 0, rank));
  }
  const out: ServiceHealth = {
    services: best.size,
    healthy: 0,
    degraded: 0,
    failing: 0,
    unknown: 0,
  };
  for (const rank of best.values()) {
    if (rank === RANK.alive) out.healthy++;
    else if (rank === RANK.stale) out.degraded++;
    else if (rank === RANK.unknown) out.unknown++;
    else out.failing++;
  }
  return out;
}
