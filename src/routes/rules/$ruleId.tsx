import { Topbar } from "@/components/layout/topbar";
import { RuleBuilder } from "@/components/rule-builder";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { rulesApi } from "@/lib/api";
import { type MatchNode, emptyRoot } from "@/lib/rego/ast";
import { compile } from "@/lib/rego/compile";
import { parse } from "@/lib/rego/parse";
import type { Rule } from "@/types/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";

export const Route = createFileRoute("/rules/$ruleId")({
  component: RuleEditorPage,
});

function RuleEditorPage() {
  const { ruleId } = Route.useParams();
  const isNew = ruleId === "new";
  const navigate = useNavigate();
  const qc = useQueryClient();

  const rule = useQuery({
    queryKey: ["rule", ruleId],
    queryFn: () => rulesApi.getRule(ruleId),
    enabled: !isNew,
  });

  const initial = useMemo<Rule | undefined>(() => {
    if (isNew) return undefined;
    return rule.data;
  }, [isNew, rule.data]);

  const [name, setName] = useState(initial?.name ?? "");
  const [service, setService] = useState(initial?.service ?? "");
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);
  const [priority, setPriority] = useState<number>(initial?.priority ?? 50);
  const [faultSpecId, setFaultSpecId] = useState<string>(initial?.fault_spec_id ?? "");
  const [mode] = useState<"inline" | "background">(initial?.mode ?? "inline");

  const initialAst = useMemo<MatchNode>(() => {
    if (initial?.match_ast) return initial.match_ast as MatchNode;
    if (initial?.match_expr) {
      const p = parse(initial.match_expr);
      if (p.ok) return p.ast;
    }
    return emptyRoot();
  }, [initial]);

  const [ast, setAst] = useState<MatchNode | undefined>(initialAst);
  const [rego, setRego] = useState<string>(initial?.match_expr ?? compile(initialAst));
  const [custom, setCustom] = useState<boolean>(false);

  const save = useMutation({
    mutationFn: () => {
      const input = {
        name,
        service,
        enabled,
        priority,
        fault_spec_id: faultSpecId || undefined,
        mode,
        match_ast: custom ? undefined : ast,
        match_expr: rego,
      } as const;
      return isNew ? rulesApi.createRule(input) : rulesApi.updateRule(ruleId, input);
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["rules"] });
      qc.invalidateQueries({ queryKey: ["rule", r.id] });
      if (isNew) navigate({ to: "/rules/$ruleId", params: { ruleId: r.id } });
    },
  });

  const del = useMutation({
    mutationFn: () => rulesApi.deleteRule(ruleId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rules"] });
      navigate({ to: "/rules" });
    },
  });

  return (
    <>
      <Topbar breadcrumbs={["Rules", isNew ? "New rule" : name || ruleId]} />
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto max-w-4xl space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">{isNew ? "New rule" : name || ruleId}</CardTitle>
              <div className="flex items-center gap-3">
                <Label htmlFor="rule-enabled" className="text-xs text-muted-foreground">
                  Enabled
                </Label>
                <Switch id="rule-enabled" checked={enabled} onCheckedChange={setEnabled} />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Field label="Name" htmlFor="rule-name">
                  <Input
                    id="rule-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="freeze-productcatalog"
                    className="font-mono"
                  />
                </Field>
                <Field label="Service" htmlFor="rule-service">
                  <Input
                    id="rule-service"
                    value={service}
                    onChange={(e) => setService(e.target.value)}
                    placeholder="productcatalog"
                    className="font-mono"
                  />
                </Field>
                <Field label="Fault primitive" htmlFor="rule-fault">
                  <Input
                    id="rule-fault"
                    value={faultSpecId}
                    onChange={(e) => setFaultSpecId(e.target.value)}
                    placeholder="fault spec id (Faults library not yet wired)"
                    className="font-mono"
                  />
                </Field>
                <Field label="Priority" htmlFor="rule-priority">
                  <Input
                    id="rule-priority"
                    type="number"
                    value={priority}
                    onChange={(e) => setPriority(Number(e.target.value))}
                    className="font-mono"
                  />
                </Field>
              </div>

              <Separator />

              <div>
                <div className="mb-2 flex items-end justify-between">
                  <div>
                    <h3 className="text-sm font-semibold">Match criteria</h3>
                    <p className="text-xs text-muted-foreground">
                      Build a rule condition or paste OPA rego directly.
                    </p>
                  </div>
                </div>
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
            </CardContent>
          </Card>

          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              disabled={isNew || del.isPending}
              onClick={() => del.mutate()}
            >
              Delete
            </Button>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                disabled={isNew}
                onClick={() => {
                  // placeholder — test-push endpoint is NEW
                  alert(
                    "POST /api/v1/rules/{id}/test-push is not implemented in manteion-go yet — see docs/API-NEEDED.md",
                  );
                }}
              >
                Test push
              </Button>
              <Button onClick={() => save.mutate()} disabled={save.isPending}>
                {save.isPending ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={htmlFor} className="text-xs font-medium">
        {label}
      </Label>
      {children}
    </div>
  );
}
