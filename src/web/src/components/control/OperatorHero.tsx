import { useEffect, useState } from "react";
import type { Snapshot } from "@/api/types";
import Countdown from "@/components/timer/Countdown";
import { activeCountdownColor, computeRemaining } from "@/lib/countdownState";
import { relativeStartHint } from "@/lib/timeHints";

interface Props {
  snapshot: Snapshot;
  skewMs: number;
}

/**
 * Operator-console hero card. Merges what used to be CueStrip + Countdown card
 * into a single signature surface. The active threshold colour bleeds through
 * as a soft radial halo behind the numeral.
 */
export default function OperatorHero({ snapshot, skewMs }: Props) {
  // Re-render every 1s so the relative next-item hint stays fresh.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const haloColor = activeCountdownColor(snapshot, skewMs);
  const { leading, title, subtitle, dim } = describeHeader(snapshot);
  const nextLine = describeNextLine(snapshot);
  const remainingMs = computeRemaining(snapshot, skewMs);
  const isOverrun = snapshot.phase === "Running" && remainingMs <= 0;
  const phaseLabel = phaseLabelFor(snapshot, isOverrun);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/5 bg-zinc-900/60 backdrop-blur-sm">
      {/* Halo backdrop — picks up the current threshold colour. Capped at 22% opacity. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 transition-colors duration-300 ease-[var(--ease-out)]"
        style={{
          background: `radial-gradient(60% 80% at 50% 55%, color-mix(in srgb, ${haloColor} 22%, transparent) 0%, transparent 70%)`,
        }}
      />

      <div className="relative flex flex-col gap-4 px-6 pt-5 pb-6">
        {/* Cue header */}
        <div className="flex items-baseline justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium uppercase tracking-widest text-zinc-500">{leading}</div>
            <div className={`truncate text-lg font-semibold ${dim ? "text-zinc-400" : "text-zinc-100"}`} title={title}>
              {title}
            </div>
            {subtitle && <div className="truncate text-sm text-zinc-400">{subtitle}</div>}
          </div>
          {phaseLabel && (
            <span
              className="rounded-full px-2.5 py-1 text-xs font-medium"
              style={{
                color: haloColor,
                background: `color-mix(in srgb, ${haloColor} 14%, transparent)`,
              }}
            >
              {phaseLabel}
            </span>
          )}
        </div>

        {/* Countdown */}
        <div className="flex items-center justify-center py-2">
          <Countdown snapshot={snapshot} skewMs={skewMs} variant="compact" />
        </div>

        {/* Next-item footer */}
        {nextLine && (
          <div className="flex items-center gap-2 border-t border-white/5 pt-3 text-sm text-zinc-400">
            <span className="text-xs font-medium uppercase tracking-widest text-zinc-500">Next</span>
            <span className="truncate text-zinc-300" title={nextLine.title}>{nextLine.title}</span>
            {nextLine.detail && <span className="text-zinc-500">· {nextLine.detail}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

function describeHeader(s: Snapshot): { leading: string; title: string; subtitle: string | null; dim: boolean } {
  if (s.phase === "Running" && s.currentItem) {
    return { leading: "Now", title: s.currentItem.title, subtitle: s.currentItem.speakerName ?? null, dim: false };
  }
  if (s.phase === "Paused" && s.currentItem) {
    return { leading: "Paused", title: s.currentItem.title, subtitle: s.currentItem.speakerName ?? null, dim: false };
  }
  if (s.phase === "PreRoll" && s.currentItem) {
    return { leading: "Starting", title: s.currentItem.title, subtitle: s.currentItem.speakerName ?? null, dim: false };
  }
  if (s.phase === "Ended" && s.currentItem) {
    return { leading: "Just ended", title: s.currentItem.title, subtitle: null, dim: true };
  }
  if (s.nextItem) {
    return {
      leading: "Up next",
      title: s.nextItem.title,
      subtitle: relativeStartHint(s.nextItem.scheduledStartUtc),
      dim: false,
    };
  }
  return { leading: "Idle", title: "Nothing scheduled", subtitle: null, dim: true };
}

function describeNextLine(s: Snapshot): { title: string; detail: string | null } | null {
  // Only show the "Next" footer when we are actively running/paused/preroll AND something else is queued.
  const hasCurrent = (s.phase === "Running" || s.phase === "Paused" || s.phase === "PreRoll") && !!s.currentItem;
  if (!hasCurrent || !s.nextItem) return null;
  return {
    title: s.nextItem.title,
    detail: relativeStartHint(s.nextItem.scheduledStartUtc),
  };
}

function phaseLabelFor(s: Snapshot, isOverrun: boolean): string | null {
  if (isOverrun) return "Over time";
  switch (s.phase) {
    case "Running": return "Running";
    case "Paused": return "Paused";
    case "PreRoll": return "Pre-roll";
    case "Ended": return "Ended";
    default: return null;
  }
}
