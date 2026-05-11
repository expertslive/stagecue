import { useEffect, useState } from "react";
import type { ConnectionState } from "@/hub/timerHub";

interface Props {
  /** Connection state from useTimerHub / useEventRoomSnapshots. */
  connectionState?: ConnectionState;
  /** Number of operator commands waiting to flush. Surfaced while offline / reconnecting. */
  queuedCount?: number;
  /** Legacy fallbacks used by callers that don't yet pass connectionState. */
  ready?: boolean;
  hasError?: boolean;
  /** ISO timestamp of the most recent server snapshot (or null if none received). */
  lastSnapshotUtc?: string | null;
}

export default function LiveIndicator({ connectionState, queuedCount = 0, ready, hasError, lastSnapshotUtc }: Props) {
  // Re-render every 1s so the freshness string stays accurate without parent updates.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // Prefer the explicit connectionState when supplied; otherwise derive from ready/hasError.
  const state: ConnectionState =
    connectionState ?? (hasError ? "disconnected" : ready ? "connected" : "connecting");

  let dotClass: string;
  let label: string;
  if (state === "disconnected") {
    dotClass = queuedCount > 0 ? "bg-amber-500 animate-pulse" : "bg-red-500";
    label = queuedCount > 0
      ? `Offline · ${queuedCount} queued`
      : "Offline";
  } else if (state === "connecting" || state === "reconnecting") {
    dotClass = "bg-amber-500 animate-pulse";
    label = queuedCount > 0
      ? `Reconnecting · ${queuedCount} queued`
      : "Reconnecting…";
  } else {
    // Connected.
    dotClass = "bg-emerald-500";
    const fresh = freshness(lastSnapshotUtc);
    label = fresh ? `Live · ${fresh}` : "Live";
  }

  return (
    <div className="inline-flex items-center gap-2 text-xs text-zinc-400" role="status" aria-live="polite">
      <span aria-hidden="true" className={`size-1.5 rounded-full ${dotClass}`} />
      <span className="tabular-nums">{label}</span>
    </div>
  );
}

function freshness(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms) || ms < 0) return null;
  const s = Math.floor(ms / 1000);
  if (s < 2) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return null;
}
