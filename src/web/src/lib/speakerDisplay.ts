import type { Snapshot } from "@/api/types";

export type DisplayScale = "compact" | "standard" | "large";
export type DisplayMargin = "tight" | "standard" | "safe";
export type DisplayContrast = "standard" | "high";
export type DisplayChrome = "standard" | "minimal";
export type DisplayProgress = "line" | "ring" | "off";

export interface SpeakerDisplayOptions {
  scale: DisplayScale;
  margin: DisplayMargin;
  contrast: DisplayContrast;
  chrome: DisplayChrome;
  progress: DisplayProgress;
}

export interface SpeakerDisplayState {
  kind: "idle" | "preRoll" | "running" | "final" | "overrun" | "paused" | "ended";
  label: string;
  tone: "neutral" | "accent" | "warning" | "final" | "overrun";
}

const defaults: SpeakerDisplayOptions = {
  scale: "standard",
  margin: "standard",
  contrast: "standard",
  chrome: "standard",
  progress: "line",
};

export function displayOptionsFromSearch(search: string): SpeakerDisplayOptions {
  const params = new URLSearchParams(search);
  return {
    scale: pick(params.get("scale"), ["compact", "standard", "large"], defaults.scale),
    margin: pick(params.get("margin"), ["tight", "standard", "safe"], defaults.margin),
    contrast: pick(params.get("contrast"), ["standard", "high"], defaults.contrast),
    chrome: pick(params.get("chrome"), ["standard", "minimal"], defaults.chrome),
    progress: pick(params.get("progress"), ["line", "ring", "off"], defaults.progress),
  };
}

export function speakerDisplayState(snapshot: Snapshot, remainingMs: number): SpeakerDisplayState {
  if (snapshot.phase === "PreRoll") return { kind: "preRoll", label: "Starts in", tone: "accent" };
  if (snapshot.phase === "Paused") return { kind: "paused", label: "Paused", tone: "neutral" };
  if (snapshot.phase === "Ended") return { kind: "ended", label: "Ended", tone: "neutral" };
  if (snapshot.phase === "Running" && remainingMs <= 0) return { kind: "overrun", label: "Over time", tone: "overrun" };
  if (snapshot.phase === "Running" && remainingMs <= 10_000) return { kind: "final", label: "Final seconds", tone: "final" };
  if (snapshot.phase === "Running" && remainingMs <= 60_000) return { kind: "final", label: "Final minute", tone: "warning" };
  if (snapshot.phase === "Running") return { kind: "running", label: "Remaining", tone: "neutral" };
  return { kind: "idle", label: "Up next", tone: "neutral" };
}

export function progressForSnapshot(snapshot: Snapshot, remainingMs: number): number {
  if (snapshot.phase === "PreRoll" && snapshot.currentItem?.preRollSec) {
    const total = snapshot.currentItem.preRollSec * 1000;
    return clamp01((total - Math.max(0, remainingMs)) / total);
  }
  if ((snapshot.phase === "Running" || snapshot.phase === "Paused") && snapshot.currentItem) {
    const total = Math.max(1, (snapshot.currentItem.durationSec + snapshot.adjustmentSec) * 1000);
    return clamp01((total - Math.max(0, remainingMs)) / total);
  }
  return 0;
}

function pick<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? value as T : fallback;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
