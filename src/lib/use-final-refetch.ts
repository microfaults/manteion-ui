/**
 * A query that polls only while its subject is in flight stops polling the
 * moment the subject turns terminal, so its last answer can predate the end
 * (a zeus run still "running", fault events not yet closed). This marks the
 * query stale once when `live` turns false: an active query refetches its
 * final state at once, an inactive one on its next use.
 */
import { type QueryKey, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

export function useFinalRefetch(queryKey: QueryKey, live: boolean): void {
  const qc = useQueryClient();
  const wasLive = useRef(live);
  const key = useRef(queryKey);
  key.current = queryKey;
  useEffect(() => {
    if (wasLive.current && !live) void qc.invalidateQueries({ queryKey: key.current, exact: true });
    wasLive.current = live;
  }, [live, qc]);
}
