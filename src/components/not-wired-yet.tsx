import { Card, CardContent } from "@/components/ui/card";
import { ExternalLink, Wrench } from "lucide-react";

interface NotWiredYetProps {
  /** Which backend endpoint(s) this screen depends on. Free-form; one per line. */
  endpoints: string[];
  /** Short paragraph for why this isn't wired yet. */
  note?: string;
}

/** Placeholder for screens whose backend endpoints don't exist yet.
 *  Always points the operator at `docs/API-NEEDED.md` so the gap stays visible. */
export function NotWiredYet({ endpoints, note }: NotWiredYetProps) {
  return (
    <div className="mx-auto max-w-2xl py-12">
      <Card className="border-dashed bg-muted/20">
        <CardContent className="flex gap-4 p-6">
          <Wrench className="size-5 shrink-0 text-muted-foreground" aria-hidden />
          <div className="min-w-0">
            <h3 className="text-sm font-semibold">Not wired yet</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {note ??
                "This screen depends on backend endpoints that manteion-go has not yet exposed. The route is scaffolded so nav works end-to-end."}
            </p>
            <div className="mt-3">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Depends on
              </div>
              <ul className="mt-1 space-y-0.5 font-mono text-xs">
                {endpoints.map((ep) => (
                  <li key={ep} className="text-foreground/80">
                    · {ep}
                  </li>
                ))}
              </ul>
            </div>
            <div className="mt-4 inline-flex items-center gap-1 text-xs text-muted-foreground">
              See <code className="font-mono">docs/API-NEEDED.md</code> for the backlog.
              <ExternalLink className="size-3" aria-hidden />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
