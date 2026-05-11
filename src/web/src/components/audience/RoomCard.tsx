import type { Snapshot } from "@/api/types";
import { formatRemaining } from "@/lib/time";
import { colorTokenForRemaining } from "@/lib/thresholds";

interface Props { roomName: string; snapshot: Snapshot | undefined; skewMs: number }

export default function RoomCard({ roomName, snapshot, skewMs }: Props) {
  if (!snapshot) {
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-5 space-y-2 transition-colors">
        <div className="text-sm uppercase tracking-widest text-zinc-500">{roomName}</div>
        <div className="text-zinc-500 italic">Waiting for first state…</div>
      </div>
    );
  }
  const remainingMs = computeRemaining(snapshot, skewMs);
  const color = snapshot.phase === "PreRoll"
    ? "var(--accent)"
    : snapshot.phase === "Running" || snapshot.phase === "Paused"
      ? colorTokenForRemaining(snapshot.currentItem?.thresholds ?? [], remainingMs)
      : "var(--text-muted)";

  const ringClass = snapshot.phase === "Running"
    ? "ring-1 ring-green-500/30"
    : snapshot.phase === "Paused"
      ? "ring-1 ring-yellow-500/20"
      : "";

  return (
    <div className={`rounded-lg border border-zinc-800 bg-zinc-900 p-5 space-y-2 transition-all duration-200 ${ringClass}`}>
      <div className="text-sm uppercase tracking-widest text-zinc-500">{roomName}</div>
      <div className="text-lg font-medium truncate" title={snapshot.currentItem?.title ?? ""}>
        {snapshot.currentItem?.title ?? "Idle"}
      </div>
      {snapshot.currentItem?.speakerName && <div className="text-sm text-zinc-500 truncate">{snapshot.currentItem.speakerName}</div>}
      <div className="text-3xl font-bold tabular-nums transition-colors duration-200" style={{ color }}>
        {snapshot.phase === "Idle" || snapshot.phase === "Ended" ? "—" : formatRemaining(remainingMs)}
      </div>
    </div>
  );
}

function computeRemaining(s: Snapshot, skewMs: number): number {
  const serverNow = Date.now() + skewMs;
  if (s.phase === "PreRoll" && s.preRollEndsAtUtc) return new Date(s.preRollEndsAtUtc).getTime() - serverNow;
  if (s.phase === "Running" && s.startedAtUtc && s.currentItem) {
    const elapsedMs = serverNow - new Date(s.startedAtUtc).getTime() - s.pausedAccumSec * 1000;
    return (s.currentItem.durationSec + s.adjustmentSec) * 1000 - elapsedMs;
  }
  if (s.phase === "Paused" && s.pauseRemainingMs != null) return s.pauseRemainingMs;
  return 0;
}
