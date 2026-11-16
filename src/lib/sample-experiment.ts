/**
 * The public demo's one-click sample run, and where `/` goes per build.
 * The sample is a fixture, so its URL still resolves after a page reload
 * resets the mock store.
 */
import { mockRestart } from "@/lib/api/mock-experiments";
import { SAMPLE_EXPERIMENT_ID } from "@/lib/api/mock-fixtures";

/** Resets and starts the sample in the mock engine and returns its id.
 *  Throws the mock's ApiError when admission control refuses. */
export function startSampleExperiment(): string {
  return mockRestart(SAMPLE_EXPERIMENT_ID).id;
}

/** Operator builds send `/` to the dashboard; the mock build shows the landing page. */
export function indexRedirect(isMock: boolean): "/dashboard" | undefined {
  return isMock ? undefined : "/dashboard";
}
