import { StatusDot } from "@/components/status-dot";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { rulesApi, servicesApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Rule, SDKInstance } from "@/types/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Box, X, Zap } from "lucide-react";

type Status = SDKInstance["status"];

function dotStatus(s: Status) {
  if (s === "alive") return "healthy" as const;
  if (s === "stale") return "degraded" as const;
  if (s === "dead") return "down" as const;
  return "unknown" as const;
}

/** Map a rule's action+mode to a short type label for the badge. */
function ruleTypeLabel(rule: Rule): string {
  if (rule.action.type === "cachebox") return "cache-box";
  return rule.mode;
}

interface Props {
  instanceId: string;
  /** Service name from the list row, used while the detail fetch is in flight. */
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

  function onKillSwitch() {
    const count = activeRules.length;
    const msg =
      count > 0
        ? `Disable all ${count} active rule${count === 1 ? "" : "s"} on this instance?`
        : "Run the kill switch on this instance? (No active rules are currently reported.)";
    if (window.confirm(msg)) killSwitch.mutate();
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
          <div className="mt-2">
            <StatusDot status={dotStatus(status)} label={status ?? "—"} />
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
                    <Badge variant="outline" className="font-normal">
                      {ruleTypeLabel(r)}
                    </Badge>
                    <Switch
                      checked={r.enabled}
                      disabled={toggleEnabled.isPending}
                      onCheckedChange={() => toggleEnabled.mutate(r)}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Recent runs — IDs only until a runs list endpoint exists. */}
        <Section title="Recent runs">
          {detail.data && detail.data.recent_run_ids.length === 0 && (
            <Muted>No recent runs.</Muted>
          )}
          {detail.data && detail.data.recent_run_ids.length > 0 && (
            <ul className="flex flex-col gap-1">
              {detail.data.recent_run_ids.map((id) => (
                <li key={id} className="font-mono text-xs text-muted-foreground">
                  {id}
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
          variant="secondary"
          className={cn("mt-2 w-full")}
          disabled
          title="Endpoint not yet defined — see docs/api/api-needed.md"
        >
          <Box className="size-4" />
          Cache-box mode
        </Button>
        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          Kill switch disables all active rules on this instance immediately.
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
      <dd
        className={cn(
          "truncate text-sm",
          mono && "font-mono text-xs",
        )}
        title={value}
      >
        {value}
      </dd>
    </>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return <div className="text-xs text-muted-foreground">{children}</div>;
}
