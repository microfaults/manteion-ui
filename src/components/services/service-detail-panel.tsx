import { ConfirmDialog } from "@/components/confirm-dialog";
import { CacheBoxBadge, RuleTypeBadge, StatusBadge } from "@/components/services/service-badges";
import { Button } from "@/components/ui/button";
import { rulesApi, servicesApi } from "@/lib/api";
import { describeApiError } from "@/lib/api-errors";
import { ApiError } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import type { Rule } from "@/types/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { X, Zap } from "lucide-react";
import { useState } from "react";

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
    retry: false,
  });
  // GET /api/v1/sdk/instances/{id} lands with manteion-go MR !29; older builds 404.
  const notExposed =
    detail.isError && detail.error instanceof ApiError && detail.error.status === 404;

  const rulesQuery = useQuery({
    queryKey: ["rules"],
    queryFn: rulesApi.listRules,
  });

  const activeRuleIds = new Set(detail.data?.active_rule_ids ?? []);
  const activeRules = (rulesQuery.data ?? []).filter((r) => activeRuleIds.has(r.id));
  const isInCacheBoxMode = activeRules.some((r) => r.action.type === "cachebox");

  // Active rules are enabled by definition; the only per-rule action is to disable one.
  const disableRule = useMutation({
    mutationFn: (rule: Rule) =>
      rulesApi.updateRule(rule.id, {
        name: rule.name,
        service: rule.service,
        enabled: false,
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

  const [confirmKillSwitch, setConfirmKillSwitch] = useState(false);
  const killSwitch = useMutation({
    mutationFn: () => servicesApi.killSwitch(instanceId),
    onSuccess: () => {
      setConfirmKillSwitch(false);
      qc.invalidateQueries({ queryKey: ["rules"] });
      qc.invalidateQueries({ queryKey: ["sdk-instance", instanceId] });
    },
  });

  const service = detail.data?.service ?? fallbackService ?? "—";
  const status = detail.data?.status;
  const observedErrors = detail.data?.observed_errors ?? [];

  // The endpoint takes an instance id but acts on the whole service.
  const killSwitchCount = activeRules.length;
  const killSwitchScope = "This applies to every instance of the service.";
  const killSwitchPrompt =
    killSwitchCount === 0
      ? `Run the kill switch for ${service}? No active rules are reported; it still cancels the service's running fault configs and applies to every instance of the service.`
      : killSwitchCount === 1
        ? `Disable the 1 active rule for ${service} and cancel its running fault configs? ${killSwitchScope}`
        : `Disable all ${killSwitchCount} active rules for ${service} and cancel its running fault configs? ${killSwitchScope}`;

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
          {detail.isError &&
            (notExposed ? (
              <Muted>
                Instance detail is not exposed by this manteion-go build (needs
                <code className="font-mono"> GET /api/v1/sdk/instances/{"{id}"}</code>).
              </Muted>
            ) : (
              <Muted>{describeApiError(detail.error)}</Muted>
            ))}
          {detail.data && (
            <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-1.5">
              <Field label="Version" value={detail.data.version ?? "—"} mono />
              <Field label="Address" value={detail.data.address ?? "—"} mono />
              <Field label="Registered" value={detail.data.registered_at} />
              <Field label="Last poll" value={detail.data.last_poll_at ?? "—"} />
              {typeof detail.data.observed_generation === "number" && (
                <Field
                  label="Generation observed"
                  value={String(detail.data.observed_generation)}
                  mono
                />
              )}
              {typeof detail.data.applied_generation === "number" && (
                <Field
                  label="Generation applied"
                  value={String(detail.data.applied_generation)}
                  mono
                />
              )}
              {observedErrors.length > 0 && (
                <>
                  <dt className="whitespace-nowrap text-xs text-muted-foreground">
                    Observed errors
                  </dt>
                  <dd className="text-sm">
                    <ul className="flex flex-col gap-1">
                      {observedErrors.map((err, i) => (
                        // biome-ignore lint/suspicious/noArrayIndexKey: the same error text can repeat
                        <li key={i} className="break-words text-status-down">
                          {err}
                        </li>
                      ))}
                    </ul>
                  </dd>
                </>
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
                        "h-[22px] cursor-pointer rounded border border-status-down/30 bg-status-down/15 px-2 text-[11px] font-medium text-status-down transition-colors hover:bg-status-down/25",
                        "disabled:cursor-not-allowed disabled:opacity-50",
                      )}
                      disabled={disableRule.isPending}
                      onClick={() => disableRule.mutate(r)}
                    >
                      Disable
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Recent phases — the backend reports phase ids that touched this service */}
        <Section title="Recent phases">
          {detail.data && detail.data.recent_run_ids.length === 0 && (
            <Muted>No recent phases.</Muted>
          )}
          {detail.data && detail.data.recent_run_ids.length > 0 && (
            <ul className="flex flex-col divide-y">
              {detail.data.recent_run_ids.map((id) => (
                <li key={id} className="py-1.5">
                  <Link
                    to="/phases/$phaseId"
                    params={{ phaseId: id }}
                    className="font-mono text-[11px] text-primary hover:underline"
                  >
                    {id}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      {/* Footer actions */}
      <div className="border-t px-5 py-4">
        {notExposed ? (
          <p className="text-center text-[11px] text-muted-foreground">
            Kill switch needs <code className="font-mono">POST …/kill-switch</code> — not exposed by
            this manteion-go build. Disable rules from the Rules page meanwhile.
          </p>
        ) : (
          <>
            <Button
              variant="destructive"
              className="w-full"
              onClick={() => {
                killSwitch.reset();
                setConfirmKillSwitch(true);
              }}
              disabled={killSwitch.isPending || detail.isLoading}
            >
              <Zap className="size-4" />
              {killSwitch.isPending ? "Disabling…" : "Kill switch"}
            </Button>
            <ConfirmDialog
              open={confirmKillSwitch}
              onOpenChange={setConfirmKillSwitch}
              title="Kill switch"
              description={killSwitchPrompt}
              confirmLabel="Run kill switch"
              destructive
              pending={killSwitch.isPending}
              error={killSwitch.isError ? describeApiError(killSwitch.error) : undefined}
              onConfirm={() => killSwitch.mutate()}
            />
            <p className="mt-2 text-center text-[11px] text-muted-foreground">
              Disables every rule for this service and cancels its active fault configs, on every
              instance. Cache-box freezes are phase-driven — release them by stopping the phase.
            </p>
          </>
        )}
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
