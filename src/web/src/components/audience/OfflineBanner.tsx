import { useEffect, useState } from "react";
import type { ConnectionState } from "@/hub/timerHub";

interface Props {
  connectionState: ConnectionState;
  /** Hide the banner for this long after the socket drops, to avoid flashing on micro-blips. Default 30s. */
  delayMs?: number;
}

/**
 * Non-blocking banner that appears on audience surfaces (Speaker / Door / Lobby) only after
 * the connection has been down for `delayMs`. Short network blips never show anything —
 * the countdown keeps ticking locally and the audience is none the wiser.
 */
export default function OfflineBanner({ connectionState, delayMs = 30_000 }: Props) {
  const [showing, setShowing] = useState(false);

  useEffect(() => {
    if (connectionState === "connected" || connectionState === "connecting") {
      setShowing(false);
      return;
    }
    // Disconnected or reconnecting: only show after the delay.
    const id = setTimeout(() => setShowing(true), delayMs);
    return () => clearTimeout(id);
  }, [connectionState, delayMs]);

  if (!showing) return null;

  return (
    <div
      role="status"
      className="pointer-events-none absolute left-1/2 top-6 z-30 -translate-x-1/2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-200/90 backdrop-blur-sm"
    >
      <span aria-hidden="true" className="mr-1.5 inline-block size-1.5 animate-pulse rounded-full bg-amber-400 align-middle" />
      Reconnecting · display may drift
    </div>
  );
}
