import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { faultsApi, rulesApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { FaultCategory, FaultSpec, Rule } from "@/types/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

// ─── Sub-type definitions ──────────────────────────────────────────────

const INLINE_TYPES = [
  {
    value: "latency",
    label: "latency",
    description: "Add sleep before response. Supports jitter.",
  },
  {
    value: "error",
    label: "http-error",
    description: "Return a status code without calling downstream.",
  },
  { value: "hang", label: "hang", description: "Never return. Requires caller timeout." },
] as const;

// Network and Resource categories don't have a Figma design yet (only Inline
// does, at node 2058:35). To prevent users from creating specs whose shape
// the design team hasn't blessed, the Network/Resource tabs are disabled in
// the UI with a "Pending design" tooltip — see PENDING_CATEGORIES below.
// These lists remain for forward-compatibility when editing existing specs
// that already have those categories saved in the backend.
const NETWORK_TYPES = [
  { value: "blackhole", label: "blackhole", description: "Drop all traffic in one direction." },
  { value: "loss", label: "packet-loss", description: "Drop a percentage of packets." },
  { value: "rst", label: "rst", description: "Send TCP reset on each connection." },
  { value: "throttle", label: "throttle", description: "Limit bandwidth to a fixed rate." },
  { value: "latency", label: "latency", description: "Add network-layer latency with jitter." },
  { value: "drip", label: "drip", description: "Slow-drip data at a fixed byte rate." },
] as const;

const RESOURCE_TYPES = [
  { value: "cpu", label: "cpu", description: "Stress CPU cores at a given percentage." },
  { value: "memory", label: "memory", description: "Allocate a fixed amount of memory." },
  { value: "io", label: "io", description: "Throttle disk I/O throughput." },
] as const;

/** Categories that the design team hasn't shipped a Figma frame for. The
 *  corresponding TabsTrigger is rendered disabled with a tooltip. Drop a
 *  category from this set once `docs/design/figma-changes.md` lists a frame for it. */
const PENDING_CATEGORIES: ReadonlySet<FaultCategory> = new Set(["network", "resource"]);

const DEFAULT_FAULT_TYPE: Record<FaultCategory, string> = {
  inline: "latency",
  network: "blackhole",
  resource: "cpu",
};

// ─── Config state helpers ──────────────────────────────────────────────

interface ConfigState {
  latency_ms: number;
  jitter_ms: number;
  status_code: number;
  hang_duration_s: number;
  direction: "inbound" | "outbound" | "both";
  loss_percent: number;
  interval_s: number;
  rate_kbps: number;
  rate_bytes_s: number;
  cpu_percent: number;
  cpu_cores: number;
  size_mb: number;
  io_rate_mbps: number;
}

const defaultConfig = (): ConfigState => ({
  latency_ms: 250,
  jitter_ms: 50,
  status_code: 500,
  hang_duration_s: 30,
  direction: "inbound",
  loss_percent: 2,
  interval_s: 5,
  rate_kbps: 100,
  rate_bytes_s: 1024,
  cpu_percent: 80,
  cpu_cores: 2,
  size_mb: 256,
  io_rate_mbps: 5,
});

function configFromSpec(spec: FaultSpec): ConfigState {
  const state = defaultConfig();
  const c = spec.config as Record<string, unknown> | null | undefined;
  if (!c) return state;
  const num = (k: string, fallback: number) => (c[k] != null ? Number(c[k]) : fallback);
  const str = <T extends string>(k: string, fallback: T): T =>
    (c[k] != null ? String(c[k]) : fallback) as T;

  switch (spec.fault_type) {
    case "latency":
      return { ...state, latency_ms: num("latency_ms", 250), jitter_ms: num("jitter_ms", 50) };
    case "error":
      return { ...state, status_code: num("status_code", 500) };
    case "hang":
      return { ...state, hang_duration_s: spec.duration_ms ? spec.duration_ms / 1000 : 30 };
    case "blackhole":
      return { ...state, direction: str("direction", "inbound") };
    case "loss":
      return { ...state, loss_percent: num("percent", 2) };
    case "rst":
      return { ...state, interval_s: num("interval_s", 5) };
    case "throttle":
      return { ...state, rate_kbps: num("rate_kbps", 100) };
    case "drip":
      return { ...state, rate_bytes_s: num("rate_bytes_s", 1024) };
    case "cpu":
      return { ...state, cpu_percent: num("percent", 80), cpu_cores: num("cores", 2) };
    case "memory":
      return { ...state, size_mb: num("size_mb", 256) };
    case "io":
      return { ...state, io_rate_mbps: num("rate_mbps", 5) };
    default:
      return state;
  }
}

function buildConfig(faultType: string, s: ConfigState): unknown {
  switch (faultType) {
    case "latency":
      return { latency_ms: s.latency_ms, jitter_ms: s.jitter_ms };
    case "error":
      return { status_code: s.status_code };
    case "hang":
      return {};
    case "blackhole":
      return { direction: s.direction };
    case "loss":
      return { percent: s.loss_percent };
    case "rst":
      return { interval_s: s.interval_s };
    case "throttle":
      return { rate_kbps: s.rate_kbps };
    case "drip":
      return { rate_bytes_s: s.rate_bytes_s };
    case "cpu":
      return { percent: s.cpu_percent, cores: s.cpu_cores };
    case "memory":
      return { size_mb: s.size_mb };
    case "io":
      return { rate_mbps: s.io_rate_mbps };
    default:
      return {};
  }
}

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
    // The "new" reset branch is handled by the `key={selectedId}` remount in
    // routes/faults/index.tsx — the initial useState values above already
    // produce the new-spec form. This effect only populates the form when an
    // existing spec finishes loading.
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
        config: buildConfig(faultType, cfg),
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
      // After a successful create, reset the form so the user can immediately
      // create another fault without having to click "+ New fault" again.
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
    (r) => !isNew && faultId && r.fault_spec_id === faultId,
  );

  const categoryLabel =
    category === "inline" ? "Inline" : category === "network" ? "Network" : "Resource";

  const subtypeOptions =
    category === "inline" ? INLINE_TYPES : category === "network" ? NETWORK_TYPES : RESOURCE_TYPES;

  // ── Render ───────────────────────────────────────────────────────────

  // Invalid deep-link (e.g. /faults/nonexistent-id): show a found-not state
  // instead of leaving the editor open on a blank form with broken Save/Delete.
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
            {isNew ? "New fault" : name || faultId}
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

        {/* Type selector — Network / Resource disabled until Figma frames exist. */}
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Type</Label>
          <Tabs
            value={category}
            onValueChange={(v) => {
              const cat = v as FaultCategory;
              if (PENDING_CATEGORIES.has(cat)) return;
              handleCategoryChange(cat);
            }}
          >
            <TabsList className="grid w-full grid-cols-3">
              {(["inline", "network", "resource"] as FaultCategory[]).map((cat) => {
                const label = cat.charAt(0).toUpperCase() + cat.slice(1);
                const isPending = PENDING_CATEGORIES.has(cat);
                const trigger = (
                  <TabsTrigger value={cat} disabled={isPending} className="w-full">
                    {label}
                  </TabsTrigger>
                );
                if (!isPending) return <div key={cat}>{trigger}</div>;
                return (
                  <Tooltip key={cat}>
                    <TooltipTrigger asChild>
                      {/* Wrapper span captures hover/focus for the disabled
                          trigger (pointer-events-none on the button itself).
                          tabIndex makes the tooltip reachable by keyboard;
                          without it the disabled tab is silently skipped. */}
                      {/* biome-ignore lint/a11y/noNoninteractiveTabindex: tooltip-on-disabled-element pattern */}
                      <span tabIndex={0} className="inline-flex">
                        {trigger}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>Pending design</TooltipContent>
                  </Tooltip>
                );
              })}
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

