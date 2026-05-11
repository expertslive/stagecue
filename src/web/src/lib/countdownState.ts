import type { Snapshot } from "@/api/types";
import { colorTokenForRemaining } from "@/lib/thresholds";

export function computeRemaining(s: Snapshot, skewMs: number): number {
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

/** Colour token a hero / halo / card should sync to. */
export function activeCountdownColor(snapshot: Snapshot, skewMs: number): string {
  if (snapshot.phase === "PreRoll") return "var(--accent)";
  const tokens = snapshot.currentItem?.thresholds ?? [];
  return colorTokenForRemaining(tokens, computeRemaining(snapshot, skewMs));
}
