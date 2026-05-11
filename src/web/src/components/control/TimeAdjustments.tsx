import type { Snapshot } from "@/api/types";
import type { TimerHub } from "@/hub/timerHub";
import { useState } from "react";
import { humaniseHubError } from "@/lib/hubErrors";
import Button from "@/components/ui/Button";

interface Props { hub: TimerHub | null; snapshot: Snapshot; onError?: (e: string) => void }

const subtractPresets = [
  { label: "−5m", deltaSec: -300 },
  { label: "−1m", deltaSec: -60 },
  { label: "−30s", deltaSec: -30 },
];
const addPresets = [
  { label: "+30s", deltaSec: 30 },
  { label: "+1m", deltaSec: 60 },
  { label: "+5m", deltaSec: 300 },
];

export default function TimeAdjustments({ hub, snapshot, onError }: Props) {
  const [exact, setExact] = useState("");
  if (!hub) return null;
  const v = snapshot.version;
  // Server's TimerStateMachine only accepts AdjustTime / SetExactRemaining when a session
  // is actively running or paused — disable controls otherwise so we don't surface an
  // "InvalidPhase" hub error when there's nothing to adjust.
  const adjustable = snapshot.phase === "Running" || snapshot.phase === "Paused";
  const handle = (p: Promise<unknown>) => p.catch((e) => onError?.(humaniseHubError(e)));

  return (
    <div className={`space-y-3 ${adjustable ? "" : "opacity-50"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1.5">
          {subtractPresets.map((p) => (
            <Button
              key={p.label}
              variant="secondary"
              size="md"
              disabled={!adjustable}
              onClick={() => handle(hub.adjustTime(snapshot.roomId, p.deltaSec, v))}
              className="font-mono"
            >
              {p.label}
            </Button>
          ))}
        </div>
        <span aria-hidden="true" className="mx-1 h-6 w-px bg-zinc-800" />
        <div className="flex gap-1.5">
          {addPresets.map((p) => (
            <Button
              key={p.label}
              variant="secondary"
              size="md"
              disabled={!adjustable}
              onClick={() => handle(hub.adjustTime(snapshot.roomId, p.deltaSec, v))}
              className="font-mono"
            >
              {p.label}
            </Button>
          ))}
        </div>
      </div>
      <div className="flex gap-2 items-center">
        <input
          type="text" placeholder="MM:SS" value={exact} onChange={(e) => setExact(e.target.value)}
          disabled={!adjustable}
          className="px-3 py-2 rounded bg-zinc-950/60 border border-white/10 w-28 text-center font-mono disabled:cursor-not-allowed" />
        <Button
          disabled={!adjustable}
          onClick={() => {
            const sec = parseMmss(exact);
            if (sec == null) { onError?.("Use the MM:SS format — like 12:30."); return; }
            handle(hub.setExactRemaining(snapshot.roomId, sec, v));
          }}
        >
          Set remaining
        </Button>
      </div>
      {!adjustable && (
        <p className="text-xs text-zinc-500">Start a session to adjust the remaining time.</p>
      )}
    </div>
  );
}

function parseMmss(s: string): number | null {
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return parseInt(m[1]) * 60 + parseInt(m[2]);
}
