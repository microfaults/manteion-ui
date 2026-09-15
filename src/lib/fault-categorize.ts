/**
 * Buckets enabled rules by the kind of fault they inject, for the dashboard's
 * "Active faults" card. The category comes from each rule's fault spec
 * (lib/rule-target); heuristics only apply to specs that do not resolve.
 */
import { type FaultSpecLookup, deriveTarget } from "@/lib/rule-target";
import type { Rule } from "@/types/api";

export interface FaultBuckets {
  inline: number;
  network: number;
  resource: number;
  cacheBox: number;
}

export function bucketFaultRules(rules: readonly Rule[], specs?: FaultSpecLookup): FaultBuckets {
  const b: FaultBuckets = { inline: 0, network: 0, resource: 0, cacheBox: 0 };
  for (const r of rules) {
    const target = deriveTarget(r, specs);
    if (target === "cachebox") b.cacheBox++;
    else b[target]++;
  }
  return b;
}

/** "1 inline · 2 resource" with empty buckets left out; "none enabled" when all are empty. */
export function faultBucketsLabel(b: FaultBuckets): string {
  const parts = [
    [b.inline, "inline"],
    [b.network, "network"],
    [b.resource, "resource"],
    [b.cacheBox, "cache-box"],
  ]
    .filter(([n]) => (n as number) > 0)
    .map(([n, label]) => `${n} ${label}`);
  return parts.length ? parts.join(" · ") : "none enabled";
}
