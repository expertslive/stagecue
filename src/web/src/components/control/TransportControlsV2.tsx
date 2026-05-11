import type { Snapshot } from "@/api/types";
import type { TimerHub } from "@/hub/timerHub";
import { Play, Pause, Square, RotateCcw, SkipForward, MoreHorizontal } from "lucide-react";
import { useState } from "react";
import { humaniseHubError } from "@/lib/hubErrors";
import Button from "@/components/ui/Button";

interface Props {
  hub: TimerHub | null;
  snapshot: Snapshot;
  onError?: (e: string) => void;
}

export default function TransportControlsV2({ hub, snapshot, onError }: Props) {
  const [overflowOpen, setOverflowOpen] = useState(false);
  if (!hub) return null;
  const v = snapshot.version;
  const phase = snapshot.phase;
  const handle = (p: Promise<unknown>) => p.catch((e) => onError?.(humaniseHubError(e)));

  const canSkip = (phase === "Running" || phase === "Paused") && snapshot.currentItem !== null;
  const canReset = phase !== "Idle" || snapshot.currentItem !== null || snapshot.currentRunId !== null;

  // Determine the single dominant action for this state.
  let dominant: { label: string; onClick: () => void } | null = null;
  if (phase === "Idle" && snapshot.currentItem) {
    dominant = {
      label: `Start: ${snapshot.currentItem.title}`,
      onClick: () => handle(hub.startItem(snapshot.roomId, snapshot.currentItem!.id, v)),
    };
  } else if (phase === "Idle" && !snapshot.currentItem) {
    dominant = {
      label: "Start next item",
      onClick: () => handle(hub.startAuto(snapshot.roomId, v)),
    };
  } else if (phase === "Running") {
    dominant = {
      label: "Pause",
      onClick: () => handle(hub.pause(snapshot.roomId, v)),
    };
  } else if (phase === "Paused") {
    dominant = {
      label: "Resume",
      onClick: () => handle(hub.resume(snapshot.roomId, v)),
    };
  }

  const showStop = phase === "Running" || phase === "Paused";

  return (
    <div className="flex flex-wrap items-center gap-3">
      {dominant && (
        <Button size="lg" onClick={dominant.onClick} leadingIcon={phase === "Running" ? <Pause className="size-5" /> : <Play className="size-5" />}>
          {dominant.label}
        </Button>
      )}
      {showStop && (
        <Button size="md" variant="secondary" onClick={() => handle(hub.stopRoom(snapshot.roomId, v))} leadingIcon={<Square className="size-4" />}>
          Stop
        </Button>
      )}

      <div className="relative">
        <Button
          size="md" variant="ghost" onClick={() => setOverflowOpen((s) => !s)}
          leadingIcon={<MoreHorizontal className="size-4" />}
        >
          More
        </Button>
        {overflowOpen && (
          <div className="absolute right-0 top-full z-30 mt-1 min-w-[180px] rounded-md border border-zinc-800 bg-zinc-900 py-1 shadow-lg">
            <OverflowItem disabled={!canSkip} onClick={() => { handle(hub.skipNext(snapshot.roomId, v)); setOverflowOpen(false); }} icon={<SkipForward className="size-4" />}>Skip to next</OverflowItem>
            <OverflowItem disabled={!canReset} onClick={() => { handle(hub.reset(snapshot.roomId, v)); setOverflowOpen(false); }} icon={<RotateCcw className="size-4" />}>Reset room</OverflowItem>
          </div>
        )}
      </div>
    </div>
  );
}

function OverflowItem({ icon, children, onClick, disabled }: { icon: React.ReactNode; children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick} disabled={disabled}
      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {icon}{children}
    </button>
  );
}
