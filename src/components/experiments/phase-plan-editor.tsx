/**
 * Step 2 of the new-experiment wizard — the phase plan (artboard `PhasePlan`).
 * One card per phase: workflows grid (workflow · VUs · rate · duration),
 * rule chips (disabled ones flagged), frozen-service rows (service · mode ·
 * key strategy · mutation policy) and persist_cache. Pure controlled
 * component over an ExperimentDraft; every rule lives in lib/experiment-draft.
 * The per-workflow dataset column needs manteion-go B5 (phase_workflows.dataset_id).
 */
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import {
  CACHEBOX_KEY_STRATEGIES,
  CACHEBOX_MODES,
  type DraftIssue,
  type ExperimentDraft,
  type PhaseDraft,
  type RuleRef,
  autoPlanPhases,
  datasetIdsForPhase,
  newFrozenService,
  newPhase,
  newWorkflowRow,
} from "@/lib/experiment-draft";
import type { WorkflowSummary } from "@/lib/workflow-types";
import type { DatasetListItem } from "@/types/api";
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { useState } from "react";

interface PhasePlanEditorProps {
  draft: ExperimentDraft;
  onChange: (next: ExperimentDraft) => void;
  workflows: readonly WorkflowSummary[];
  rules: readonly RuleRef[];
  /** Every service name known to the environment (frozen-service picker). */
  services: readonly string[];
  /** zeus datasets for the per-workflow picker (decision 3). */
  datasets: readonly DatasetListItem[];
  issues: readonly DraftIssue[];
}

const SECTION = "text-[10px] font-semibold uppercase tracking-wider text-muted-foreground";
const CELL_INPUT = "h-8 text-xs";

