import { useEffect, useState } from "react";
import { formatRemaining } from "@/lib/time";
import { colorTokenForRemaining } from "@/lib/thresholds";
import type { Snapshot } from "@/api/types";

interface Props {
  snapshot: Snapshot;
  skewMs: number;
}

export default function Countdown({ snapshot, skewMs }: Props) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 100);
    return () => clearInterval(id);
  }, []);

  const remainingMs = computeRemaining(snapshot, skewMs);
  const isPreRoll = snapshot.phase === "PreRoll";
  const tokens = snapshot.currentItem?.thresholds ?? [];
  const color = isPreRoll ? "var(--accent)" : colorTokenForRemaining(tokens, remainingMs);
  const label = isPreRoll ? "Starts in" : remainingMs <= 0 ? "Overrun" : "Remaining";

  // Pulse during the final 10 seconds of a Running session.
  const pulse = snapshot.phase === "Running" && remainingMs > 0 && remainingMs <= 10_000;
  const announce = snapshot.phase === "Running" && remainingMs > 0 && remainingMs <= 60_000;

  return (
    <div className="flex flex-col items-center justify-center w-full">
      <div className="text-xs uppercase tracking-widest text-zinc-500 mb-3 transition-opacity duration-200">{label}</div>
      <div
        className={`countdown-color font-bold leading-none tabular-nums ${pulse ? "countdown-pulse" : ""}`}
        style={{ color, fontSize: "min(28vw, 360px)", letterSpacing: "-0.04em" }}
        aria-live={announce ? "polite" : undefined}
        aria-atomic={announce ? "true" : undefined}
      >
        {formatRemaining(remainingMs)}
      </div>
    </div>
  );
}

function computeRemaining(s: Snapshot, skewMs: number): number {
  const serverNow = Date.now() + skewMs;
  if (s.phase === "PreRoll" && s.preRollEndsAtUtc) {
    return new Date(s.preRollEndsAtUtc).getTime() - serverNow;
  }
  if (s.phase === "Running" && s.startedAtUtc && s.currentItem) {
    const elapsedMs = serverNow - new Date(s.startedAtUtc).getTime() - s.pausedAccumSec * 1000;
    const totalMs = (s.currentItem.durationSec + s.adjustmentSec) * 1000;
    return totalMs - elapsedMs;
  }
  if (s.phase === "Paused" && s.pauseRemainingMs != null) {
    return s.pauseRemainingMs;
  }
  return 0;
}
