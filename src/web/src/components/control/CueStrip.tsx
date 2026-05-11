import type { Snapshot } from "@/api/types";
import { relativeStartHint } from "@/lib/timeHints";
import { useEffect, useState } from "react";
import { Play } from "lucide-react";

interface Props { snapshot: Snapshot }

export default function CueStrip({ snapshot }: Props) {
  // Re-render every 10s so the relative hint stays accurate without re-mounting on the 100ms tick.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 10_000);
    return () => clearInterval(id);
  }, []);

  // Decide what to surface.
  let leading: string;
  let title: string;
  let subtitle: string | null;
  if (snapshot.phase === "Running" && snapshot.currentItem) {
    leading = "Now"; title = snapshot.currentItem.title; subtitle = snapshot.currentItem.speakerName ?? null;
  } else if (snapshot.phase === "Paused" && snapshot.currentItem) {
    leading = "Paused"; title = snapshot.currentItem.title; subtitle = snapshot.currentItem.speakerName ?? null;
  } else if (snapshot.phase === "PreRoll" && snapshot.currentItem) {
    leading = "Starting"; title = snapshot.currentItem.title; subtitle = snapshot.currentItem.speakerName ?? null;
  } else if (snapshot.nextItem) {
    leading = "Next";
    title = snapshot.nextItem.title;
    subtitle = relativeStartHint(snapshot.nextItem.scheduledStartUtc);
  } else {
    leading = "No upcoming items"; title = "Nothing scheduled"; subtitle = null;
  }

  return (
    <div className="flex items-center gap-4 rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
      <Play className="size-5 text-zinc-500" />
      <div className="flex-1 min-w-0">
        <div className="text-xs uppercase tracking-widest text-zinc-500">{leading}</div>
        <div className="truncate text-base font-medium">{title}</div>
        {subtitle && <div className="text-sm text-zinc-400">{subtitle}</div>}
      </div>
    </div>
  );
}
