/** Demo service names used until the environment reports its own (SDK
 *  instances, rule targets, workflow targets). Matches online-boutique. */
export const FALLBACK_SERVICES = [
  "productcatalog",
  "cartservice",
  "checkoutservice",
  "paymentservice",
  "shippingservice",
  "currencyservice",
  "emailservice",
  "adservice",
  "frontend",
] as const;

/** Sorted union of every service name the loaded data mentions, falling back
 *  to the demo list when nothing is known yet. */
export function knownServices(...sources: readonly (readonly string[] | undefined)[]): string[] {
  const set = new Set<string>();
  for (const list of sources) for (const s of list ?? []) if (s) set.add(s);
  return set.size ? [...set].sort() : [...FALLBACK_SERVICES];
}
