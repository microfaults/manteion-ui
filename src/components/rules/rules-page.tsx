import { Topbar } from "@/components/layout/topbar";
import { RuleEditorPanel } from "@/components/rules/rule-editor-panel";
import { listHeader, newRuleButton, ruleRow } from "@/components/rules/rules-page.styles";
import { TargetBadge, deriveTarget, ruleSubtitle } from "@/components/rules/target-badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { rulesApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Rule } from "@/types/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search } from "lucide-react";
import { useState } from "react";

export function RulesPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isNew, setIsNew] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["rules"],
    queryFn: rulesApi.listRules,
  });

  const toggleEnabled = useMutation({
    mutationFn: (rule: Rule) =>
      rulesApi.updateRule(rule.id, {
        name: rule.name,
        service: rule.service,
        enabled: !rule.enabled,
        priority: rule.priority,
        mode: rule.mode,
        start_policy: rule.start_policy,
        action: rule.action,
        match: rule.match,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rules"] }),
  });

  const filtered = (data ?? []).filter(
    (r) =>
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.service.toLowerCase().includes(search.toLowerCase()),
  );

  const totalEnabled = (data ?? []).filter((r) => r.enabled).length;
  const showPanel = selectedId !== null || isNew;

  function openNew() {
    setSelectedId(null);
    setIsNew(true);
  }

  function openRule(id: string) {
    setIsNew(false);
    setSelectedId(id);
  }

  function closePanel() {
    setSelectedId(null);
    setIsNew(false);
  }

  return (
    <>
      <Topbar
        breadcrumbs={["Rules"]}
        action={
          <button type="button" onClick={openNew} className={newRuleButton()}>
            <Plus className="size-4" />
            New rule
          </button>
        }
      />

      <div className="flex flex-1 overflow-hidden">
        <div
          className={cn(
            "flex flex-col border-r transition-all duration-200",
            showPanel ? "w-[55%]" : "w-full",
          )}
        >
          <div className={listHeader()}>
            <div>
              <span className="text-sm font-semibold">Rules</span>
              {data && (
                <span className="ml-2 text-xs text-muted-foreground">
                  {data.length} total · {totalEnabled} enabled
                </span>
              )}
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search rules…"
                className="h-7 w-44 pl-8 text-xs"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rule</TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead className="text-right">Match priority</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-muted-foreground">
                      Loading…
                    </TableCell>
                  </TableRow>
                )}
                {isError && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-muted-foreground">
                      Could not reach manteion.
                    </TableCell>
                  </TableRow>
                )}
                {!isLoading && !isError && filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-muted-foreground">
                      {search
                        ? "No rules match your search."
                        : "No rules yet. Click New rule to create one."}
                    </TableCell>
                  </TableRow>
                )}
                {filtered.map((r) => (
                  <TableRow
                    key={r.id}
                    data-selected={selectedId === r.id || undefined}
                    className={ruleRow()}
                    onClick={() => openRule(r.id)}
                  >
                    <TableCell>
                      <div className="font-mono text-xs font-medium">{r.name}</div>
                      <div className="mt-0.5 text-[11px] text-muted-foreground">
                        {ruleSubtitle(r)}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{r.service}</TableCell>
                    <TableCell>
                      <TargetBadge target={deriveTarget(r)} />
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs tabular-nums">
                      {r.priority}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Switch
                        checked={r.enabled}
                        disabled={toggleEnabled.isPending}
                        onCheckedChange={() => toggleEnabled.mutate(r)}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        {showPanel && (
          <div className="w-[45%] overflow-hidden">
            <RuleEditorPanel
              ruleId={selectedId}
              isNew={isNew}
              onSaved={(rule) => {
                setIsNew(false);
                setSelectedId(rule.id);
              }}
              onDeleted={closePanel}
            />
          </div>
        )}
      </div>
    </>
  );
}
