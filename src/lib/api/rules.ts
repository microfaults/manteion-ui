import { type MatchNode, type Rule, RuleSchema } from "@/types/api";
import { z } from "zod";
import { apiClient } from "./client";

const RulesList = z.array(RuleSchema);

export async function listRules(): Promise<Rule[]> {
  return apiClient.get("/api/v1/rules", RulesList);
}

export async function getRule(id: string): Promise<Rule> {
  return apiClient.get(`/api/v1/rules/${encodeURIComponent(id)}`, RuleSchema);
}

export interface RuleInput {
  name: string;
  service: string;
  enabled: boolean;
  priority: number;
  match_ast?: MatchNode;
  match_expr?: string;
  match?: { injection_point?: string; labels?: Record<string, string> };
  fault_spec_id?: string;
  fault_composition_id?: string;
  mode: "inline" | "background";
}

export async function createRule(input: RuleInput): Promise<Rule> {
  return apiClient.post("/api/v1/rules", input, RuleSchema);
}

export async function updateRule(id: string, input: RuleInput): Promise<Rule> {
  return apiClient.put(`/api/v1/rules/${encodeURIComponent(id)}`, input, RuleSchema);
}

export async function deleteRule(id: string): Promise<void> {
  await apiClient.del(`/api/v1/rules/${encodeURIComponent(id)}`);
}

/** NEW endpoint — see docs/API-NEEDED.md. Backend returns the decision trace
 *  of evaluating this rule against a specific SDK instance. */
export interface TestPushResult {
  matched: boolean;
  trace: string[];
  rule_version: number;
  sdk_instance_id: string;
}
const TestPushResultSchema: z.ZodType<TestPushResult> = z.object({
  matched: z.boolean(),
  trace: z.array(z.string()),
  rule_version: z.number(),
  sdk_instance_id: z.string(),
});

export async function testPushRule(id: string, sdkInstanceId: string): Promise<TestPushResult> {
  return apiClient.post(
    `/api/v1/rules/${encodeURIComponent(id)}/test-push?sdk_instance=${encodeURIComponent(sdkInstanceId)}`,
    {},
    TestPushResultSchema,
  );
}

/** NEW — compile a MatchNode AST to a rego string, server-side.
 *  UI also compiles client-side for preview; server compile is authoritative. */
export async function compileMatch(ast: MatchNode): Promise<{ rego: string }> {
  return apiClient.post("/api/v1/rules/compile-match", { ast }, z.object({ rego: z.string() }));
}

/** NEW — validate a rego snippet and, if possible, project it back into an AST. */
export async function validateRego(rego: string): Promise<{
  ok: boolean;
  diagnostics: string[];
  ast?: MatchNode;
}> {
  return apiClient.post(
    "/api/v1/rules/validate-rego",
    { rego },
    z.object({
      ok: z.boolean(),
      diagnostics: z.array(z.string()),
      ast: z.unknown().optional(),
    }),
  ) as Promise<{ ok: boolean; diagnostics: string[]; ast?: MatchNode }>;
}
