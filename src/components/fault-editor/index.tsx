import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { faultsApi, rulesApi } from "@/lib/api";
import type { FaultSpecInput } from "@/lib/api/faults";
import { cn } from "@/lib/utils";
import type { FaultCategory, FaultSpec, Rule } from "@/types/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { CatalogParamFields, Field, NetworkEnvelopeFields } from "./config-fields";
import {
  type NetworkEnvelopeState,
  type ParamValues,
  buildNetworkEnvelope,
  buildParams,
  defaultNetworkEnvelope,
  entriesForCategory,
  findEntry,
  missingRequiredParams,
  networkFromSpec,
  paramValuesFromSpec,
} from "./config-state";

// ─── Props ─────────────────────────────────────────────────────────────

interface FaultEditorProps {
  faultId: string | null;
  onSaved: (spec: FaultSpec) => void;
  onDeleted: () => void;
}

const CATEGORIES: FaultCategory[] = ["inline", "network", "resource"];

// ─── Component ─────────────────────────────────────────────────────────

export function FaultEditor({ faultId, onSaved, onDeleted }: FaultEditorProps) {
  const isNew = faultId === "new";
  const qc = useQueryClient();

  // Form vocabulary + per-type param specs come from the fault catalog —
  // static per backend build, so cache aggressively.
  const catalogQuery = useQuery({
    queryKey: ["fault-catalog"],
    queryFn: faultsApi.getFaultCatalog,
    staleTime: Number.POSITIVE_INFINITY,
  });

  const specQuery = useQuery({
    queryKey: ["fault-spec", faultId],
    queryFn: () => faultsApi.getFaultSpec(faultId ?? ""),
    enabled: !isNew && faultId !== null,
  });

  const rulesQuery = useQuery({
    queryKey: ["rules"],
    queryFn: rulesApi.listRules,
  });

  // ── Form state ──────────────────────────────────────────────────────
  const [name, setName] = useState("");
  const [category, setCategory] = useState<FaultCategory>("inline");
  const [faultType, setFaultType] = useState("latency");
  // Sparse overrides on top of the catalog defaults; see config-state.ts.
  const [params, setParams] = useState<ParamValues>({});
  const [network, setNetwork] = useState<NetworkEnvelopeState>(defaultNetworkEnvelope());
  const [description, setDescription] = useState("");
  const [rampUpS, setRampUpS] = useState(5);
  const [rampDownS, setRampDownS] = useState(5);

  useEffect(() => {
    if (isNew) return;
    const s = specQuery.data;
    if (!s) return;
    setName(s.name);
    setCategory(s.category);
    setFaultType(s.fault_type);
    setParams(paramValuesFromSpec(s));
    setNetwork(networkFromSpec(s));
    setDescription(s.description ?? "");
    setRampUpS(s.ramp_up_ms ? s.ramp_up_ms / 1000 : 0);
    setRampDownS(s.ramp_down_ms ? s.ramp_down_ms / 1000 : 0);
  }, [isNew, specQuery.data]);

  const catalog = catalogQuery.data;
  const subtypeOptions = entriesForCategory(catalog, category);
  const entry = findEntry(catalog, category, faultType);

  function handleCategoryChange(cat: FaultCategory) {
    setCategory(cat);
    const first = entriesForCategory(catalog, cat)[0];
    setFaultType(first ? first.fault_type : "");
    setParams({});
    setNetwork(defaultNetworkEnvelope());
  }

  function handleTypeChange(type: string) {
    setFaultType(type);
    setParams({});
  }

  // ── Mutations ───────────────────────────────────────────────────────
  const save = useMutation({
    mutationFn: () => {
      const input: FaultSpecInput = {
        name,
        category,
        fault_type: faultType,
        params: entry ? buildParams(entry, params) : {},
        network: category === "network" ? buildNetworkEnvelope(network) : undefined,
        description: description || undefined,
        ramp_up_ms: rampUpS > 0 ? Math.round(rampUpS * 1000) : undefined,
        ramp_down_ms: rampDownS > 0 ? Math.round(rampDownS * 1000) : undefined,
      };
      return isNew || faultId === null
        ? faultsApi.createFaultSpec(input)
        : faultsApi.updateFaultSpec(faultId, input);
    },
    onSuccess: (spec) => {
      qc.invalidateQueries({ queryKey: ["fault-specs"] });
      qc.invalidateQueries({ queryKey: ["fault-spec", spec.id] });
      onSaved(spec);
      if (isNew) {
        setName("");
        setCategory("inline");
        setFaultType("latency");
        setParams({});
        setNetwork(defaultNetworkEnvelope());
        setDescription("");
        setRampUpS(5);
        setRampDownS(5);
      }
    },
  });

  const del = useMutation({
    mutationFn: () => faultsApi.deleteFaultSpec(faultId ?? ""),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fault-specs"] });
      onDeleted();
    },
  });

  // ── Derived ─────────────────────────────────────────────────────────
  const usedByRules: Rule[] = (rulesQuery.data ?? []).filter(
    (r) =>
      !isNew && faultId && r.action.type === "fault_spec" && r.action.fault_spec_id === faultId,
  );

  const categoryLabel =
    category === "inline" ? "Inline" : category === "network" ? "Network" : "Resource";

  const missingRequired = entry ? missingRequiredParams(entry, params) : [];
  const missingTarget = category === "network" && network.target.trim() === "";
  const saveDisabled =
    save.isPending || name.trim() === "" || !entry || missingRequired.length > 0 || missingTarget;

  // ── Render ───────────────────────────────────────────────────────────

  if (!isNew && faultId && specQuery.isError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="text-sm font-semibold">Fault not found</p>
        <p className="text-xs text-muted-foreground">
          No spec exists for id <code className="font-mono">{faultId}</code>.
        </p>
        <Button variant="outline" size="sm" onClick={onDeleted}>
          Clear selection
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* Header */}
      <div className="flex items-start justify-between px-5 pt-5 pb-1">
        <div>
          <h2 className="text-base font-semibold leading-tight">
            {isNew ? "New fault" : specQuery.data?.name || faultId}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {isNew
              ? "Inline fault · unreferenced"
              : `${categoryLabel} fault · referenced by ${usedByRules.length} rule${usedByRules.length === 1 ? "" : "s"}`}
          </p>
        </div>
        {!isNew && (
          <Badge variant="outline" className="mt-0.5 shrink-0 text-xs font-normal">
            {category}
          </Badge>
        )}
      </div>

      <Separator className="mt-3" />

      <div className="flex flex-1 flex-col gap-5 px-5 py-5">
        {/* Name */}
        <Field label="Name" htmlFor="fe-name">
          <Input
            id="fe-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="latency-250-jitter"
            className="font-mono"
          />
        </Field>

        {/* Type selector */}
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Type</Label>
          <Tabs value={category} onValueChange={(v) => handleCategoryChange(v as FaultCategory)}>
            <TabsList className="grid w-full grid-cols-3">
              {CATEGORIES.map((cat) => (
                <TabsTrigger key={cat} value={cat} className="w-full min-w-0 px-1.5">
                  <span className="truncate">{cat.charAt(0).toUpperCase() + cat.slice(1)}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        {/* Sub-type radio — rendered from the fault catalog */}
        <div className="space-y-2">
          <Label className="text-xs font-medium">{categoryLabel} fault</Label>
          {catalogQuery.isLoading ? (
            <p className="text-xs text-muted-foreground">Loading fault catalog…</p>
          ) : catalogQuery.isError ? (
            <p className="text-xs text-destructive">
              Could not load the fault catalog (
              <code className="font-mono">GET /api/v1/faults/catalog</code>).
            </p>
          ) : (
            <RadioGroup
              value={faultType}
              onValueChange={handleTypeChange}
              className="gap-0 divide-y divide-border rounded-md border border-border"
            >
              {subtypeOptions.map((opt) => (
                <label
                  key={opt.fault_type}
                  htmlFor={`fe-type-${opt.fault_type}`}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 px-3 py-2.5 transition-colors",
                    faultType === opt.fault_type ? "bg-muted/60" : "hover:bg-muted/30",
                  )}
                >
                  <RadioGroupItem
                    id={`fe-type-${opt.fault_type}`}
                    value={opt.fault_type}
                    className="mt-0.5 shrink-0"
                  />
                  <div>
                    <p className="text-sm font-medium leading-tight">{opt.fault_type}</p>
                    <p className="text-xs text-muted-foreground">{opt.description}</p>
                  </div>
                </label>
              ))}
            </RadioGroup>
          )}
        </div>

        {/* Network envelope (network category only) */}
        {entry?.network_required ? (
          <>
            <NetworkEnvelopeFields
              value={network}
              onChange={(patch) => setNetwork((prev) => ({ ...prev, ...patch }))}
            />
            <Separator />
          </>
        ) : null}

        {/* Params — rendered from the catalog field specs */}
        {entry ? (
          <CatalogParamFields
            entry={entry}
            values={params}
            onChange={(paramName, value) => setParams((prev) => ({ ...prev, [paramName]: value }))}
          />
        ) : null}

        {/* Timing */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Ramp up (s)" htmlFor="fe-ramp-up">
            <Input
              id="fe-ramp-up"
              type="number"
              min={0}
              value={rampUpS}
              onChange={(e) => setRampUpS(Number(e.target.value))}
            />
          </Field>
          <Field label="Ramp down (s)" htmlFor="fe-ramp-down">
            <Input
              id="fe-ramp-down"
              type="number"
              min={0}
              value={rampDownS}
              onChange={(e) => setRampDownS(Number(e.target.value))}
            />
          </Field>
        </div>

        {/* Description */}
        <div className="space-y-1.5">
          <Label htmlFor="fe-desc" className="text-xs font-medium">
            Description
          </Label>
          <textarea
            id="fe-desc"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Human-readable notes about this fault primitive…"
            className="w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm outline-none placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>

        {/* Used by rules */}
        {!isNew && (
          <div className="space-y-2">
            <Label className="text-xs font-medium">Used by rules</Label>
            {usedByRules.length === 0 ? (
              <p className="text-xs text-muted-foreground">No rules reference this fault.</p>
            ) : (
              <div className="overflow-hidden rounded-md border border-border">
                {usedByRules.map((rule) => (
                  <div
                    key={rule.id}
                    className="flex items-center justify-between bg-muted/40 px-3 py-1.5 text-sm [&+&]:border-t [&+&]:border-border"
                  >
                    <span className="font-mono text-xs">{rule.name}</span>
                    <span className="text-xs text-muted-foreground">{rule.service}</span>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Editing this primitive updates every rule referencing it on next SDK poll.
            </p>
          </div>
        )}
      </div>

      {/* Actions */}
      {save.isError && (
        <p className="px-5 pb-1 text-xs text-destructive">
          {save.error instanceof Error
            ? save.error.message
            : "Save failed. Check the fields above."}
        </p>
      )}
      {!save.isError && (missingRequired.length > 0 || missingTarget) ? (
        <p className="px-5 pb-1 text-xs text-muted-foreground">
          Required: {[...(missingTarget ? ["network target"] : []), ...missingRequired].join(", ")}
        </p>
      ) : null}
      <div className="flex items-center justify-between border-t border-border px-5 py-4">
        <Button
          variant="ghost"
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          disabled={isNew || del.isPending}
          onClick={() => del.mutate()}
        >
          Delete
        </Button>
        <Button
          onClick={() => save.mutate()}
          disabled={saveDisabled}
          variant={save.isError ? "destructive" : "default"}
        >
          {save.isPending ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
