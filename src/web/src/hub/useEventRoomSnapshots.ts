import { useEffect, useMemo, useState } from "react";
import { TimerHub } from "./timerHub";
import type { Snapshot } from "@/api/types";
import { measureSkew } from "@/lib/clockSkew";

export interface UseEventRoomSnapshotsResult {
  snapshots: Record<string, Snapshot>;
  skewMs: number;
  ready: boolean;
  error: Error | null;
}

/**
 * Opens a single authenticated SignalR connection and subscribes to every room
 * in the supplied list. Returns a map of roomId → snapshot.
 *
 * Trade-off: one shared connection per dashboard view is fine for events with
 * up to ~50 rooms. Beyond that we'd want server-side multiplexing rather than
 * N resync calls.
 */
export function useEventRoomSnapshots(roomIds: string[]): UseEventRoomSnapshotsResult {
  const [snapshots, setSnapshots] = useState<Record<string, Snapshot>>({});
  const [skewMs, setSkewMs] = useState(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Stable key so the effect doesn't reconnect on every parent re-render.
  const key = useMemo(() => roomIds.slice().sort().join(","), [roomIds]);

  useEffect(() => {
    if (!key) return;
    const ids = key.split(",").filter(Boolean);
    if (ids.length === 0) return;

    let cancelled = false;
    const hub = new TimerHub(null);

    const offSnap = hub.onSnapshot((snap) => {
      if (cancelled) return;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSnapshots((prev) => ({ ...prev, [snap.roomId]: snap }));
      setSkewMs(measureSkew(snap.serverNowUtc));
    });
    const offMsg = hub.onMessage((rid, message) => {
      if (cancelled) return;
      setSnapshots((prev) => prev[rid] ? { ...prev, [rid]: { ...prev[rid], currentMessage: message } } : prev);
    });

    hub.start()
      .then(async () => {
        if (cancelled) return;
        setReady(true);
        // Subscribe + fetch the current state for every room in parallel.
        const results = await Promise.allSettled(ids.map((id) => hub.resync(id)));
        if (cancelled) return;
        const merged: Record<string, Snapshot> = {};
        for (const r of results) {
          if (r.status === "fulfilled" && r.value) {
            merged[r.value.roomId] = r.value;
          }
        }
        if (Object.keys(merged).length > 0) {
          setSnapshots((prev) => ({ ...prev, ...merged }));
          const last = Object.values(merged).at(-1);
          if (last) setSkewMs(measureSkew(last.serverNowUtc));
        }
      })
      .catch((e) => { if (!cancelled) setError(e as Error); });

    return () => {
      cancelled = true;
      offSnap();
      offMsg();
      hub.stop().catch(() => { /* ignore */ });
    };
  }, [key]);

  return { snapshots, skewMs, ready, error };
}
