import { CacheBoxBadge, RuleTypeBadge, StatusBadge } from "@/components/services/service-badges";
import { Button } from "@/components/ui/button";
import { rulesApi, servicesApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Rule } from "@/types/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Box, X, Zap } from "lucide-react";

interface Props {
  instanceId: string;
  fallbackService?: string;
  onClose: () => void;
}

export function ServiceDetailPanel({ instanceId, fallbackService, onClose }: Props) {
  const qc = useQueryClient();

  const detail = useQuery({
    queryKey: ["sdk-instance", instanceId],
    queryFn: () => servicesApi.getSDKInstance(instanceId),
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
  });

  const rulesQuery = useQuery({
    queryKey: ["rules"],
    queryFn: rulesApi.listRules,
  });

  const activeRuleIds = new Set(detail.data?.active_rule_ids ?? []);
  const activeRules = (rulesQuery.data ?? []).filter((r) => activeRuleIds.has(r.id));
  const isInCacheBoxMode = activeRules.some((r) => r.action.type === "cachebox");

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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rules"] });
      qc.invalidateQueries({ queryKey: ["sdk-instance", instanceId] });
    },
  });

  const killSwitch = useMutation({
    mutationFn: () => servicesApi.killSwitch(instanceId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rules"] });
      qc.invalidateQueries({ queryKey: ["sdk-instance", instanceId] });
    },
  });

  const cacheBox = useMutation({
    mutationFn: () =>
      servicesApi.cacheBoxMode(instanceId, { mode: "replay", key_strategy: "exact" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rules"] });
      qc.invalidateQueries({ queryKey: ["sdk-instance", instanceId] });
    },
  });

  function onKillSwitch() {
    const count = activeRules.length;
    const msg =
      count > 0
        ? `Disable all ${count} active rule${count === 1 ? "" : "s"} on this instance?`
        : "Run the kill switch on this instance? (No active rules are currently reported.)";
    if (window.confirm(msg)) killSwitch.mutate();
  }

  function onCacheBox() {
    const msg =
      "Switch this instance to cache-box mode (replay, exact key)? " +
      "A per-instance cache-box rule will be created server-side.";
    if (window.confirm(msg)) cacheBox.mutate();
  }

  const service = detail.data?.service ?? fallbackService ?? "—";
  const status = detail.data?.status;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 border-b px-5 py-4">
        <div className="min-w-0">
          <div className="truncate text-base font-semibold">{service}</div>
          <div className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
            {instanceId}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <StatusBadge status={status} />
            {isInCacheBoxMode && <CacheBoxBadge />}
          </div>
        </div>
        <Button variant="ghost" size="icon" className="size-7" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {/* Instance metadata */}
        <Section title="Instance">
          {detail.isLoading && <Muted>Loading…</Muted>}
          {detail.isError && <Muted>Could not load instance detail.</Muted>}
          {detail.data && (
            <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-1.5">
              <Field label="Version" value={detail.data.version ?? "—"} mono />
              <Field label="Address" value={detail.data.address ?? "—"} mono />
              <Field label="Registered" value={detail.data.registered_at} />
              <Field label="Last poll" value={detail.data.last_poll_at ?? "—"} />
              {typeof detail.data.last_rule_version_acked === "number" && (
                <Field
                  label="Rule version acked"
                  value={String(detail.data.last_rule_version_acked)}
                  mono
                />
              )}
              {detail.data.last_error && (
                <Field label="Last error" value={detail.data.last_error} />
              )}
            </dl>
          )}
        </Section>

        {/* Active rules */}
        <Section title={`Active rules (${activeRules.length})`}>
          {rulesQuery.isLoading && <Muted>Loading rules…</Muted>}
          {!rulesQuery.isLoading && activeRules.length === 0 && <Muted>No active rules.</Muted>}
          {activeRules.length > 0 && (
            <div className="flex flex-col gap-2">
              {activeRules.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between gap-2 rounded-md border px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{r.name}</div>
                    <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                      p{r.priority} · {r.service}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <RuleTypeBadge rule={r} />
                    <button
                      type="button"
                      className={cn(
                        "h-[22px] cursor-pointer rounded border px-2 text-[11px] font-medium transition-colors",
                        r.enabled
                          ? "border-green-300 bg-green-100 text-green-800 hover:bg-green-200"
                          : "border-red-300 bg-red-100 text-red-800 hover:bg-red-200",
                        "disabled:cursor-not-allowed disabled:opacity-50",
                      )}
                      disabled={toggleEnabled.isPending}
                      onClick={() => toggleEnabled.mutate(r)}
                    >
                      {r.enabled ? "Enabled" : "Disabled"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Recent runs */}
        <Section title="Recent runs">
          {detail.data && detail.data.recent_run_ids.length === 0 && <Muted>No recent runs.</Muted>}
          {detail.data && detail.data.recent_run_ids.length > 0 && (
            <ul className="flex flex-col divide-y">
              {detail.data.recent_run_ids.map((id) => (
                <li key={id} className="py-1.5">
                  <span className="cursor-pointer font-mono text-[11px] text-blue-600 hover:underline">
                    {id}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      {/* Footer actions */}
      <div className="border-t px-5 py-4">
        <Button
          variant="destructive"
          className="w-full"
          onClick={onKillSwitch}
          disabled={killSwitch.isPending}
        >
          <Zap className="size-4" />
          {killSwitch.isPending ? "Disabling…" : "Kill switch"}
        </Button>
        <Button
          className={cn(
            "mt-2 w-full bg-zinc-900 text-zinc-50 shadow hover:bg-zinc-900/90",
            "dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-100/90",
          )}
          onClick={onCacheBox}
          disabled={cacheBox.isPending || isInCacheBoxMode}
        >
          <Box className="size-4" />
          {isInCacheBoxMode
            ? "In cache-box mode"
            : cacheBox.isPending
              ? "Enabling…"
              : "Cache-box mode"}
        </Button>
        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          Kill switch disables all active rules immediately. Cache-box mode replays recorded
          responses instead.
        </p>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b px-5 py-4 last:border-b-0">
      <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <>
      <dt className="whitespace-nowrap text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("truncate text-sm", mono && "font-mono text-xs")} title={value}>
        {value}
      </dd>
    </>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return <div className="text-xs text-muted-foreground">{children}</div>;
}
