import { RuleBuilder } from "@/components/rule-builder";
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
import { type MatchNode, emptyRoot } from "@/lib/rego/ast";
import { compile } from "@/lib/rego/compile";
import { parse } from "@/lib/rego/parse";
import { MatchNodeSchema, type Rule } from "@/types/api";
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
  const [faultSpecId, setFaultSpecId] = useState(existing?.fault_spec_id ?? "");
  const [mode] = useState<"inline" | "background">(existing?.mode ?? "inline");
  const [ast, setAst] = useState<MatchNode | undefined>(initAst);
  const [rego, setRego] = useState(existing?.match_expr ?? compile(initAst));
  const [custom, setCustom] = useState(false);

  const save = useMutation({
    mutationFn: () => {
      const input = {
        name,
        service,
        enabled,
        priority,
        mode,
        fault_spec_id: faultSpecId || undefined,
        match_ast: custom ? undefined : ast,
        match_expr: rego,
        match: ast ? astToMatchCriteria(ast) : undefined,
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

        <Field label="Fault primitive">
          <Input
            value={faultSpecId}
            onChange={(e) => setFaultSpecId(e.target.value)}
            placeholder="spec-…"
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

        <Field label="Priority">
          <Input
            type="number"
            value={priority}
            onChange={(e) => setPriority(Number(e.target.value))}
            className="font-mono text-sm"
          />
        </Field>
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium">{label}</Label>
      {children}
    </div>
  );
}
