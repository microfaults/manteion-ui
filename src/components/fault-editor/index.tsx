import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { faultsApi, rulesApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { FaultCategory, FaultSpec, Rule } from "@/types/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ConfigFields, Field } from "./config-fields";
import {
  type ConfigState,
  DEFAULT_FAULT_TYPE,
  INLINE_TYPES,
  NETWORK_TYPES,
  RESOURCE_TYPES,
  buildConfig,
  configFromSpec,
  defaultConfig,
} from "./config-state";

// ─── Props ─────────────────────────────────────────────────────────────

interface FaultEditorProps {
  faultId: string | null;
  onSaved: (spec: FaultSpec) => void;
  onDeleted: () => void;
}

// ─── Component ─────────────────────────────────────────────────────────

export function FaultEditor({ faultId, onSaved, onDeleted }: FaultEditorProps) {
  const isNew = faultId === "new";
  const qc = useQueryClient();

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
  const [cfg, setCfg] = useState<ConfigState>(defaultConfig());
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
    setCfg(configFromSpec(s));
    setDescription(s.description ?? "");
    setRampUpS(s.ramp_up_ms ? s.ramp_up_ms / 1000 : 0);
    setRampDownS(s.ramp_down_ms ? s.ramp_down_ms / 1000 : 0);
  }, [isNew, specQuery.data]);

  function handleCategoryChange(cat: FaultCategory) {
    setCategory(cat);
    setFaultType(DEFAULT_FAULT_TYPE[cat]);
    setCfg(defaultConfig());
  }

  // ── Mutations ───────────────────────────────────────────────────────
  const save = useMutation({
    mutationFn: () => {
      const input = {
        name,
        category,
        fault_type: faultType,
        params: buildConfig(category, faultType, cfg),
        description: description || undefined,
        duration_ms: faultType === "hang" ? Math.round(cfg.hang_duration_s * 1000) : undefined,
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
        setCfg(defaultConfig());
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

  const subtypeOptions =
    category === "inline" ? INLINE_TYPES : category === "network" ? NETWORK_TYPES : RESOURCE_TYPES;

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
              {(["inline", "network", "resource"] as FaultCategory[]).map((cat) => (
                <TabsTrigger key={cat} value={cat} className="w-full min-w-0 px-1.5">
                  <span className="truncate">{cat.charAt(0).toUpperCase() + cat.slice(1)}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        {/* Sub-type radio */}
        <div className="space-y-2">
          <Label className="text-xs font-medium">{categoryLabel} fault</Label>
          <RadioGroup
            value={faultType}
            onValueChange={(v) => {
              setFaultType(v);
              setCfg(defaultConfig());
            }}
            className="gap-0 divide-y divide-border rounded-md border border-border"
          >
            {subtypeOptions.map((opt) => (
              <label
                key={opt.value}
                htmlFor={`fe-type-${opt.value}`}
                className={cn(
                  "flex cursor-pointer items-start gap-3 px-3 py-2.5 transition-colors",
                  faultType === opt.value ? "bg-muted/60" : "hover:bg-muted/30",
                )}
              >
                <RadioGroupItem
                  id={`fe-type-${opt.value}`}
                  value={opt.value}
                  className="mt-0.5 shrink-0"
                />
                <div>
                  <p className="text-sm font-medium leading-tight">{opt.label}</p>
                  <p className="text-xs text-muted-foreground">{opt.description}</p>
                </div>
              </label>
            ))}
          </RadioGroup>
        </div>

        {/* Config fields */}
        <ConfigFields
          category={category}
          faultType={faultType}
          cfg={cfg}
          onChange={(patch) => setCfg((prev) => ({ ...prev, ...patch }))}
        />

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
          disabled={save.isPending || name.trim() === ""}
          variant={save.isError ? "destructive" : "default"}
        >
          {save.isPending ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
