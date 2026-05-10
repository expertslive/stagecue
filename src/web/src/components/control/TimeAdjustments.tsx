import type { Snapshot } from "@/api/types";
import type { TimerHub } from "@/hub/timerHub";
import { useState } from "react";

interface Props { hub: TimerHub | null; snapshot: Snapshot; onError?: (e: string) => void }

const presets = [
  { label: "−5m", deltaSec: -300 },
  { label: "−1m", deltaSec: -60 },
  { label: "−30s", deltaSec: -30 },
  { label: "+30s", deltaSec: 30 },
  { label: "+1m", deltaSec: 60 },
  { label: "+5m", deltaSec: 300 },
];

export default function TimeAdjustments({ hub, snapshot, onError }: Props) {
  const [exact, setExact] = useState("");
  if (!hub) return null;
  const v = snapshot.version;
  const handle = (p: Promise<unknown>) => p.catch((e) => onError?.(String(e)));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {presets.map((p) => (
          <button key={p.label}
            onClick={() => handle(hub.adjustTime(snapshot.roomId, p.deltaSec, v))}
            className="px-3 py-2 rounded bg-zinc-800 hover:bg-zinc-700 text-sm font-mono">
            {p.label}
          </button>
        ))}
      </div>
      <div className="flex gap-2 items-center">
        <input
          type="text" placeholder="MM:SS" value={exact} onChange={(e) => setExact(e.target.value)}
          className="px-3 py-2 rounded bg-zinc-900 border border-zinc-800 w-28 text-center font-mono" />
        <button
          onClick={() => {
            const sec = parseMmss(exact);
            if (sec == null) { onError?.("Invalid format. Use MM:SS"); return; }
            handle(hub.setExactRemaining(snapshot.roomId, sec, v));
          }}
          className="px-3 py-2 rounded bg-blue-600 hover:bg-blue-500 text-sm">
          Set remaining
        </button>
      </div>
    </div>
  );
}

function parseMmss(s: string): number | null {
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return parseInt(m[1]) * 60 + parseInt(m[2]);
}
