import { Topbar } from "@/components/layout/topbar";
import { CacheBoxBadge } from "@/components/services/service-badges";
import { ServiceDetailPanel } from "@/components/services/service-detail-panel";
import {
  groupRow,
  instanceRow,
  listHeader,
} from "@/components/services/services-page.styles";
import { StatusDot } from "@/components/status-dot";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { rulesApi, servicesApi } from "@/lib/api";
import type { SDKInstance } from "@/types/api";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Search } from "lucide-react";
import { Fragment, useMemo, useState } from "react";

type Status = SDKInstance["status"];

function dotStatus(s: Status) {
  if (s === "alive") return "healthy" as const;
  if (s === "stale") return "degraded" as const;
  if (s === "dead") return "down" as const;
  return "unknown" as const;
}

export function ServicesPage() {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const { data, isLoading, isError } = useQuery({
    queryKey: ["sdk-instances"],
    queryFn: servicesApi.listSDKInstances,
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
  });

  const rulesQuery = useQuery({
    queryKey: ["rules"],
    queryFn: rulesApi.listRules,
  });

  const cacheBoxServices = useMemo(() => {
    const set = new Set<string>();
    for (const r of rulesQuery.data ?? []) {
      if (r.enabled && r.action.type === "cachebox") set.add(r.service);
    }
    return set;
  }, [rulesQuery.data]);

  const grouped = useMemo(() => {
    const rows = (data ?? []).filter((i) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return i.service.toLowerCase().includes(q) || i.id.toLowerCase().includes(q);
    });
    const map = new Map<string, SDKInstance[]>();
    for (const inst of rows) {
      const list = map.get(inst.service) ?? [];
      list.push(inst);
      map.set(inst.service, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => (b.registered_at ?? "").localeCompare(a.registered_at ?? ""));
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [data, search]);

  const totalInstances = data?.length ?? 0;
  const totalServices = useMemo(
    () => new Set((data ?? []).map((i) => i.service)).size,
    [data],
  );
  const selectedInstance = useMemo(
    () => (data ?? []).find((i) => i.id === selectedId) ?? null,
    [data, selectedId],
  );

  function toggleGroup(service: string) {
    setCollapsed((c) => ({ ...c, [service]: !c[service] }));
  }

  function closePanel() {
    setSelectedId(null);
  }

  return (
    <>
      <Topbar breadcrumbs={["Services"]} />

      <div className="flex flex-1 gap-6 overflow-hidden p-6">
        {/* Left pane */}
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className={listHeader()}>
            {data ? (
              <span className="text-xs text-muted-foreground">
                {totalInstances} instance{totalInstances === 1 ? "" : "s"} &nbsp;·&nbsp;{" "}
                {totalServices} service{totalServices === 1 ? "" : "s"}
              </span>
            ) : (
              <span />
            )}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search services…"
                className="h-7 w-44 pl-8 text-xs"
              />
            </div>
          </div>

          <div className="flex-1 overflow-hidden rounded-lg border">
            <div className="h-full overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Instance ID</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Version</TableHead>
                    <TableHead>Last poll</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-muted-foreground">
                        Loading…
                      </TableCell>
                    </TableRow>
                  )}
                  {isError && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-muted-foreground">
                        Could not reach manteion.
                      </TableCell>
                    </TableRow>
                  )}
                  {!isLoading && !isError && grouped.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-muted-foreground">
                        {search ? "No instances match your search." : "No SDK instances registered."}
                      </TableCell>
                    </TableRow>
                  )}
                  {grouped.map(([service, instances]) => {
                    const isCollapsed = !!collapsed[service];
                    return (
                      <Fragment key={service}>
                        <TableRow className={groupRow()} onClick={() => toggleGroup(service)}>
                          <TableCell colSpan={4} className="font-medium">
                            <span className="inline-flex items-center gap-1.5">
                              {isCollapsed ? (
                                <ChevronRight className="size-3.5 text-muted-foreground" />
                              ) : (
                                <ChevronDown className="size-3.5 text-muted-foreground" />
                              )}
                              <span>{service}</span>
                              <span className="ml-1 text-xs font-normal text-muted-foreground">
                                {instances.length} instance{instances.length === 1 ? "" : "s"}
                              </span>
                            </span>
                          </TableCell>
                        </TableRow>
                        {!isCollapsed &&
                          instances.map((i) => (
                            <TableRow
                              key={i.id}
                              data-selected={selectedId === i.id || undefined}
                              className={instanceRow()}
                              onClick={() => setSelectedId(i.id)}
                            >
                              <TableCell className="font-mono text-xs">{i.id}</TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <StatusDot status={dotStatus(i.status)} label={i.status ?? "—"} />
                                  {cacheBoxServices.has(i.service) && i.status !== "dead" && (
                                    <CacheBoxBadge />
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="font-mono text-xs">{i.version ?? "—"}</TableCell>
                              <TableCell className="font-mono text-xs text-muted-foreground">
                                {i.last_poll_at ?? "—"}
                              </TableCell>
                            </TableRow>
                          ))}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>

        {/* Right pane — always visible card */}
        <div className="flex w-96 min-w-96 flex-col overflow-hidden rounded-lg border bg-card">
          {selectedId ? (
            <ServiceDetailPanel
              instanceId={selectedId}
              fallbackService={selectedInstance?.service}
              onClose={closePanel}
            />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
              <span className="text-[32px] opacity-40">⬡</span>
              <span>Select an instance to inspect it</span>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