// ─── Config fields sub-component ────────────────────────────────────────

interface ConfigFieldsProps {
  category: FaultCategory;
  faultType: string;
  cfg: ConfigState;
  onChange: (patch: Partial<ConfigState>) => void;
}

function ConfigFields({ category, faultType, cfg, onChange }: ConfigFieldsProps) {
  if (category === "inline") {
    if (faultType === "latency") {
      return (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Latency (ms)" htmlFor="fe-lat-ms">
            <Input
              id="fe-lat-ms"
              type="number"
              min={0}
              value={cfg.latency_ms}
              onChange={(e) => onChange({ latency_ms: Number(e.target.value) })}
            />
          </Field>
          <Field label="Jitter ± (ms)" htmlFor="fe-jitter-ms">
            <Input
              id="fe-jitter-ms"
              type="number"
              min={0}
              value={cfg.jitter_ms}
              onChange={(e) => onChange({ jitter_ms: Number(e.target.value) })}
            />
          </Field>
        </div>
      );
    }
    if (faultType === "error") {
      return (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Status code" htmlFor="fe-status">
            <Input
              id="fe-status"
              type="number"
              min={100}
              max={599}
              value={cfg.status_code}
              onChange={(e) => onChange({ status_code: Number(e.target.value) })}
            />
          </Field>
        </div>
      );
    }
    if (faultType === "hang") {
      return (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Duration (s)" htmlFor="fe-hang-dur">
            <Input
              id="fe-hang-dur"
              type="number"
              min={1}
              value={cfg.hang_duration_s}
              onChange={(e) => onChange({ hang_duration_s: Number(e.target.value) })}
            />
          </Field>
        </div>
      );
    }
  }

  if (category === "network") {
    if (faultType === "blackhole") {
      return (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Direction" htmlFor="fe-dir">
            <Select
              value={cfg.direction}
              onValueChange={(v) => onChange({ direction: v as "inbound" | "outbound" | "both" })}
            >
              <SelectTrigger id="fe-dir">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="inbound">inbound</SelectItem>
                <SelectItem value="outbound">outbound</SelectItem>
                <SelectItem value="both">both</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
      );
    }
    if (faultType === "loss") {
      return (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Loss (%)" htmlFor="fe-loss">
            <Input
              id="fe-loss"
              type="number"
              min={0}
              max={100}
              value={cfg.loss_percent}
              onChange={(e) => onChange({ loss_percent: Number(e.target.value) })}
            />
          </Field>
        </div>
      );
    }
    if (faultType === "rst") {
      return (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Interval (s)" htmlFor="fe-rst-int">
            <Input
              id="fe-rst-int"
              type="number"
              min={1}
              value={cfg.interval_s}
              onChange={(e) => onChange({ interval_s: Number(e.target.value) })}
            />
          </Field>
        </div>
      );
    }
    if (faultType === "throttle") {
      return (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Rate (kbps)" htmlFor="fe-throttle">
            <Input
              id="fe-throttle"
              type="number"
              min={1}
              value={cfg.rate_kbps}
              onChange={(e) => onChange({ rate_kbps: Number(e.target.value) })}
            />
          </Field>
        </div>
      );
    }
    if (faultType === "latency") {
      return (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Latency (ms)" htmlFor="fe-net-lat">
            <Input
              id="fe-net-lat"
              type="number"
              min={0}
              value={cfg.latency_ms}
              onChange={(e) => onChange({ latency_ms: Number(e.target.value) })}
            />
          </Field>
          <Field label="Jitter ± (ms)" htmlFor="fe-net-jitter">
            <Input
              id="fe-net-jitter"
              type="number"
              min={0}
              value={cfg.jitter_ms}
              onChange={(e) => onChange({ jitter_ms: Number(e.target.value) })}
            />
          </Field>
        </div>
      );
    }
    if (faultType === "drip") {
      return (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Rate (B/s)" htmlFor="fe-drip">
            <Input
              id="fe-drip"
              type="number"
              min={1}
              value={cfg.rate_bytes_s}
              onChange={(e) => onChange({ rate_bytes_s: Number(e.target.value) })}
            />
          </Field>
        </div>
      );
    }
  }

  if (category === "resource") {
    if (faultType === "cpu") {
      return (
        <div className="grid grid-cols-2 gap-3">
          <Field label="CPU (%)" htmlFor="fe-cpu-pct">
            <Input
              id="fe-cpu-pct"
              type="number"
              min={1}
              max={100}
              value={cfg.cpu_percent}
              onChange={(e) => onChange({ cpu_percent: Number(e.target.value) })}
            />
          </Field>
          <Field label="Cores" htmlFor="fe-cpu-cores">
            <Input
              id="fe-cpu-cores"
              type="number"
              min={1}
              value={cfg.cpu_cores}
              onChange={(e) => onChange({ cpu_cores: Number(e.target.value) })}
            />
          </Field>
        </div>
      );
    }
    if (faultType === "memory") {
      return (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Size (MiB)" htmlFor="fe-mem">
            <Input
              id="fe-mem"
              type="number"
              min={1}
              value={cfg.size_mb}
              onChange={(e) => onChange({ size_mb: Number(e.target.value) })}
            />
          </Field>
        </div>
      );
    }
    if (faultType === "io") {
      return (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Rate (MiB/s)" htmlFor="fe-io">
            <Input
              id="fe-io"
              type="number"
              min={1}
              value={cfg.io_rate_mbps}
              onChange={(e) => onChange({ io_rate_mbps: Number(e.target.value) })}
            />
          </Field>
        </div>
      );
    }
  }

  return null;
}

// ─── Field helper ────────────────────────────────────────────────────────

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-xs font-medium">
        {label}
      </Label>
      {children}
    </div>
  );
}
