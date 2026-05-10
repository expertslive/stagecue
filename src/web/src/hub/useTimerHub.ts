import { useEffect, useRef, useState } from "react";
import { TimerHub } from "./timerHub";
import type { Snapshot } from "@/api/types";
import { measureSkew } from "@/lib/clockSkew";

export interface UseTimerHubResult {
  hub: TimerHub | null;
  snapshot: Snapshot | null;
  skewMs: number;
  ready: boolean;
  error: Error | null;
}

export function useTimerHub(roomId: string | null, accessCode: string | null): UseTimerHubResult {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [skewMs, setSkewMs] = useState(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const hubRef = useRef<TimerHub | null>(null);

  useEffect(() => {
    if (!roomId) return;
    let cancelled = false;
    const hub = new TimerHub(accessCode);
    hubRef.current = hub;

    const offSnap = hub.onSnapshot((snap) => {
      if (cancelled || snap.roomId !== roomId) return;
      setSnapshot(snap);
      setSkewMs(measureSkew(snap.serverNowUtc));
    });
    const offMsg = hub.onMessage((rid, message) => {
      if (cancelled || rid !== roomId) return;
      setSnapshot((prev) => (prev ? { ...prev, currentMessage: message } : prev));
    });

    hub.start()
      .then(async () => {
        if (cancelled) return;
        setReady(true);
        const fresh = await hub.resync(roomId);
        if (cancelled || !fresh) return;
        setSnapshot(fresh);
        setSkewMs(measureSkew(fresh.serverNowUtc));
      })
      .catch((e) => { if (!cancelled) setError(e as Error); });

    return () => {
      cancelled = true;
      offSnap();
      offMsg();
      hub.stop().catch(() => { /* ignore */ });
      hubRef.current = null;
    };
  }, [roomId, accessCode]);

  return { hub: hubRef.current, snapshot, skewMs, ready, error };
}
