import type { Threshold } from "@/api/types";

/**
 * Picks the smallest threshold.secondsRemaining still ≥ remainingMs/1000 — the tightest
 * threshold we've crossed but not yet crossed past. Returns null when no threshold matches
 * (use the --primary token) or when remainingMs <= 0 (use the --overrun token).
 */
export function activeThreshold(thresholds: Threshold[], remainingMs: number): Threshold | null {
  if (remainingMs <= 0 || thresholds.length === 0) return null;
  let best: Threshold | null = null;
  for (const t of thresholds) {
    if (t.secondsRemaining * 1000 < remainingMs) continue;
    if (!best || t.secondsRemaining < best.secondsRemaining) best = t;
  }
  return best;
}

export function colorTokenForRemaining(thresholds: Threshold[], remainingMs: number): string {
  if (remainingMs <= 0) return "var(--overrun)";
  const t = activeThreshold(thresholds, remainingMs);
  return t ? `var(--${t.colorToken})` : "var(--primary)";
}
