import type { ChangeEvent } from "react";
import { cn } from "@/lib/utils";

interface RegoEditorProps {
  value: string;
  onChange: (next: string) => void;
  diagnostics?: string[];
  readOnly?: boolean;
  className?: string;
}

/** Minimal textarea-based rego editor. Monaco is intentionally deferred until
 *  someone shows the sub-100ms typing feel matters more than the 400KB+ added
 *  to the bundle. The textarea still uses the JetBrains Mono token + 2-space
 *  soft tabs — good enough to read a few dozen lines. */
export function RegoEditor({
  value,
  onChange,
  diagnostics,
  readOnly,
  className,
}: RegoEditorProps) {
  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) =>
    onChange(e.target.value);

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <textarea
        spellCheck={false}
        value={value}
        readOnly={readOnly}
        onChange={handleChange}
        className={cn(
          "min-h-[260px] w-full resize-y rounded-md border border-input bg-muted/30 p-3 font-mono text-xs leading-5",
          "focus:outline-none focus:ring-1 focus:ring-ring",
          readOnly && "bg-muted cursor-text",
        )}
        placeholder={`package faults.match\n\ndefault allow := false\n\nallow if {\n  input.service == "cartservice"\n}`}
      />
      {diagnostics && diagnostics.length > 0 ? (
        <ul className="space-y-0.5 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
          {diagnostics.map((d, i) => (
            <li key={i} className="font-mono">
              · {d}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
