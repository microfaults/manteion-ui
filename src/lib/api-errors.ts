import { ApiError } from "@/lib/api/client";

/** Operator-facing line for a failed manteion call: status, the backend's
 *  `code` once B6 ships, and its `error` text verbatim. */
export function describeApiError(e: unknown): string {
  if (e instanceof ApiError) {
    const body = e.body as { error?: string; code?: string } | undefined;
    const detail = body?.error ?? e.message;
    return `manteion answered ${e.status}${body?.code ? ` (${body.code})` : ""}: ${detail}`;
  }
  return e instanceof Error ? e.message : String(e);
}
