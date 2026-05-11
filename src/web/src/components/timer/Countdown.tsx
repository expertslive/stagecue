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
}

const fontSizeFor: Record<Variant, string> = {
  hero: "min(28vw, 360px)",
  compact: "min(18vw, 240px)",
};

export default function Countdown({ snapshot, skewMs, variant = "hero" }: Props) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 100);
    return () => clearInterval(id);
  }, []);

  const remainingMs = computeRemaining(snapshot, skewMs);
  const isPreRoll = snapshot.phase === "PreRoll";
  const color = activeCountdownColor(snapshot, skewMs);
  const label = isPreRoll ? "Starts in" : remainingMs <= 0 ? "Overrun" : "Remaining";

  // Pulse during the final 10 seconds of a Running session.
  const pulse = snapshot.phase === "Running" && remainingMs > 0 && remainingMs <= 10_000;
  const announce = snapshot.phase === "Running" && remainingMs > 0 && remainingMs <= 60_000;

  return (
    <div className="flex flex-col items-center justify-center w-full">
      {variant === "hero" && (
        <div className="text-xs uppercase tracking-widest text-zinc-500 mb-3 transition-opacity duration-200">{label}</div>
      )}
      <div
        className={`countdown-color font-bold leading-none tabular-nums ${pulse ? "countdown-pulse" : ""}`}
        style={{
          color,
          fontSize: fontSizeFor[variant],
          letterSpacing: "0",
          fontFamily: '"SF Pro Display", -apple-system, BlinkMacSystemFont, ui-sans-serif, system-ui, sans-serif',
        }}
        aria-live={announce ? "polite" : undefined}
        aria-atomic={announce ? "true" : undefined}
      >
        {formatRemaining(remainingMs)}
      </div>
    </div>
  );
}
