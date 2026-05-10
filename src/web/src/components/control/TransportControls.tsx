import type { Snapshot } from "@/api/types";
import type { TimerHub } from "@/hub/timerHub";
import { Play, Pause, Square, RotateCcw, SkipForward } from "lucide-react";

interface Props {
  hub: TimerHub | null;
  snapshot: Snapshot;
  onError?: (e: string) => void;
}

export default function TransportControls({ hub, snapshot, onError }: Props) {
  if (!hub) return null;
  const v = snapshot.version;
  const phase = snapshot.phase;
  const handle = (p: Promise<unknown>) => p.catch((e) => onError?.(String(e)));

  return (
    <div className="flex flex-wrap gap-2">
      {phase === "Idle" && snapshot.currentItem && (
        <Button onClick={() => handle(hub.startItem(snapshot.roomId, snapshot.currentItem!.id, v))}>
          <Play className="size-4" /> Start
        </Button>
      )}
      {phase === "Idle" && snapshot.currentItem === null && (
        <Button onClick={() => handle(hub.startAuto(snapshot.roomId, v))}><Play className="size-4" /> Start (auto)</Button>
      )}
      {phase === "Running" && <Button onClick={() => handle(hub.pause(snapshot.roomId, v))}><Pause className="size-4" /> Pause</Button>}
      {phase === "Paused" && <Button onClick={() => handle(hub.resume(snapshot.roomId, v))}><Play className="size-4" /> Resume</Button>}
      {(phase === "Running" || phase === "Paused") && (
        <Button onClick={() => handle(hub.stopRoom(snapshot.roomId, v))} variant="danger"><Square className="size-4" /> Stop</Button>
      )}
      <Button onClick={() => handle(hub.reset(snapshot.roomId, v))} variant="ghost"><RotateCcw className="size-4" /> Reset</Button>
      <Button onClick={() => handle(hub.skipNext(snapshot.roomId, v))} variant="ghost"><SkipForward className="size-4" /> Skip</Button>
    </div>
  );
}

function Button({ children, onClick, variant = "primary" }: { children: React.ReactNode; onClick: () => void; variant?: "primary" | "danger" | "ghost" }) {
  const style =
    variant === "primary" ? "bg-blue-600 hover:bg-blue-500 text-white"
    : variant === "danger" ? "bg-red-600 hover:bg-red-500 text-white"
    : "bg-zinc-800 hover:bg-zinc-700 text-zinc-100";
  return (
    <button onClick={onClick} className={`flex items-center gap-2 px-3 py-2 rounded text-sm font-medium ${style}`}>
      {children}
    </button>
  );
}
