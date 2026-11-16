/**
 * Build-time UI flags. `IS_MOCK` gates the public demo's chrome (simulated-data
 * bar, desktop notice, synthetic and accelerated labels). The API modules keep
 * their own `USE_MOCK` constants for choosing fixtures over fetch.
 */
export const IS_MOCK: boolean = import.meta.env.VITE_USE_MOCK === "true";
