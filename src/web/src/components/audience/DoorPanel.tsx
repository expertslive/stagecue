import type { Snapshot } from "@/api/types";
import { formatRemaining } from "@/lib/time";
import { useEffect, useState } from "react";
import type { DoorDisplayConfig } from "@/lib/doorDisplayConfig";

interface Props {
  snapshot: Snapshot;
  skewMs: number;
  eventName: string;
  roomName: string;
  config: DoorDisplayConfig;
}

export default function DoorPanel({ snapshot, skewMs, eventName, roomName, config }: Props) {
  const [, setTick] = useState(0);
  useEffect(() => { const id = setInterval(() => setTick((n) => n + 1), 500); return () => clearInterval(id); }, []);

  const status = describeStatus(snapshot, skewMs);
  const portrait = config.orientation === "portrait";

  // Portrait layout: more vertical padding, larger room headline, single-column flow.
  // Landscape layout: balanced top header + a centered body.
  const containerCls = portrait
    ? "flex flex-col h-full px-8 py-12 gap-6"
    : "flex flex-col h-full p-10";
  const eventNameCls = portrait
    ? "text-base uppercase tracking-widest text-zinc-500"
    : "text-sm uppercase tracking-widest text-zinc-500";
  const roomNameCls = portrait
    ? "text-5xl font-semibold tracking-tight mt-1"
    : "text-3xl font-semibold mt-2";
  const sectionGap = portrait ? "mb-10" : "mb-8";
  const titleCls = portrait ? "text-3xl font-medium" : "text-2xl font-medium";
  const speakerCls = portrait ? "text-xl text-zinc-400 mt-1" : "text-zinc-400";
  const nextTitleCls = portrait ? "text-2xl" : "text-lg";

  return (
    <div className={containerCls}>
      {(config.showEventName || config.showRoomName) && (
        <div>
          {config.showEventName && <div className={eventNameCls}>{eventName}</div>}
          {config.showRoomName && <div className={roomNameCls}>{roomName}</div>}
        </div>
      )}

      <div className="flex-1 flex flex-col justify-center">
        {config.showNowPlaying && (
          <div className={sectionGap}>
            <div className="text-xs uppercase tracking-widest text-zinc-500 mb-2">Now playing</div>
            {snapshot.currentItem ? (
              <>
                <div className={titleCls}>{snapshot.currentItem.title}</div>
                {config.showSpeakerName && snapshot.currentItem.speakerName && (
                  <div className={speakerCls}>{snapshot.currentItem.speakerName}</div>
                )}
                {config.showCountdown && <div className="text-zinc-500 mt-2 text-sm">{status}</div>}
              </>
            ) : (
              <div className="text-zinc-400">{config.showCountdown ? status : "—"}</div>
            )}
          </div>
        )}

        {config.showUpNext && (
          <div className={sectionGap}>
            <div className="text-xs uppercase tracking-widest text-zinc-500 mb-2">Up next</div>
            {snapshot.nextItem ? (
              <>
                <div className={nextTitleCls}>{snapshot.nextItem.title}</div>
                {config.showUpNextTime && (
                  <div className="text-zinc-500 text-sm">
                    {new Date(snapshot.nextItem.scheduledStartUtc).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </div>
                )}
              </>
            ) : <div className="text-zinc-500">No upcoming sessions.</div>}
          </div>
        )}
      </div>
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
