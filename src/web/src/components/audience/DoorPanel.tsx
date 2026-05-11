import type { Snapshot } from "@/api/types";
import { formatRemaining } from "@/lib/time";
import { useEffect, useState } from "react";

interface Props { snapshot: Snapshot; skewMs: number; eventName: string; roomName: string }

export default function DoorPanel({ snapshot, skewMs, eventName, roomName }: Props) {
  const [, setTick] = useState(0);
  useEffect(() => { const id = setInterval(() => setTick((n) => n + 1), 500); return () => clearInterval(id); }, []);

  const status = describeStatus(snapshot, skewMs);

  return (
    <div className="flex flex-col h-full p-10">
      <div className="text-sm uppercase tracking-widest text-zinc-500">{eventName}</div>
      <div className="text-3xl font-semibold mt-2">{roomName}</div>

      <div className="flex-1 flex flex-col justify-center">
        <Section label="Now playing">
          {snapshot.currentItem ? (
            <>
              <div className="text-2xl font-medium">{snapshot.currentItem.title}</div>
              {snapshot.currentItem.speakerName && <div className="text-zinc-400">{snapshot.currentItem.speakerName}</div>}
              <div className="text-zinc-500 mt-2 text-sm">{status}</div>
            </>
          ) : (
            <div className="text-zinc-400">{status}</div>
          )}
        </Section>

        <Section label="Up next">
          {snapshot.nextItem ? (
            <>
              <div className="text-lg">{snapshot.nextItem.title}</div>
              <div className="text-zinc-500 text-sm">{new Date(snapshot.nextItem.scheduledStartUtc).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
            </>
          ) : <div className="text-zinc-500">No upcoming sessions.</div>}
        </Section>
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <div className="text-xs uppercase tracking-widest text-zinc-500 mb-2">{label}</div>
      {children}
    </div>
  );
}

function describeStatus(s: Snapshot, skewMs: number): string {
  if (s.phase === "Idle") return "Starting soon";
  if (s.phase === "PreRoll" && s.preRollEndsAtUtc) {
    const ms = new Date(s.preRollEndsAtUtc).getTime() - (Date.now() + skewMs);
    return `Starts in ${formatRemaining(ms)}`;
  }
  if (s.phase === "Running" && s.startedAtUtc && s.currentItem) {
    const elapsed = (Date.now() + skewMs) - new Date(s.startedAtUtc).getTime() - s.pausedAccumSec * 1000;
    const remaining = (s.currentItem.durationSec + s.adjustmentSec) * 1000 - elapsed;
    if (remaining > 0) return `${formatRemaining(remaining)} remaining`;
    return `Running over by ${formatRemaining(remaining)}`;
  }
  if (s.phase === "Paused") return "Paused";
  if (s.phase === "Ended") return "Just finished";
  return "";
}
