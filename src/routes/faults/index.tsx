import { FaultEditor } from "@/components/fault-editor";
import { Topbar } from "@/components/layout/topbar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { faultsApi, rulesApi } from "@/lib/api";
import { formatParams } from "@/lib/faults";
import { cn } from "@/lib/utils";
import type { FaultCategory, FaultSpec } from "@/types/api";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/faults/")({
  validateSearch: (search: Record<string, unknown>) => ({
    selected: typeof search.selected === "string" ? search.selected : undefined,
  }),
  component: FaultsPage,
});

type FilterValue = FaultCategory | "all";

const FILTER_TABS: { value: FilterValue; label: string }[] = [
  { value: "all", label: "All" },
  { value: "inline", label: "Inline" },
  { value: "network", label: "Network" },
  { value: "resource", label: "Resource" },
];

function FaultsPage() {
  const { selected } = Route.useSearch();
  const [filter, setFilter] = useState<FilterValue>("all");
  const [selectedId, setSelectedId] = useState<string | null>(selected ?? null);

  const specsQuery = useQuery({
    queryKey: ["fault-specs"],
    queryFn: faultsApi.listFaultSpecs,
  });

  const rulesQuery = useQuery({
    queryKey: ["rules"],
    queryFn: rulesApi.listRules,
  });

  const specs = specsQuery.data ?? [];

  const filtered = filter === "all" ? specs : specs.filter((s) => s.category === filter);

  // Count how many rules reference each spec
  const usedByCount = (id: string): number =>
    (rulesQuery.data ?? []).filter(
      (r) => r.action.type === "fault_spec" && r.action.fault_spec_id === id,
    ).length;

  function handleNewFault() {
    setSelectedId("new");
  }

  function handleSaved(_spec: FaultSpec) {
    // Stay in "new" mode after creating so the user can rapidly create
    // multiple faults without re-clicking "+ New fault". The FaultEditor
    // resets its own form fields on successful create.
  }

  function handleDeleted() {
    setSelectedId(null);
  }

  const showPanel = selectedId !== null;

  return (
    <>
      <Topbar
        breadcrumbs={["Faults"]}
        action={
          <Button size="sm" onClick={handleNewFault}>
            <Plus className="mr-1.5 h-4 w-4" />
            New fault
          </Button>
        }
      />
      <div className="flex flex-1 gap-6 overflow-hidden px-6 py-6">
        {/* Left card — Fault library */}
        <Card
          className={cn("flex flex-col overflow-hidden p-0", showPanel ? "w-[57.5%]" : "w-full")}
        >
          {/* Card header + filter tabs */}
          <div className="flex items-start justify-between border-b border-border px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold">Fault library</h2>
              <p className="text-xs text-muted-foreground">
                Reusable fault primitives referenced by rules
              </p>
            </div>
            <Tabs
              value={filter}
              onValueChange={(v) => setFilter(v as FilterValue)}
              aria-label="Filter faults by category"
            >
              <TabsList className="h-8">
                {FILTER_TABS.map((tab) => (
                  <TabsTrigger key={tab.value} value={tab.value} className="h-6 px-2.5 text-xs">
                    {tab.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>

          {/* Table */}
          <div className="flex-1 overflow-y-auto">
            {specsQuery.isLoading ? (
              <div className="px-5 py-8 text-center text-sm text-muted-foreground">Loading…</div>
            ) : specsQuery.isError ? (
              <div className="px-5 py-8 text-center text-sm text-destructive">
                Could not load fault specs.
              </div>
            ) : filtered.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-muted-foreground">
                {specs.length === 0 ? "No fault specs yet." : "No specs match this filter."}
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="px-5 py-2 text-left font-medium">NAME</th>
                    <th className="px-3 py-2 text-left font-medium">TYPE</th>
                    <th className="px-3 py-2 text-left font-medium">PARAMS</th>
                    <th className="px-3 py-2 pr-5 text-right font-medium">USED BY</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((spec) => {
                    const count = usedByCount(spec.id);
                    const isSelected = selectedId === spec.id;
                    return (
                      <tr
                        key={spec.id}
                        tabIndex={0}
                        onClick={() => setSelectedId(spec.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            // Space would otherwise scroll the page.
                            e.preventDefault();
                            setSelectedId(spec.id);
                          }
                        }}
                        className={cn(
                          "cursor-pointer border-b border-border transition-colors last:border-0",
                          isSelected ? "bg-muted" : "hover:bg-muted/50",
                        )}
                      >
                        <td className="px-5 py-2.5">
                          <p className="font-mono text-sm font-medium">{spec.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {count > 0
                              ? `${count} rule${count === 1 ? "" : "s"} use this`
                              : "unused"}
                          </p>
                        </td>
                        <td className="px-3 py-2.5 text-xs text-foreground">{spec.category}</td>
                        <td className="px-3 py-2.5 text-xs text-muted-foreground">
                          {formatParams(spec)}
                        </td>
                        <td className="px-3 py-2.5 pr-5 text-right text-xs text-muted-foreground">
                          {count}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </Card>

        {/* Right card — Fault editor */}
        {showPanel && (
          <Card className="flex w-[42.5%] flex-col overflow-hidden p-0">
            <FaultEditor
              key={selectedId}
              faultId={selectedId}
              onSaved={handleSaved}
              onDeleted={handleDeleted}
            />
          </Card>
        )}
      </div>
    </>
  );
}