export function PhasePlanEditor({
  draft,
  onChange,
  workflows,
  rules,
  services,
  datasets,
  issues,
}: PhasePlanEditorProps) {
  const [autoPlan, setAutoPlan] = useState(false);
  const [autoWorkflowId, setAutoWorkflowId] = useState(workflows[0]?.id ?? "");
  const autoWorkflow = workflows.find((w) => w.id === autoWorkflowId);
  const autoServices = autoWorkflow?.targets.length ? autoWorkflow.targets : services;

  const setPhases = (phases: PhaseDraft[]) => onChange({ ...draft, phases });
  const updatePhase = (key: string, patch: Partial<PhaseDraft>) =>
    setPhases(draft.phases.map((p) => (p.key === key ? { ...p, ...patch } : p)));
  const movePhase = (index: number, dir: -1 | 1) => {
    const next = [...draft.phases];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    const [row] = next.splice(index, 1);
    if (row) next.splice(target, 0, row);
    setPhases(next);
  };

  const toggleAutoPlan = (on: boolean) => {
    setAutoPlan(on);
    if (on && autoWorkflowId) {
      setPhases(autoPlanPhases({ services: autoServices, workflowId: autoWorkflowId, rules }));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-muted/20 px-3 py-2">
        <Switch
          id="auto-plan"
          checked={autoPlan}
          onCheckedChange={toggleAutoPlan}
          aria-label="Auto-plan phases"
        />
        <label htmlFor="auto-plan" className="text-sm font-medium">
          Auto-plan phases
        </label>
        <NativeSelect
          aria-label="Auto-plan workflow"
          className="h-8 w-56 text-xs"
          value={autoWorkflowId}
          onChange={(e) => setAutoWorkflowId(e.target.value)}
          options={workflows.map((w) => ({ value: w.id, label: w.name }))}
          placeholder="workflow"
        />
        <span className="text-xs text-muted-foreground">
          {autoPlan
            ? `baseline + one isolation per targeted service (${autoServices.join(", ") || "none"}) + combined`
            : "off · would generate baseline + one isolation per targeted service + combined"}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="ml-auto"
          onClick={() =>
            setPhases([
              ...draft.phases,
              newPhase(`phase-${draft.phases.length + 1}`, workflows[0]?.id ?? ""),
            ])
          }
        >
          <Plus className="size-4" aria-hidden />
          Add phase
        </Button>
      </div>

      {issues
        .filter((i) => !i.phaseKey)
        .map((i) => (
          <p key={i.code} className="text-xs text-status-down">
            {i.message}
          </p>
        ))}

      {draft.phases.length === 0 ? (
        <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No phases yet — turn on auto-plan or add a phase.
        </p>
      ) : null}

      {draft.phases.map((phase, index) => (
        <PhaseCard
          key={phase.key}
          index={index}
          total={draft.phases.length}
          phase={phase}
          workflows={workflows}
          rules={rules}
          services={services}
          datasets={datasets}
          issues={issues.filter((i) => i.phaseKey === phase.key)}
          onChange={(patch) => updatePhase(phase.key, patch)}
          onMove={(dir) => movePhase(index, dir)}
          onRemove={() => setPhases(draft.phases.filter((p) => p.key !== phase.key))}
        />
      ))}
    </div>
  );
}

function PhaseCard({
  index,
  total,
  phase,
  workflows,
  rules,
  services,
  datasets,
  issues,
  onChange,
  onMove,
  onRemove,
}: {
  index: number;
  total: number;
  phase: PhaseDraft;
  workflows: readonly WorkflowSummary[];
  rules: readonly RuleRef[];
  services: readonly string[];
  datasets: readonly DatasetListItem[];
  issues: readonly DraftIssue[];
  onChange: (patch: Partial<PhaseDraft>) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}) {
  const rulesById = new Map(rules.map((r) => [r.id, r]));
  const addableRules = rules.filter((r) => !phase.rule_ids.includes(r.id));
  const label = phase.name || `phase ${index + 1}`;
  const datasetNames = new Map(datasets.map((d) => [d.id, d.name]));
  const needed = datasetIdsForPhase(phase);

  return (
    <section
      aria-label={`Phase ${index + 1}: ${label}`}
      className="rounded-lg border border-border bg-card p-4"
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex size-6 items-center justify-center rounded-full bg-muted font-mono text-xs">
          {index + 1}
        </span>
        <Input
          mono
          aria-label={`Phase ${index + 1} name`}
          className="h-8 w-64 text-sm"
          value={phase.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="phase name"
        />
        <Checkbox
          id={`${phase.key}-persist`}
          checked={phase.persist_cache}
          onCheckedChange={(checked) => onChange({ persist_cache: checked })}
          label={<span className="font-mono text-xs">persist_cache</span>}
        />
        <div className="ml-auto flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Move phase up"
            disabled={index === 0}
            onClick={() => onMove(-1)}
          >
            <ArrowUp className="size-4" aria-hidden />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Move phase down"
            disabled={index === total - 1}
            onClick={() => onMove(1)}
          >
            <ArrowDown className="size-4" aria-hidden />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Remove phase ${label}`}
            onClick={onRemove}
          >
            <X className="size-4" aria-hidden />
          </Button>
        </div>
      </div>

      {issues.map((i) => (
        <p key={`${i.code}-${i.message}`} className="mt-2 text-xs text-status-down">
          {i.message}
        </p>
      ))}

      <div
        className="mt-2 flex flex-wrap items-center gap-1.5 text-xs"
        aria-label={`Datasets needed by ${label}`}
      >
        <span className={SECTION}>Datasets needed</span>
        {needed.length === 0 ? (
          <span className="text-muted-foreground">zeus default</span>
        ) : (
          needed.map((id) => (
            <span
              key={id}
              className="rounded-md border border-border px-1.5 py-0.5 font-mono"
              title={id}
            >
              {datasetNames.get(id) ?? id}
            </span>
          ))
        )}
      </div>

      <div className="mt-4">
        <div className="grid grid-cols-[1fr_5rem_6rem_6rem_10rem_2rem] items-center gap-2 text-xs">
          <span className={SECTION}>Workflow</span>
          <span className={SECTION}>VUs</span>
          <span className={SECTION}>rate rps</span>
          <span className={SECTION}>duration s</span>
          <span className={SECTION}>Dataset</span>
          <span />
          {phase.workflows.map((row) => (
            <WorkflowRow
              key={row.key}
              row={row}
              workflows={workflows}
              datasets={datasets}
              onChange={(patch) =>
                onChange({
                  workflows: phase.workflows.map((w) =>
                    w.key === row.key ? { ...w, ...patch } : w,
                  ),
                })
              }
              onRemove={() =>
                onChange({ workflows: phase.workflows.filter((w) => w.key !== row.key) })
              }
            />
          ))}
        </div>
        <Button
          type="button"
          variant="link"
          size="sm"
          className="mt-1 h-7 px-0 text-xs"
          onClick={() =>
            onChange({ workflows: [...phase.workflows, newWorkflowRow(workflows[0]?.id ?? "")] })
          }
        >
          + add workflow
        </Button>
      </div>

      <div className="mt-3">
        <div className={SECTION}>Rules</div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {phase.rule_ids.length === 0 ? (
            <span className="text-xs text-muted-foreground">
              none{index === 0 ? " (baseline)" : ""}
            </span>
          ) : null}
          {phase.rule_ids.map((id) => {
            const rule = rulesById.get(id);
            return (
              <span
                key={id}
                className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-xs"
              >
                <span className="font-mono">{rule?.name ?? id}</span>
                {rule ? <span className="text-muted-foreground">· {rule.service}</span> : null}
                {rule && !rule.enabled ? (
                  <Badge variant="status-degraded" className="px-1.5 py-0 text-[10px]">
                    disabled
                  </Badge>
                ) : null}
                <button
                  type="button"
                  aria-label={`Remove rule ${rule?.name ?? id}`}
                  className="ml-0.5 rounded-sm text-muted-foreground hover:text-foreground"
                  onClick={() => onChange({ rule_ids: phase.rule_ids.filter((r) => r !== id) })}
                >
                  <X className="size-3" aria-hidden />
                </button>
              </span>
            );
          })}
          <NativeSelect
            aria-label={`Add rule to ${label}`}
            className="h-7 w-52 text-xs"
            value=""
            placeholder="+ add rule"
            disabled={addableRules.length === 0}
            onChange={(e) => {
              if (e.target.value) onChange({ rule_ids: [...phase.rule_ids, e.target.value] });
            }}
            options={addableRules.map((r) => ({
              value: r.id,
              label: `${r.name} · ${r.service}${r.enabled ? "" : " (disabled)"}`,
            }))}
          />
        </div>
      </div>

      <div className="mt-3">
        <div className={SECTION}>Frozen services</div>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          Freezing replays the calls a service <em>makes</em> (its egress) from the recording phase
          — freeze callers such as frontend or checkoutservice; a leaf service records nothing to
          replay.
        </p>
        {phase.frozen_services.length === 0 ? (
          <div className="mt-1 text-xs text-muted-foreground">none</div>
        ) : (
          <div className="mt-1 grid grid-cols-[1fr_9rem_10rem_6rem_2rem] items-center gap-2">
            {phase.frozen_services.map((f) => (
              <FrozenServiceRow
                key={f.key}
                row={f}
                services={services}
                onChange={(patch) =>
                  onChange({
                    frozen_services: phase.frozen_services.map((x) =>
                      x.key === f.key ? { ...x, ...patch } : x,
                    ),
                  })
                }
                onRemove={() =>
                  onChange({
                    frozen_services: phase.frozen_services.filter((x) => x.key !== f.key),
                  })
                }
              />
            ))}
          </div>
        )}
        <Button
          type="button"
          variant="link"
          size="sm"
          className="mt-1 h-7 px-0 text-xs"
          onClick={() =>
            onChange({
              frozen_services: [
                ...phase.frozen_services,
                newFrozenService(
                  services.find((s) => !phase.frozen_services.some((f) => f.service === s)) ?? "",
                ),
              ],
            })
          }
        >
          + add frozen service
        </Button>
      </div>
    </section>
  );
}

function WorkflowRow({
  row,
  workflows,
  datasets,
  onChange,
  onRemove,
}: {
  row: PhaseDraft["workflows"][number];
  workflows: readonly WorkflowSummary[];
  datasets: readonly DatasetListItem[];
  onChange: (patch: Partial<PhaseDraft["workflows"][number]>) => void;
  onRemove: () => void;
}) {
  const num = (v: string) => (v === "" ? 0 : Number(v));
  const datasetOptions = [
    { value: "", label: "zeus default" },
    ...datasets.map((d) => ({ value: d.id, label: d.name })),
    ...(row.dataset_id && !datasets.some((d) => d.id === row.dataset_id)
      ? [{ value: row.dataset_id, label: `${row.dataset_id} (not in zeus)` }]
      : []),
  ];
  return (
    <>
      <NativeSelect
        aria-label="Workflow"
        className={CELL_INPUT}
        value={row.workflow_id}
        placeholder="workflow"
        onChange={(e) => onChange({ workflow_id: e.target.value })}
        options={workflows.map((w) => ({ value: w.id, label: w.name }))}
      />
      <Input
        mono
        type="number"
        min={1}
        aria-label="VUs"
        className={CELL_INPUT}
        value={row.vus}
        onChange={(e) => onChange({ vus: num(e.target.value) })}
      />
      <Input
        mono
        type="number"
        min={0}
        aria-label="rate rps"
        className={CELL_INPUT}
        placeholder="—"
        value={row.rate_rps ?? ""}
        onChange={(e) =>
          onChange({ rate_rps: e.target.value === "" ? undefined : num(e.target.value) })
        }
      />
      <Input
        mono
        type="number"
        min={1}
        aria-label="duration s"
        className={CELL_INPUT}
        value={row.duration_sec}
        onChange={(e) => onChange({ duration_sec: num(e.target.value) })}
      />
      <NativeSelect
        aria-label="Dataset"
        className={CELL_INPUT}
        value={row.dataset_id ?? ""}
        onChange={(e) => onChange({ dataset_id: e.target.value || undefined })}
        options={datasetOptions}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-8"
        aria-label="Remove workflow"
        onClick={onRemove}
      >
        <X className="size-3.5" aria-hidden />
      </Button>
    </>
  );
}

function FrozenServiceRow({
  row,
  services,
  onChange,
  onRemove,
}: {
  row: PhaseDraft["frozen_services"][number];
  services: readonly string[];
  onChange: (patch: Partial<PhaseDraft["frozen_services"][number]>) => void;
  onRemove: () => void;
}) {
  const options =
    row.service && !services.includes(row.service) ? [row.service, ...services] : [...services];
  return (
    <>
      <NativeSelect
        aria-label="Service"
        className={CELL_INPUT}
        value={row.service}
        placeholder="service"
        onChange={(e) => onChange({ service: e.target.value })}
        options={options}
      />
      <NativeSelect
        aria-label="Mode"
        className={CELL_INPUT}
        value={row.mode}
        onChange={(e) =>
          onChange({ mode: e.target.value as PhaseDraft["frozen_services"][number]["mode"] })
        }
        options={[...CACHEBOX_MODES]}
      />
      <NativeSelect
        aria-label="Key strategy"
        className={CELL_INPUT}
        value={row.key_strategy}
        onChange={(e) => onChange({ key_strategy: e.target.value })}
        options={[...CACHEBOX_KEY_STRATEGIES]}
      />
      <NativeSelect
        aria-label="Mutation policy"
        className={CELL_INPUT}
        value={row.mutation_policy}
        onChange={(e) => onChange({ mutation_policy: e.target.value as "deny" | "allow" })}
        options={["deny", "allow"]}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-8"
        aria-label="Remove frozen service"
        onClick={onRemove}
      >
        <X className="size-3.5" aria-hidden />
      </Button>
    </>
  );
}
