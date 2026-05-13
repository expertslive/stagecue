import { useEffect, useState } from "react";
import { formatRemaining } from "@/lib/time";
import { computeRemaining, activeCountdownColor } from "@/lib/countdownState";
import type { Snapshot } from "@/api/types";

type Variant = "hero" | "compact";

interface Props {
  snapshot: Snapshot;
  skewMs: number;
  /**
   * "hero" (default): full stage-display sizing (up to ~360px). Used by SpeakerView.
   * "compact": operator-console sizing (~240px max). The label above the numeral
   * is suppressed since the surrounding hero card already provides phase context.
   */
  variant?: Variant;
  scale?: "compact" | "standard" | "large";
  label?: string;
  pulse?: boolean;
}

// Per-variant sizing budget. Original tuning targets a ~5-char string ("MM:SS" or "H:MM:SS"
// with a 1-digit H). At extreme overruns the string can grow to 9 chars ("+HH:MM:SS"), which
// at the original constants overflowed the viewport (speaker view) and the card (compact).
// Scale both vw and px caps by 5/chars so long strings shrink to fit.
const baseFor: Record<Variant, { vw: number; px: number }> = {
  hero: { vw: 95, px: 360 },     // ~full viewport
  compact: { vw: 40, px: 240 },  // ~half viewport (operator hero card)
};
// Approximate width-per-em of a tabular SF Pro Display glyph at this weight.
const GLYPH_WIDTH_EM = 0.55;

export default function Countdown({ snapshot, skewMs, variant = "hero", scale = "standard", label, pulse = false }: Props) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 100);
    return () => clearInterval(id);
  }, []);

  const remainingMs = computeRemaining(snapshot, skewMs);
  const isPreRoll = snapshot.phase === "PreRoll";
  const color = activeCountdownColor(snapshot, skewMs);
  const fallbackLabel = isPreRoll ? "Starts in" : remainingMs <= 0 ? "Over time" : "Remaining";
  const announce = snapshot.phase === "Running" && remainingMs > 0 && remainingMs <= 60_000;

  const formatted = formatRemaining(remainingMs);
  const chars = Math.max(formatted.length, 5);
  const base = baseFor[variant];
  const vw = (base.vw / chars / GLYPH_WIDTH_EM).toFixed(1);
  const scaleFactor = scale === "large" ? 1.16 : scale === "compact" ? 0.86 : 1;
  const px = Math.floor(((base.px * 5) / chars) * scaleFactor);
  const fontSize = `min(${vw}vw, ${px}px)`;

  return (
    <div className="flex flex-col items-center justify-center w-full">
      {variant === "hero" && (
        <div className="text-xs uppercase tracking-widest text-zinc-500 mb-3 transition-opacity duration-200">{label ?? fallbackLabel}</div>
      )}
      <div
        className={`countdown-color font-semibold leading-none tabular-nums ${pulse ? "countdown-pulse-once" : ""}`}
        style={{
          color,
          fontSize,
          letterSpacing: "0",
          fontFamily: '"SF Pro Display", -apple-system, BlinkMacSystemFont, ui-sans-serif, system-ui, sans-serif',
        }}
        aria-live={announce ? "polite" : undefined}
        aria-atomic={announce ? "true" : undefined}
      >
        {formatted}
      </div>
    </div>
  );
}
