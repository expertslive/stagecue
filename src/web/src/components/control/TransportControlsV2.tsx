import type { Snapshot } from "@/api/types";
import type { TimerHub } from "@/hub/timerHub";
import { Play, Pause, Square, RotateCcw, SkipForward, MoreHorizontal } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { humaniseHubError } from "@/lib/hubErrors";
import Button from "@/components/ui/Button";
import HoldToConfirm from "@/components/ui/HoldToConfirm";

interface Props {
  hub: TimerHub | null;
  snapshot: Snapshot;
  /** False when the hub is offline/reconnecting. Disables destructive + create-style actions. */
  online: boolean;
  /** Offline-aware Pause; safe to call while disconnected (queues + optimistic). */
  onPause: () => void;
  /** Offline-aware Resume. */
  onResume: () => void;
  onError?: (e: string) => void;
}

export default function TransportControlsV2({ hub, snapshot, online, onPause, onResume, onError }: Props) {
  const [overflowOpen, setOverflowOpen] = useState(false);
  const overflowRef = useRef<HTMLDivElement>(null);

  // Click-outside dismisses the More menu.
  useEffect(() => {
    if (!overflowOpen) return;
    const handler = (e: MouseEvent) => {
      if (overflowRef.current && !overflowRef.current.contains(e.target as Node)) {
        setOverflowOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [overflowOpen]);

  if (!hub) return null;
  const v = snapshot.version;
  const phase = snapshot.phase;
  const handle = (p: Promise<unknown>) => p.catch((e) => onError?.(humaniseHubError(e)));

  const canSkip = online && (phase === "Running" || phase === "Paused") && snapshot.currentItem !== null;
  const canReset = online && (phase !== "Idle" || snapshot.currentItem !== null || snapshot.currentRunId !== null);

  // Pause/Resume route through onPause/onResume so they queue when offline.
  // Start (Idle phase) needs the server (it allocates currentRunId), so it's disabled offline.
  let dominant: { label: string; onClick: () => void; disabled?: boolean } | null = null;
  if (phase === "Idle" && snapshot.currentItem) {
    dominant = {
      label: `Start: ${snapshot.currentItem.title}`,
      onClick: () => handle(hub.startItem(snapshot.roomId, snapshot.currentItem!.id, v)),
      disabled: !online,
    };
  } else if (phase === "Idle" && !snapshot.currentItem) {
    dominant = {
      label: "Start next item",
      onClick: () => handle(hub.startAuto(snapshot.roomId, v)),
      disabled: !online,
    };
  } else if (phase === "Running") {
    dominant = {
      label: "Pause",
      onClick: onPause,
    };
  } else if (phase === "Paused") {
    dominant = {
      label: "Resume",
      onClick: onResume,
    };
  }

  // Stop requires the server (state transition + audit). Disabled offline.
  const showStop = phase === "Running" || phase === "Paused";
  const offlineTitle = online ? undefined : "Requires connection";

  return (
    <div className="flex items-center gap-3">
      {/* Dominant action — left edge. */}
      {dominant && (
        <Button
          size="lg"
          onClick={dominant.onClick}
          disabled={dominant.disabled}
          title={dominant.disabled ? offlineTitle : undefined}
          leadingIcon={phase === "Running" ? <Pause className="size-5" /> : <Play className="size-5" />}
          className="truncate"
        >
          <span className="truncate">{dominant.label}</span>
        </Button>
      )}

      {/* More menu — middle. */}
      <div className="relative" ref={overflowRef}>
        <Button
          size="md"
          variant="ghost"
          onClick={() => setOverflowOpen((s) => !s)}
          leadingIcon={<MoreHorizontal className="size-4" />}
          aria-haspopup="menu"
          aria-expanded={overflowOpen}
        >
          More
        </Button>
        {overflowOpen && (
          <div
            role="menu"
            className="absolute left-0 top-full z-30 mt-1 min-w-[240px] rounded-xl border border-white/10 bg-zinc-900/95 py-1 shadow-2xl backdrop-blur-md"
          >
            <HoldToConfirm
              asMenuRow
              variant="secondary"
              disabled={!canSkip}
              onConfirm={() => { handle(hub.skipNext(snapshot.roomId, v)); setOverflowOpen(false); }}
              leadingIcon={<SkipForward className="size-4" />}
              holdingLabel="Hold to skip…"
            >
              Skip to next
            </HoldToConfirm>
            <HoldToConfirm
              asMenuRow
              variant="danger"
              disabled={!canReset}
              onConfirm={() => { handle(hub.reset(snapshot.roomId, v)); setOverflowOpen(false); }}
              leadingIcon={<RotateCcw className="size-4" />}
              holdingLabel="Hold to clear session…"
            >
              Clear current session
            </HoldToConfirm>
          </div>
        )}
      </div>

      {/* Stop — pinned to the right edge, maximally separated from the dominant action.
          Stop is one-click because it's the normal end-of-session action (speaker finishes
          → press Stop). Skip and Reset stay hold-to-confirm in the More menu since those
          two are the genuinely destructive actions. */}
      {showStop && (
        <Button
          size="md"
          variant="secondary"
          onClick={() => handle(hub.stopRoom(snapshot.roomId, v))}
          disabled={!online}
          title={!online ? offlineTitle : undefined}
          leadingIcon={<Square className="size-4" />}
          className="ml-auto"
        >
          Stop
        </Button>
      )}
    </div>
  );
}
