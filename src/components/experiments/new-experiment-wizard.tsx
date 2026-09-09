/**
 * New-experiment wizard: 1 Details → 2 Phase plan (+ preflight) → Create /
 * Create & start. Rules are never enabled here (decision 1): the preflight
 * only warns and points at the Rules page. Backend errors are shown verbatim.
 */
import { PhasePlanEditor } from "@/components/experiments/phase-plan-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { experimentsApi, rulesApi, servicesApi, workflowsApi } from "@/lib/api";
import { describeApiError } from "@/lib/api-errors";
import {
  type ExperimentDraft,
  type PreflightItem,
  type RuleRef,
  draftToCreateInput,
  emptyDraft,
  preflight,
  validateDraft,
} from "@/lib/experiment-draft";
import { knownServices } from "@/lib/known-services";
import { cn } from "@/lib/utils";
import type { Experiment } from "@/types/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { useMemo, useState } from "react";

const OPERATOR_KEY = "manteion.operator";

function defaultOperator(): string {
  const env = import.meta.env.VITE_OPERATOR as string | undefined;
  if (env) return env;
  try {
    return localStorage.getItem(OPERATOR_KEY) ?? "";
  } catch {
    return "";
  }
}

function rememberOperator(name: string) {
  try {
    if (name) localStorage.setItem(OPERATOR_KEY, name);
  } catch {
    /* private mode */
  }
}

interface NewExperimentWizardProps {
  onCreated: (experiment: Experiment, started: boolean) => void;
  onCancel: () => void;
}

