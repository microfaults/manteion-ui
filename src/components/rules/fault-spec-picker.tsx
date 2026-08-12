import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { faultsApi } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";

interface FaultSpecPickerProps {
  value: string;
  onChange: (id: string) => void;
}

/** Combobox bound to GET /api/v1/faults/specs. A loaded-but-empty catalog
 *  points at the Faults page (rule validation blocks saving until a spec
 *  exists); a failed fetch keeps the manual-ID escape hatch for older
 *  backends that don't serve the endpoint. */
export function FaultSpecPicker({ value, onChange }: FaultSpecPickerProps) {
  const q = useQuery({
    queryKey: ["fault-specs"],
    queryFn: faultsApi.listFaultSpecs,
    retry: 1,
    staleTime: 30_000,
  });

  if (q.isLoading) {
    return <Input disabled placeholder="Loading fault specs…" mono className="text-sm" />;
  }

  if (q.isError) {
    const msg = q.error instanceof Error ? q.error.message : "fetch failed";
    return (
      <div className="space-y-1">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="spec-…"
          aria-label="Fault spec ID"
          mono
          className="text-sm"
        />
        <p className="text-[11px] text-muted-foreground">
          Couldn't load fault catalog ({msg}) — enter the spec ID manually.
        </p>
      </div>
    );
  }

  const specs = q.data ?? [];
  if (specs.length === 0) {
    return (
      <div className="space-y-1">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="spec-…"
          aria-label="Fault spec ID"
          mono
          className="text-sm"
        />
        <p className="text-[11px] text-muted-foreground">
          No fault specs defined yet — create one on the Faults page first.
        </p>
      </div>
    );
  }

  return (
    <NativeSelect
      aria-label="Fault spec"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Pick a fault spec…"
      options={specs.map((s) => ({
        value: s.id,
        label: `${s.category}:${s.fault_type} · ${s.name}`,
      }))}
      className="font-mono text-sm"
    />
  );
}
