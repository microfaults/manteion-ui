import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { faultsApi } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";

interface FaultSpecPickerProps {
  value: string;
  onChange: (id: string) => void;
}

/** Combobox bound to GET /api/v1/faults/specs. Falls back to free-text
 *  on empty list or fetch error, with a small helper note. */
export function FaultSpecPicker({ value, onChange }: FaultSpecPickerProps) {
  const q = useQuery({
    queryKey: ["fault-specs"],
    queryFn: faultsApi.listFaultSpecs,
    retry: 1,
    staleTime: 30_000,
  });

  if (q.isLoading) {
    return <Input disabled placeholder="Loading fault specs…" className="font-mono text-sm" />;
  }

  if (q.isError) {
    const msg = q.error instanceof Error ? q.error.message : "fetch failed";
    return (
      <div className="space-y-1">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="spec-…"
          className="font-mono text-sm"
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
          className="font-mono text-sm"
        />
        <p className="text-[11px] text-muted-foreground">
          No fault specs defined yet — create one via{" "}
          <code className="font-mono">POST /api/v1/faults/specs</code>, or type an ID manually.
        </p>
      </div>
    );
  }

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="font-mono text-sm">
        <SelectValue placeholder="Pick a fault spec…" />
      </SelectTrigger>
      <SelectContent>
        {specs.map((s) => (
          <SelectItem key={s.id} value={s.id} className="font-mono text-sm">
            {s.category}:{s.fault_type} · {s.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
