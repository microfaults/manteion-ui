/** Shared layout pieces for the landing page's sections. */
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/** Page-width column, used by every landing band. */
export const COLUMN = "mx-auto box-border w-full max-w-[1120px] px-6";

/** Small mono, uppercase label above a heading or a card. */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "font-mono text-[11px] uppercase leading-4 tracking-[0.08em] text-muted-foreground",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** A bordered band with an eyebrow and an `h2`. */
export function LandingSection({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="border-t border-border">
      <div className={cn(COLUMN, "flex flex-col gap-2 py-14")}>
        <Eyebrow>{eyebrow}</Eyebrow>
        <h2 className="text-2xl font-semibold tracking-[-0.02em]">{title}</h2>
        {children}
      </div>
    </section>
  );
}

/** Lead paragraph under a section heading. */
export function Lead({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("max-w-[700px] text-[15px] leading-6 text-muted-foreground", className)}>
      {children}
    </p>
  );
}

/** Link that leaves the site; the trailing arrow is decorative. */
export function ExternalLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={cn("text-primary hover:underline", className)}
    >
      {children}
      <span aria-hidden="true"> ↗</span>
    </a>
  );
}
