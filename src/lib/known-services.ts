/** The eleven services of the Go Online Boutique bed (service-beds), named
 *  exactly as they register with manteion. */
export const REAL_SERVICES: readonly string[] = [
  "adservice",
  "cartservice",
  "checkoutservice",
  "currencyservice",
  "emailservice",
  "frontend",
  "paymentservice",
  "productcatalogservice",
  "recommendationservice",
  "shippingservice",
  "shoppingassistantservice",
];

/** Service names used until the environment reports its own (SDK
 *  instances, rule targets, workflow targets). */
export const FALLBACK_SERVICES = REAL_SERVICES;

/** Sorted union of every service name the loaded data mentions, falling back
 *  to the demo list when nothing is known yet. */
export function knownServices(...sources: readonly (readonly string[] | undefined)[]): string[] {
  const set = new Set<string>();
  for (const list of sources) for (const s of list ?? []) if (s) set.add(s);
  return set.size ? [...set].sort() : [...FALLBACK_SERVICES];
}
