/**
 * Heuristic categorizer for fault rules.
 *
 * Manteion stores rules with a free-form `match.injection_point` and
 * labels{} bag — there is no first-class `category` column yet. The
 * dashboard's "Active faults" stat-card wants a breakdown by kind, so
 * this module bucketizes by string-matching the rule's name, service,
 * injection point, and labels.
 *
 * Once the backend exposes a typed category (see docs/API-NEEDED.md
 * §B.3#3), this whole module can be replaced by a direct field read.
 */
import type { Rule } from "@/types/api";

export function bucketFaultRules(rules: Rule[]): {
  inline: number;
  network: number;
  cacheBox: number;
} {
  let inline = 0;
  let network = 0;
  let cacheBox = 0;
  for (const r of rules) {
    const cat = categorizeFaultRule(r);
    if (cat === "cache-box") cacheBox++;
    else if (cat === "network") network++;
    else inline++;
  }
  return { inline, network, cacheBox };
}

function categorizeFaultRule(r: Rule): "inline" | "network" | "cache-box" {
  const ip = (r.match?.injection_point ?? "").toLowerCase();
  const blob =
    ip +
    JSON.stringify(r.match?.labels ?? {}).toLowerCase() +
    r.name.toLowerCase() +
    (r.service ?? "").toLowerCase();
  if (blob.includes("cache") || blob.includes("replay") || blob.includes("freeze"))
    return "cache-box";
  if (blob.includes("network") || blob.includes("egress") || blob.includes("timeout"))
    return "network";
  return "inline";
}
