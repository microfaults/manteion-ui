import { ConfirmDialog } from "@/components/confirm-dialog";
import { RuleBuilder } from "@/components/rule-builder";
import { FaultSpecPicker } from "@/components/rules/fault-spec-picker";
import {
  fieldStack,
  panelChrome,
  panelFooter,
  panelFooterRight,
  panelFooterRow,
  panelHeader,
  panelTitle,
} from "@/components/rules/rule-editor.styles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { faultsApi, rulesApi, servicesApi } from "@/lib/api";
import { describeApiError } from "@/lib/api-errors";
import type { RuleInput } from "@/lib/api/rules";
import { FALLBACK_SERVICES } from "@/lib/known-services";
import { type MatchNode, emptyRoot } from "@/lib/rego/ast";
import { compile } from "@/lib/rego/compile";
import { type FaultSpecCatalog, validateRuleDraft } from "@/lib/rule-validation";
import {
  CACHEBOX_KEY_STRATEGIES,
  type CacheBoxKeyStrategy,
  DEFAULT_CACHEBOX_KEY_STRATEGY,
  MatchNodeSchema,
  type Rule,
  type RuleAction,
} from "@/types/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

/** Short labels for the raw backend enum values; order follows CACHEBOX_KEY_STRATEGIES. */
const KEY_STRATEGY_LABELS: Record<CacheBoxKeyStrategy, string> = {
  canonical_v2: "canonical v2 (default)",
  exact: "exact",
  exact_with_host: "exact + host",
  exact_with_body: "exact + body",
  exact_with_host_norm: "exact + host (normalized)",
};

const KEY_STRATEGY_OPTIONS = CACHEBOX_KEY_STRATEGIES.map((value) => ({
  value,
  label: KEY_STRATEGY_LABELS[value],
}));

type MatchCriteria = { injection_point?: string; labels?: Record<string, string> };

function matchCriteriaToAst(match: MatchCriteria): MatchNode {
  const children: MatchNode[] = [];
  if (match.injection_point) {
    children.push({
      kind: "leaf",
      field: "injection_point",
      op: "eq",
      value: match.injection_point,
    });
  }
  for (const [field, value] of Object.entries(match.labels ?? {})) {
    if (!field.startsWith("_")) {
      children.push({ kind: "leaf", field, op: "eq", value });
    }
  }
  return { kind: "group", combinator: "and", children };
}

function astToMatchCriteria(node: MatchNode): MatchCriteria {
  const labels: Record<string, string> = {};
  let injection_point: string | undefined;

  function collect(n: MatchNode) {
    if (n.kind === "leaf" && n.op === "eq" && typeof n.value === "string") {
      if (n.field === "injection_point") injection_point = n.value;
      else if (n.field !== "service") labels[n.field] = n.value;
    } else if (n.kind === "group" && n.combinator === "and") {
      for (const child of n.children) collect(child);
    }
  }
  collect(node);
  return { injection_point, labels: Object.keys(labels).length ? labels : undefined };
}

function initialAstFromRule(rule: Rule | undefined): MatchNode {
  if (!rule) return emptyRoot();
  if (rule.match_ast) {
    const parsed = MatchNodeSchema.safeParse(rule.match_ast);
    if (parsed.success) return parsed.data as MatchNode;
  }
  if (rule.match) return matchCriteriaToAst(rule.match);
  return emptyRoot();
}

interface RuleEditorPanelProps {
  ruleId: string | null;
  isNew: boolean;
  onSaved: (rule: Rule) => void;
  onDeleted: () => void;
}

