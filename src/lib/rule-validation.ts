/**
 * Rule-draft validation, including the "rules reference faults" prerequisite:
 * a fault_spec rule can only be saved against a spec that exists. The catalog
 * context distinguishes loaded-and-empty (block, point at the Faults page)
 * from unreachable (keep the manual-ID escape hatch for older backends).
 */
import type { RuleAction } from "@/types/api";

export interface RuleDraft {
  name: string;
  service: string;
  priority: number;
  action: RuleAction;
}

export type FaultSpecCatalog =
  | { status: "ready"; specIds: readonly string[] }
  | { status: "loading" | "error" };

export interface RuleIssue {
  field: "name" | "service" | "priority" | "action";
  message: string;
}

export function validateRuleDraft(draft: RuleDraft, catalog: FaultSpecCatalog): RuleIssue[] {
  const issues: RuleIssue[] = [];

  if (!draft.name.trim()) issues.push({ field: "name", message: "Name is required." });
  if (!draft.service.trim()) issues.push({ field: "service", message: "Service is required." });

  if (!Number.isInteger(draft.priority) || draft.priority < 0 || draft.priority > 1000) {
    issues.push({
      field: "priority",
      message: "Priority must be an integer between 0 and 1000.",
    });
  }

  switch (draft.action.type) {
    case "fault_spec": {
      const id = draft.action.fault_spec_id;
      if (catalog.status === "ready" && catalog.specIds.length === 0) {
        issues.push({
          field: "action",
          message: "No fault specs exist yet — create one on the Faults page first.",
        });
      } else if (!id) {
        issues.push({ field: "action", message: "Pick a fault spec." });
      } else if (catalog.status === "ready" && !catalog.specIds.includes(id)) {
        issues.push({
          field: "action",
          message: `Unknown fault spec "${id}" — pick one from the catalog.`,
        });
      }
      break;
    }
    case "fault_composition":
      if (!draft.action.fault_composition_id) {
        issues.push({ field: "action", message: "Fault composition ID is required." });
      }
      break;
    case "cachebox":
      break;
  }

  return issues;
}