export function NewExperimentWizard({ onCreated, onCancel }: NewExperimentWizardProps) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<1 | 2>(1);
  const [draft, setDraft] = useState<ExperimentDraft>(() => ({
    ...emptyDraft(),
    created_by: defaultOperator(),
  }));
  const [triedNext, setTriedNext] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const workflows = useQuery({
    queryKey: ["workflows"],
    queryFn: workflowsApi.listWorkflows,
    staleTime: 30_000,
  });
  const rulesQuery = useQuery({
    queryKey: ["rules"],
    queryFn: rulesApi.listRules,
    staleTime: 30_000,
  });
  const experiments = useQuery({
    queryKey: ["experiments"],
    queryFn: experimentsApi.listExperiments,
    staleTime: 10_000,
    retry: false,
  });
  const instances = useQuery({
    queryKey: ["sdk-instances"],
    queryFn: servicesApi.listSDKInstances,
    staleTime: 30_000,
    retry: false,
  });

  const rules: RuleRef[] = useMemo(
    () =>
      (rulesQuery.data ?? []).map((r) => ({
        id: r.id,
        name: r.name,
        service: r.service,
        enabled: r.enabled,
      })),
    [rulesQuery.data],
  );
  const services = useMemo(
    () =>
      knownServices(
        instances.data?.map((i) => i.service),
        rules.map((r) => r.service),
        workflows.data?.flatMap((w) => w.targets),
      ),
    [instances.data, rules, workflows.data],
  );

  const issues = useMemo(() => validateDraft(draft), [draft]);
  const nameIssue = issues.find((i) => i.code === "name-required");
  const checks: PreflightItem[] = useMemo(
    () =>
      preflight({
        draft,
        rules,
        experiments: experiments.data ?? [],
        sdkInstanceCount: instances.isSuccess ? instances.data.length : undefined,
      }),
    [draft, rules, experiments.data, instances.isSuccess, instances.data],
  );
  const blocked = issues.length > 0 || checks.some((c) => c.level === "error");

  const create = useMutation({
    mutationFn: async (start: boolean) => {
      const exp = await experimentsApi.createExperiment(draftToCreateInput(draft));
      const started = start ? await experimentsApi.startExperiment(exp.id) : exp;
      return { exp: started, start };
    },
    onSuccess: ({ exp, start }) => {
      rememberOperator(draft.created_by);
      queryClient.invalidateQueries({ queryKey: ["experiments"] });
      onCreated(exp, start);
    },
    onError: (e: unknown) => setSubmitError(describeApiError(e)),
  });

  const goToPlan = () => {
    setTriedNext(true);
    if (!nameIssue) setStep(2);
  };
  const patch = (p: Partial<ExperimentDraft>) => setDraft((d) => ({ ...d, ...p }));

  return (
    <div className="mx-auto max-w-6xl">
      <ol className="mb-4 flex items-center gap-3 text-sm">
        <StepChip
          n={1}
          label="Details"
          active={step === 1}
          done={step === 2}
          onClick={() => setStep(1)}
        />
        <span className="text-muted-foreground">·</span>
        <StepChip n={2} label="Phase plan" active={step === 2} onClick={goToPlan} />
      </ol>

      {step === 1 ? (
        <form
          className="max-w-2xl space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            goToPlan();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="exp-name" required>
              Name
            </Label>
            <Input
              id="exp-name"
              mono
              value={draft.name}
              invalid={triedNext && !!nameIssue}
              onChange={(e) => patch({ name: e.target.value })}
              placeholder="checkout-p99-isolation"
              autoFocus
            />
            {triedNext && nameIssue ? (
              <p className="text-xs text-status-down">{nameIssue.message}</p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="exp-description" hint="optional">
              Description
            </Label>
            <Textarea
              id="exp-description"
              rows={2}
              value={draft.description}
              onChange={(e) => patch({ description: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="exp-hypothesis" hint="optional">
              Hypothesis
            </Label>
            <Textarea
              id="exp-hypothesis"
              rows={2}
              value={draft.hypothesis}
              onChange={(e) => patch({ hypothesis: e.target.value })}
              placeholder="productcatalog hang drives >60% of checkout p99"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="exp-created-by" hint="remembered on this browser">
              Created by
            </Label>
            <Input
              id="exp-created-by"
              className="max-w-xs"
              value={draft.created_by}
              onChange={(e) => patch({ created_by: e.target.value })}
            />
          </div>
          <div className="flex items-center gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit">Next: phase plan</Button>
          </div>
        </form>
      ) : (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_20rem]">
          <div>
            <p className="mb-3 text-sm text-muted-foreground">
              Each phase attaches load per workflow. Rules stay disabled until you enable them on
              the Rules page.
            </p>
            {workflows.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading workflows…</p>
            ) : (
              <PhasePlanEditor
                draft={draft}
                onChange={setDraft}
                workflows={workflows.data ?? []}
                rules={rules}
                services={services}
                issues={issues}
              />
            )}
          </div>
          <aside
            aria-label="Preflight"
            className="h-fit rounded-lg border border-border bg-card p-4"
          >
            <h3 className="text-sm font-semibold">Preflight</h3>
            <ul className="mt-2 space-y-2">
              {checks.map((c) => (
                <li key={c.code} className="flex gap-2 text-xs">
                  <PreflightIcon level={c.level} />
                  <span className={cn(c.level === "error" && "text-status-down")}>{c.message}</span>
                </li>
              ))}
              {experiments.isError ? (
                <li className="flex gap-2 text-xs">
                  <PreflightIcon level="warning" />
                  <span>Couldn't load running experiments — overlap not checked.</span>
                </li>
              ) : null}
            </ul>
          </aside>
          <div className="flex items-center gap-2 border-t border-border pt-4 xl:col-span-2">
            <Button type="button" variant="ghost" onClick={() => setStep(1)}>
              Details
            </Button>
            <Button type="button" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
            <div className="ml-auto flex items-center gap-2">
              {submitError ? (
                <p className="max-w-md text-xs text-status-down">{submitError}</p>
              ) : null}
              <Button
                type="button"
                variant="outline"
                disabled={blocked || create.isPending}
                onClick={() => {
                  setSubmitError(null);
                  create.mutate(false);
                }}
              >
                Create
              </Button>
              <Button
                type="button"
                disabled={blocked || create.isPending}
                onClick={() => {
                  setSubmitError(null);
                  create.mutate(true);
                }}
              >
                Create &amp; start
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StepChip({
  n,
  label,
  active,
  done,
  onClick,
}: {
  n: number;
  label: string;
  active: boolean;
  done?: boolean;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        aria-current={active ? "step" : undefined}
        className={cn(
          "inline-flex items-center gap-2 rounded-md px-2 py-1",
          active ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground",
        )}
      >
        <span
          className={cn(
            "flex size-5 items-center justify-center rounded-full font-mono text-[11px]",
            active || done ? "bg-primary text-primary-foreground" : "bg-muted",
          )}
        >
          {n}
        </span>
        {label}
      </button>
    </li>
  );
}

function PreflightIcon({ level }: { level: PreflightItem["level"] }) {
  if (level === "ok")
    return <CheckCircle2 className="size-4 shrink-0 text-status-healthy" aria-label="ok" />;
  if (level === "warning") {
    return <AlertTriangle className="size-4 shrink-0 text-status-degraded" aria-label="warning" />;
  }
  return <XCircle className="size-4 shrink-0 text-status-down" aria-label="blocking" />;
}