export function RuleEditorPanel({ ruleId, isNew, onSaved, onDeleted }: RuleEditorPanelProps) {
  const { data: existing, isLoading } = useQuery({
    queryKey: ["rule", ruleId],
    queryFn: () => rulesApi.getRule(ruleId as string),
    enabled: !isNew && ruleId !== null,
  });

  if (!isNew && isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  return (
    <RuleEditorForm
      key={isNew ? "new" : (ruleId ?? "empty")}
      isNew={isNew}
      ruleId={ruleId}
      existing={existing}
      onSaved={onSaved}
      onDeleted={onDeleted}
    />
  );
}

function RuleEditorForm({
  isNew,
  ruleId,
  existing,
  onSaved,
  onDeleted,
}: {
  isNew: boolean;
  ruleId: string | null;
  existing: Rule | undefined;
  onSaved: (rule: Rule) => void;
  onDeleted: () => void;
}) {
  const qc = useQueryClient();
  const initAst = useMemo(() => initialAstFromRule(existing), [existing]);

  const sdkInstances = useQuery({
    queryKey: ["sdk-instances"],
    queryFn: servicesApi.listSDKInstances,
  });
  const knownServices = useMemo(() => {
    const fromApi = Array.from(new Set(sdkInstances.data?.map((i) => i.service) ?? []));
    return fromApi.length > 0 ? fromApi.sort() : [...FALLBACK_SERVICES];
  }, [sdkInstances.data]);

  // Shared cache with FaultSpecPicker (same key) — the form needs the catalog
  // to enforce the rules-require-faults prerequisite at save time.
  const specsQuery = useQuery({
    queryKey: ["fault-specs"],
    queryFn: faultsApi.listFaultSpecs,
    retry: 1,
    staleTime: 30_000,
  });
  const catalog: FaultSpecCatalog = specsQuery.isSuccess
    ? { status: "ready", specIds: specsQuery.data.map((s) => s.id) }
    : { status: specsQuery.isError ? "error" : "loading" };

  const [name, setName] = useState(existing?.name ?? "");
  const [service, setService] = useState(existing?.service ?? "");
  const [enabled, setEnabled] = useState(existing?.enabled ?? true);
  const [priority, setPriority] = useState(existing?.priority ?? 50);
  const [mode, setMode] = useState<"inline" | "background">(existing?.mode ?? "inline");
  const [startPolicy, setStartPolicy] = useState<"deduplicate_by_rule" | "always_start">(
    existing?.start_policy ?? "deduplicate_by_rule",
  );
  const [injectionPoint, setInjectionPoint] = useState<
    "" | "ingress" | "egress" | "transient" | "custom"
  >(existing?.match?.injection_point ?? "");
  const [actionType, setActionType] = useState<"fault_spec" | "fault_composition" | "cachebox">(
    existing?.action?.type ?? "fault_spec",
  );
  const [faultSpecId, setFaultSpecId] = useState(
    existing?.action?.type === "fault_spec" ? existing.action.fault_spec_id : "",
  );
  const [faultCompId, setFaultCompId] = useState(
    existing?.action?.type === "fault_composition" ? existing.action.fault_composition_id : "",
  );
  const [cacheboxMode, setCacheboxMode] = useState<"passthrough" | "replay" | "replay_with_delay">(
    existing?.action?.type === "cachebox" ? existing.action.cachebox.mode : "passthrough",
  );
  const [cacheboxKeyStrategy, setCacheboxKeyStrategy] = useState<CacheBoxKeyStrategy>(
    existing?.action?.type === "cachebox"
      ? existing.action.cachebox.key_strategy
      : DEFAULT_CACHEBOX_KEY_STRATEGY,
  );
  // Match-builder state unchanged. The compiled rego is display-only since
  // schema epoch 2 dropped match_expr from the rule model — the builder AST
  // (match_ast) plus the derived match criteria are what get persisted.
  const [ast, setAst] = useState<MatchNode | undefined>(initAst);
  const [rego, setRego] = useState(compile(initAst));
  const [custom, setCustom] = useState(false);

  const action: RuleAction =
    actionType === "fault_spec"
      ? { type: "fault_spec", fault_spec_id: faultSpecId }
      : actionType === "fault_composition"
        ? { type: "fault_composition", fault_composition_id: faultCompId }
        : { type: "cachebox", cachebox: { mode: cacheboxMode, key_strategy: cacheboxKeyStrategy } };

  const issues = validateRuleDraft({ name, service, priority, action }, catalog);
  const issueOn = (field: string) => issues.some((i) => i.field === field);

  const save = useMutation({
    mutationFn: () => {
      const labelsForBackend = ast ? astToMatchCriteria(ast).labels : undefined;
      const input: RuleInput = {
        name,
        service,
        enabled,
        priority,
        mode,
        start_policy: startPolicy,
        action,
        match: {
          injection_point: injectionPoint || undefined,
          labels: labelsForBackend,
        },
        match_ast: custom ? undefined : ast,
      };
      return isNew ? rulesApi.createRule(input) : rulesApi.updateRule(ruleId as string, input);
    },
    onSuccess: (rule) => {
      qc.invalidateQueries({ queryKey: ["rules"] });
      qc.invalidateQueries({ queryKey: ["rule", rule.id] });
      onSaved(rule);
    },
  });

  const [confirmDelete, setConfirmDelete] = useState(false);
  const del = useMutation({
    mutationFn: () => rulesApi.deleteRule(ruleId as string),
    onSuccess: () => {
      setConfirmDelete(false);
      qc.invalidateQueries({ queryKey: ["rules"] });
      onDeleted();
    },
  });

  return (
    <div className={panelChrome()}>
      <div className={panelHeader()}>
        <h2 className={panelTitle()}>{isNew ? "New rule" : name || ruleId}</h2>
        <div className="flex items-center gap-2">
          <Label htmlFor="panel-enabled" className="text-xs text-muted-foreground">
            Enabled
          </Label>
          <Switch id="panel-enabled" checked={enabled} onCheckedChange={setEnabled} />
        </div>
      </div>

      <div className={fieldStack()}>
        <Field label="Name">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="my-rule"
            invalid={issueOn("name") && name.length > 0}
            mono
            className="text-sm"
          />
        </Field>

        <Field label="Service">
          <NativeSelect
            aria-label="Service"
            value={service}
            onChange={(e) => setService(e.target.value)}
            placeholder="Select service…"
            options={knownServices}
            className="font-mono text-sm"
          />
        </Field>

        <Field label="Action type">
          <NativeSelect
            aria-label="Action type"
            value={actionType}
            onChange={(e) => setActionType(e.target.value as typeof actionType)}
            options={["fault_spec", "fault_composition", "cachebox"]}
            className="font-mono text-sm"
          />
        </Field>

        {actionType === "fault_spec" && (
          <Field label="Fault spec">
            <FaultSpecPicker value={faultSpecId} onChange={setFaultSpecId} />
          </Field>
        )}
        {actionType === "fault_composition" && (
          <Field label="Fault composition">
            <Input
              value={faultCompId}
              onChange={(e) => setFaultCompId(e.target.value)}
              placeholder="comp-…"
              mono
              className="text-sm"
            />
          </Field>
        )}
        {actionType === "cachebox" && (
          <>
            <Field label="Cachebox mode">
              <NativeSelect
                aria-label="Cachebox mode"
                value={cacheboxMode}
                onChange={(e) => setCacheboxMode(e.target.value as typeof cacheboxMode)}
                options={["passthrough", "replay", "replay_with_delay"]}
                className="font-mono text-sm"
              />
            </Field>
            <Field label="Key strategy">
              <NativeSelect
                aria-label="Key strategy"
                value={cacheboxKeyStrategy}
                onChange={(e) =>
                  setCacheboxKeyStrategy(e.target.value as typeof cacheboxKeyStrategy)
                }
                options={KEY_STRATEGY_OPTIONS}
                className="font-mono text-sm"
              />
            </Field>
          </>
        )}

        <Field label="Mode">
          <NativeSelect
            aria-label="Mode"
            value={mode}
            onChange={(e) => setMode(e.target.value as typeof mode)}
            options={["inline", "background"]}
            className="font-mono text-sm"
          />
        </Field>

        <Field label="Injection point">
          <NativeSelect
            aria-label="Injection point"
            value={injectionPoint || "any"}
            onChange={(e) =>
              setInjectionPoint(
                e.target.value === "any" ? "" : (e.target.value as typeof injectionPoint),
              )
            }
            options={[{ value: "any", label: "(any)" }, "ingress", "egress", "transient", "custom"]}
            className="font-mono text-sm"
          />
        </Field>

        <Separator />

        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Match criteria</Label>
          <p className="text-[11px] text-muted-foreground">
            Build a rule condition or paste OPA rego directly.
          </p>
          <RuleBuilder
            ast={ast}
            rego={rego}
            onChange={(next) => {
              setAst(next.ast);
              setRego(next.rego);
              setCustom(next.custom);
            }}
          />
        </div>

        <Field
          label="Match priority"
          hint="Higher numbers are evaluated first when multiple rules match the same request. Typical range 0–100."
        >
          <Input
            type="number"
            min={0}
            max={1000}
            value={Number.isNaN(priority) ? "" : priority}
            onChange={(e) =>
              setPriority(e.target.value === "" ? Number.NaN : Number(e.target.value))
            }
            invalid={issueOn("priority")}
            mono
            className="text-sm"
          />
        </Field>

        <details className="space-y-2">
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
            Advanced
          </summary>
          <div className="space-y-4 pt-2">
            <Field label="Start policy">
              <NativeSelect
                aria-label="Start policy"
                value={startPolicy}
                onChange={(e) => setStartPolicy(e.target.value as typeof startPolicy)}
                options={["deduplicate_by_rule", "always_start"]}
                className="font-mono text-sm"
              />
            </Field>
          </div>
        </details>
      </div>

      <div className={panelFooter()}>
        {issues.length > 0 && (
          <ul className="space-y-0.5 text-[11px] text-muted-foreground">
            {issues.map((i) => (
              <li key={`${i.field}:${i.message}`}>{i.message}</li>
            ))}
          </ul>
        )}
        {save.isError && (
          <p className="text-xs text-destructive">
            {save.error instanceof Error ? save.error.message : "Save failed."}
          </p>
        )}
        <div className={panelFooterRow()}>
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            disabled={isNew || del.isPending}
            onClick={() => {
              del.reset();
              setConfirmDelete(true);
            }}
          >
            Delete
          </Button>
          <ConfirmDialog
            open={confirmDelete}
            onOpenChange={setConfirmDelete}
            title="Delete this rule?"
            description={`Removes ${name || ruleId}. This cannot be undone.`}
            confirmLabel="Delete rule"
            destructive
            pending={del.isPending}
            error={del.isError ? describeApiError(del.error) : undefined}
            onConfirm={() => del.mutate()}
          />
          <div className={panelFooterRight()}>
            <Button variant="outline" size="sm" disabled>
              Test push
            </Button>
            <Button
              size="sm"
              onClick={() => save.mutate()}
              disabled={save.isPending || issues.length > 0}
            >
              {save.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium">{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
