import * as React from "react";

import { cn } from "@/lib/utils";

export interface CodeBlockProps {
  /** Inline chip vs. padded block. */
  inline?: boolean;
  /** Language tag shown top-right (block only). */
  language?: string;
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

/** Mono code on a sunken surface — rule JSON, rego, shell commands, IDs. */
const CodeBlock = React.forwardRef<HTMLElement, CodeBlockProps>(
  ({ inline = false, language, children, className, style }, ref) => {
    if (inline) {
      return (
        <code
          ref={ref as React.Ref<HTMLElement>}
          className={cn(
            "inline-block rounded bg-surface-sunken px-1 py-0.5 font-mono text-mono text-[0.85em]",
            className,
          )}
          style={style}
        >
          {children}
        </code>
      );
    }

    return (
      <div className="relative">
        {language ? (
          <span className="pointer-events-none absolute right-2 top-2 z-10 select-none font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
            {language}
          </span>
        ) : null}
        <pre
          ref={ref as React.Ref<HTMLPreElement>}
          className={cn(
            "overflow-auto rounded-md border bg-surface-sunken p-3 font-mono text-mono text-xs",
            className,
          )}
          style={style}
        >
          {children}
        </pre>
      </div>
    );
  },
);
CodeBlock.displayName = "CodeBlock";

export { CodeBlock };
