import { useEffect, useState } from "react";
import { TimerHub, type ConnectionState } from "./timerHub";
import type { Snapshot } from "@/api/types";
import { measureSkew } from "@/lib/clockSkew";

export interface UseTimerHubResult {
  hub: TimerHub | null;
  snapshot: Snapshot | null;
  skewMs: number;
  ready: boolean;
  error: Error | null;
  /** Coarse-grained connection state. Drives offline indicators + command gating. */
  connectionState: ConnectionState;
}

export function useTimerHub(roomId: string | null, accessCode: string | null, surface?: "speaker" | "door"): UseTimerHubResult {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [skewMs, setSkewMs] = useState(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>("disconnected");
  // Hub is created INSIDE the effect (not via useMemo) so that React 18's strict-mode
  // double-mount produces two independent hub instances instead of reusing the same one.
  // Reusing would call .start() twice on the same connection and trigger:
  //   "Cannot start a HubConnection that is not in the 'Disconnected' state."
  const [hub, setHub] = useState<TimerHub | null>(null);

  useEffect(() => {
    if (!roomId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHub(null);
      setReady(false);
      setError(null);
      return;
    }
    let cancelled = false;
    const h = new TimerHub(accessCode, surface);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHub(h);
    setReady(false);
    setError(null);

    const offSnap = h.onSnapshot((snap) => {
      if (cancelled || snap.roomId !== roomId) return;
      setSnapshot(snap);
      setSkewMs(measureSkew(snap.serverNowUtc));
    });
    const offMsg = h.onMessage((rid, message) => {
      if (cancelled || rid !== roomId) return;
      setSnapshot((prev) => (prev ? { ...prev, currentMessage: message } : prev));
    });
    const offConn = h.onConnectionChange((s) => {
      if (cancelled) return;
      setConnectionState(s);
      // When the hub reconnects after a drop, resync to grab any state we missed.
      if (s === "connected") {
        h.resync(roomId)
          .then((fresh) => { if (!cancelled && fresh) setSnapshot(fresh); })
          .catch(() => { /* best-effort */ });
      }
    });

    h.start()
      .then(async () => {
        if (cancelled) return;
        setReady(true);
        const fresh = await h.resync(roomId);
        if (cancelled || !fresh) return;
        setSnapshot(fresh);
        setSkewMs(measureSkew(fresh.serverNowUtc));
      })
      .catch((e) => { if (!cancelled) setError(e as Error); });

    return () => {
      cancelled = true;
      offSnap();
      offMsg();
      offConn();
      h.stop().catch(() => { /* ignore */ });
    };
  }, [roomId, accessCode, surface]);

  return { hub, snapshot, skewMs, ready, error, connectionState };
}
