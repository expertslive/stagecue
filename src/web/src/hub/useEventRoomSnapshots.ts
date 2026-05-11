import { useEffect, useMemo, useState } from "react";
import { LogLevel } from "@microsoft/signalr";
import { TimerHub, type DisplayPresence, type ConnectionState } from "./timerHub";
import type { Snapshot } from "@/api/types";
import { measureSkew } from "@/lib/clockSkew";

export interface UseEventRoomSnapshotsResult {
  snapshots: Record<string, Snapshot>;
  presence: DisplayPresence;
  skewMs: number;
  ready: boolean;
  error: Error | null;
  connectionState: ConnectionState;
}

const emptyPresence: DisplayPresence = { lobby: 0, rooms: {} };

/**
 * Opens a single authenticated SignalR connection and subscribes to every room
 * in the supplied list. Returns a map of roomId → snapshot.
 *
 * Trade-off: one shared connection per dashboard view is fine for events with
 * up to ~50 rooms. Beyond that we'd want server-side multiplexing rather than
 * N resync calls.
 */
export function useEventRoomSnapshots(roomIds: string[], eventId?: string): UseEventRoomSnapshotsResult {
  const [snapshots, setSnapshots] = useState<Record<string, Snapshot>>({});
  const [presence, setPresence] = useState<DisplayPresence>(emptyPresence);
  const [skewMs, setSkewMs] = useState(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>("disconnected");

  // Stable key so the effect doesn't reconnect on every parent re-render.
  const key = useMemo(() => roomIds.slice().sort().join(","), [roomIds]);

  useEffect(() => {
    if (!key) return;
    const ids = key.split(",").filter(Boolean);
    if (ids.length === 0) return;

    let cancelled = false;
    // Read-only dashboard connection: silence SignalR client logging so that expected
    // per-room "Forbidden" rejections (RoomOperator scoped to a subset, Viewer with no
    // hub access) don't render as red errors in the operator's console. Real connection
    // problems still surface via the `error` state below.
    const hub = new TimerHub(null, undefined, LogLevel.Critical);

    const offSnap = hub.onSnapshot((snap) => {
      if (cancelled) return;
      setSnapshots((prev) => ({ ...prev, [snap.roomId]: snap }));
      setSkewMs(measureSkew(snap.serverNowUtc));
    });
    const offMsg = hub.onMessage((rid, message) => {
      if (cancelled) return;
      setSnapshots((prev) => prev[rid] ? { ...prev, [rid]: { ...prev[rid], currentMessage: message } } : prev);
    });
    const offPresence = hub.onPresence((changedEventId, nextPresence) => {
      if (cancelled || (eventId && changedEventId !== eventId)) return;
      setPresence(nextPresence);
    });
    const offConn = hub.onConnectionChange((s) => {
      if (cancelled) return;
      setConnectionState(s);
      if (s === "connected") {
        // Re-subscribe to every room after a reconnect.
        ids.forEach((id) => {
          hub.resync(id)
            .then((fresh) => {
              if (cancelled || !fresh) return;
              setSnapshots((prev) => ({ ...prev, [fresh.roomId]: fresh }));
            })
            .catch(() => { /* best-effort, expected for rooms the user can't access */ });
        });
      }
    });

    hub.start()
      .then(async () => {
        if (cancelled) return;
        setReady(true);
        // Subscribe + fetch the current state for every room in parallel. Each resync is
        // caught individually so a Forbidden on one room doesn't block the others, and so
        // the rejection promise is consumed (no "unhandled rejection" noise).
        const results = await Promise.all(ids.map((id) =>
          hub.resync(id).catch(() => null as Snapshot | null),
        ));
        if (cancelled) return;
        const merged: Record<string, Snapshot> = {};
        for (const snap of results) {
          if (snap) merged[snap.roomId] = snap;
        }
        if (Object.keys(merged).length > 0) {
          setSnapshots((prev) => ({ ...prev, ...merged }));
          const last = Object.values(merged).at(-1);
          if (last) setSkewMs(measureSkew(last.serverNowUtc));
        }
        if (eventId) {
          // Presence is best-effort — a Viewer who can't read presence shouldn't break the dashboard.
          const nextPresence = await hub.getPresenceForEvent(eventId).catch(() => emptyPresence);
          if (!cancelled) setPresence(nextPresence);
        }
      })
      .catch((e) => { if (!cancelled) setError(e as Error); });

    return () => {
      cancelled = true;
      offSnap();
      offMsg();
      offPresence();
      offConn();
      hub.stop().catch(() => { /* ignore */ });
    };
  }, [key, eventId]);

  return { snapshots, presence, skewMs, ready, error, connectionState };
}
