import { RuleBuilder } from "@/components/rule-builder";
import { FaultSpecPicker } from "@/components/rules/fault-spec-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { rulesApi, servicesApi } from "@/lib/api";
import type { RuleInput } from "@/lib/api/rules";
import { type MatchNode, emptyRoot } from "@/lib/rego/ast";
import { compile } from "@/lib/rego/compile";
import { parse } from "@/lib/rego/parse";
import { MatchNodeSchema, type Rule, type RuleAction } from "@/types/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

// Used until servicesApi.listSDKInstances returns a non-empty list. Matches
// the online-boutique demo target; real environments should rely on the fetch.
const FALLBACK_SERVICES = [
  "productcatalog",
  "cartservice",
  "checkoutservice",
  "paymentservice",
  "shippingservice",
  "currencyservice",
  "emailservice",
  "adservice",
  "frontend",
];

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
  if (rule.match_expr) {
    const p = parse(rule.match_expr);
    if (p.ok) return p.ast;
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
    return fromApi.length > 0 ? fromApi.sort() : FALLBACK_SERVICES;
  }, [sdkInstances.data]);

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
  const [cacheboxKeyStrategy, setCacheboxKeyStrategy] = useState<
    "exact" | "exact_with_host" | "exact_with_body"
  >(existing?.action?.type === "cachebox" ? existing.action.cachebox.key_strategy : "exact");
  // Match-builder state unchanged:
  const [ast, setAst] = useState<MatchNode | undefined>(initAst);
  const [rego, setRego] = useState(existing?.match_expr ?? compile(initAst));
  const [custom, setCustom] = useState(false);

  const save = useMutation({
    mutationFn: () => {
      const action: RuleAction =
        actionType === "fault_spec"
          ? { type: "fault_spec", fault_spec_id: faultSpecId }
          : actionType === "fault_composition"
            ? { type: "fault_composition", fault_composition_id: faultCompId }
            : {
                type: "cachebox",
                cachebox: { mode: cacheboxMode, key_strategy: cacheboxKeyStrategy },
              };

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
        match_expr: rego,
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

  const del = useMutation({
    mutationFn: () => rulesApi.deleteRule(ruleId as string),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rules"] });
      onDeleted();
    },
  });

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="truncate text-sm font-semibold">{isNew ? "New rule" : name || ruleId}</h2>
        <div className="flex items-center gap-2">
          <Label htmlFor="panel-enabled" className="text-xs text-muted-foreground">
            Enabled
          </Label>
          <Switch id="panel-enabled" checked={enabled} onCheckedChange={setEnabled} />
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        <Field label="Name">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="my-rule"
            className="font-mono text-sm"
          />
        </Field>

        <Field label="Service">
          <Select value={service} onValueChange={setService}>
            <SelectTrigger className="font-mono text-sm">
              <SelectValue placeholder="Select service…" />
            </SelectTrigger>
            <SelectContent>
              {knownServices.map((s) => (
                <SelectItem key={s} value={s} className="font-mono text-sm">
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Action type">
          <Select value={actionType} onValueChange={(v) => setActionType(v as typeof actionType)}>
            <SelectTrigger aria-label="Action type" className="font-mono text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="fault_spec" className="font-mono text-sm">
                fault_spec
              </SelectItem>
              <SelectItem value="fault_composition" className="font-mono text-sm">
                fault_composition
              </SelectItem>
              <SelectItem value="cachebox" className="font-mono text-sm">
                cachebox
              </SelectItem>
            </SelectContent>
          </Select>
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
              className="font-mono text-sm"
            />
          </Field>
        )}
        {actionType === "cachebox" && (
          <>
            <Field label="Cachebox mode">
              <Select
                value={cacheboxMode}
                onValueChange={(v) => setCacheboxMode(v as typeof cacheboxMode)}
              >
                <SelectTrigger aria-label="Cachebox mode" className="font-mono text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="passthrough" className="font-mono text-sm">
                    passthrough
                  </SelectItem>
                  <SelectItem value="replay" className="font-mono text-sm">
                    replay
                  </SelectItem>
                  <SelectItem value="replay_with_delay" className="font-mono text-sm">
                    replay_with_delay
                  </SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Key strategy">
              <Select
                value={cacheboxKeyStrategy}
                onValueChange={(v) => setCacheboxKeyStrategy(v as typeof cacheboxKeyStrategy)}
              >
                <SelectTrigger aria-label="Key strategy" className="font-mono text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="exact" className="font-mono text-sm">
                    exact
                  </SelectItem>
                  <SelectItem value="exact_with_host" className="font-mono text-sm">
                    exact_with_host
                  </SelectItem>
                  <SelectItem value="exact_with_body" className="font-mono text-sm">
                    exact_with_body
                  </SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </>
        )}

        <Field label="Mode">
          <Select value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
            <SelectTrigger aria-label="Mode" className="font-mono text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="inline" className="font-mono text-sm">
                inline
              </SelectItem>
              <SelectItem value="background" className="font-mono text-sm">
                background
              </SelectItem>
            </SelectContent>
          </Select>
        </Field>

        <Field label="Injection point">
          <Select
            value={injectionPoint || "any"}
            onValueChange={(v) =>
              setInjectionPoint(v === "any" ? "" : (v as typeof injectionPoint))
            }
          >
            <SelectTrigger aria-label="Injection point" className="font-mono text-sm">
              <SelectValue placeholder="(any)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any" className="font-mono text-sm">
                (any)
              </SelectItem>
              <SelectItem value="ingress" className="font-mono text-sm">
                ingress
              </SelectItem>
              <SelectItem value="egress" className="font-mono text-sm">
                egress
              </SelectItem>
              <SelectItem value="transient" className="font-mono text-sm">
                transient
              </SelectItem>
              <SelectItem value="custom" className="font-mono text-sm">
                custom
              </SelectItem>
            </SelectContent>
          </Select>
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
            value={priority}
            onChange={(e) => setPriority(Number(e.target.value))}
            className="font-mono text-sm"
          />
        </Field>

        <details className="space-y-2">
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
            Advanced
          </summary>
          <div className="space-y-4 pt-2">
            <Field label="Start policy">
              <Select
                value={startPolicy}
                onValueChange={(v) => setStartPolicy(v as typeof startPolicy)}
              >
                <SelectTrigger aria-label="Start policy" className="font-mono text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="deduplicate_by_rule" className="font-mono text-sm">
                    deduplicate_by_rule
                  </SelectItem>
                  <SelectItem value="always_start" className="font-mono text-sm">
                    always_start
                  </SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
        </details>
      </div>

      <div className="space-y-2 border-t px-4 py-3">
        {save.isError && (
          <p className="text-xs text-destructive">
            {save.error instanceof Error ? save.error.message : "Save failed."}
          </p>
        )}
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            disabled={isNew || del.isPending}
            onClick={() => del.mutate()}
          >
            Delete
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled>
              Test push
            </Button>
            <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
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
