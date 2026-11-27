/**
 * Which kind of fault a rule injects, and a one-line label for it. The
 * authoritative answer is the referenced fault spec's category from the
 * Faults library; the `_target` label and id-prefix heuristics only cover
 * specs the caller could not resolve (fixtures with descriptive ids,
 * compositions).
 */
import type { FaultCategory, FaultSpec, Rule } from "@/types/api";

export type RuleTarget = FaultCategory | "cachebox";
export type FaultSpecLookup = ReadonlyMap<string, Pick<FaultSpec, "name" | "category">>;

export function specLookup(
  specs: readonly Pick<FaultSpec, "id" | "name" | "category">[] | undefined,
): FaultSpecLookup {
  return new Map((specs ?? []).map((s) => [s.id, s]));
}

const TARGETS: readonly string[] = ["inline", "network", "resource", "cachebox"];

function faultId(action: Rule["action"]): string {
  if (action.type === "fault_spec") return action.fault_spec_id;
  if (action.type === "fault_composition") return action.fault_composition_id;
  return "";
}

export function deriveTarget(
  rule: Pick<Rule, "action" | "match">,
  specs?: FaultSpecLookup,
): RuleTarget {
  const action = rule.action;
  if (action.type === "cachebox") return "cachebox";
  const resolved = action.type === "fault_spec" ? specs?.get(action.fault_spec_id) : undefined;
  if (resolved) return resolved.category;
  const stored = rule.match?.labels?._target;
  if (stored && TARGETS.includes(stored)) return stored as RuleTarget;
  const id = faultId(action);
  if (id.startsWith("network:") || id.startsWith("spec-network")) return "network";
  if (id.startsWith("resource:") || id.startsWith("spec-resource")) return "resource";
  return "inline";
}

export function ruleSubtitle(rule: Rule, specs?: FaultSpecLookup): string {
  const target = deriveTarget(rule, specs);
  const action = rule.action;
  const resolved = action.type === "fault_spec" ? specs?.get(action.fault_spec_id) : undefined;
  if (resolved) return `${target} · ${resolved.name}`;
  // A cache-box rule's detail is its mode, verbatim: "cachebox · replay".
  if (action.type === "cachebox") return detailed(target, action.cachebox.mode);
  const id = faultId(action);
  if (!id) return target;
  const parts = id.split(":");
  if (parts.length >= 2 && parts[0] === target) return `${target} · ${parts.slice(1).join(":")}`;
  return `${target} · ${id.slice(0, 24)}`;
}

/** "target · detail", or the target alone when the detail adds nothing. */
function detailed(target: string, detail: string | undefined): string {
  return detail && detail !== target ? `${target} · ${detail}` : target;
}
