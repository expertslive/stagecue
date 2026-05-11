import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { MoreHorizontal, Play, Pause, Hourglass } from "lucide-react";
import type { RoomDto, Snapshot } from "@/api/types";
import { activeCountdownColor, computeRemaining } from "@/lib/countdownState";
import { formatRemaining } from "@/lib/time";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";

interface Props {
  room: RoomDto;
  snapshot: Snapshot | undefined;
  skewMs: number;
  onEdit: (room: RoomDto) => void;
  onResetCode: (room: RoomDto) => void;
  onDelete: (room: RoomDto) => void;
}

/**
 * Live status tile for a room on the event dashboard. Subscribes (via the parent)
 * to the room's snapshot and renders phase + current/next + countdown, with the
 * Control button as the dominant action and a ⋯ menu for everything else.
 */
export default function RoomTile({ room, snapshot, skewMs, onEdit, onResetCode, onDelete }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [, setTick] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  const formatted = room.accessCode.length === 8
    ? `${room.accessCode.slice(0, 4)}-${room.accessCode.slice(4)}`
    : room.accessCode;

  const status = describeStatus(snapshot, skewMs);
  const ringClass =
    status.kind === "running" ? "ring-1 ring-emerald-500/30 shadow-[0_0_0_1px_rgba(16,185,129,0.05)_inset]"
    : status.kind === "paused" ? "ring-1 ring-amber-500/30"
    : status.kind === "preroll" ? "ring-1 ring-[var(--cta)]/30"
    : "";

  return (
    <Card density="none" className={`relative overflow-hidden p-5 space-y-4 ${ringClass}`}>
      {/* Subtle halo when running, picking up the active threshold color. */}
      {status.kind === "running" && status.haloColor && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background: `radial-gradient(80% 60% at 50% 0%, color-mix(in srgb, ${status.haloColor} 14%, transparent) 0%, transparent 70%)`,
          }}
        />
      )}

      <header className="relative flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <StatusChip status={status} />
            <h3 className="text-lg font-semibold tracking-tight text-zinc-100 truncate" title={room.name}>
              {room.name}
            </h3>
          </div>
        </div>
        <div className="relative shrink-0" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            className="rounded-md p-1.5 text-zinc-400 hover:bg-white/5 hover:text-zinc-100"
            aria-label={`More actions for ${room.name}`}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <MoreHorizontal className="size-4" />
          </button>
          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-full z-30 mt-1 min-w-[220px] rounded-xl border border-white/10 bg-zinc-900/95 py-1 shadow-2xl backdrop-blur-md text-sm"
            >
              <MenuLink to={`/rooms/${room.id}/schedule`} onClick={() => setMenuOpen(false)}>Schedule</MenuLink>
              <MenuLink to={`/r/${formatted}/speaker`} external onClick={() => setMenuOpen(false)}>Open speaker view</MenuLink>
              <MenuLink to={`/r/${formatted}/door`} external onClick={() => setMenuOpen(false)}>Open door view</MenuLink>
              <Divider />
              <MenuButton onClick={() => { setMenuOpen(false); onEdit(room); }}>Edit room…</MenuButton>
              <MenuButton onClick={() => { setMenuOpen(false); onResetCode(room); }}>Reset access code…</MenuButton>
              <Divider />
              <MenuButton onClick={() => { setMenuOpen(false); onDelete(room); }} danger>Delete room…</MenuButton>
            </div>
          )}
        </div>
      </header>

      {/* Live body */}
      <div className="relative space-y-1.5 min-h-[88px]">
        {status.kind === "running" || status.kind === "paused" || status.kind === "preroll" ? (
          <>
            <div className="text-base font-medium text-zinc-100 truncate" title={status.title ?? ""}>
              {status.title || "Untitled session"}
            </div>
            {status.speaker && (
              <div className="text-sm text-zinc-400 truncate">{status.speaker}</div>
            )}
            <div
              className="pt-1 font-mono text-3xl font-semibold tabular-nums leading-none"
              style={{ color: status.haloColor ?? "var(--text-primary)" }}
            >
              {status.timer}
            </div>
          </>
        ) : status.kind === "idle-upcoming" ? (
          <>
            <div className="text-sm text-zinc-500">Up next at <span className="font-medium text-zinc-300">{status.startsAt}</span></div>
            <div className="text-base font-medium text-zinc-200 truncate" title={status.title ?? ""}>{status.title}</div>
            <div className="text-sm text-zinc-500">{status.untilStart}</div>
          </>
        ) : (
          <>
            <div className="text-base font-medium text-zinc-400">No sessions scheduled</div>
            <div className="text-sm text-zinc-500">Add items in the schedule editor to get started.</div>
          </>
        )}
      </div>

      <footer className="relative flex items-center justify-between gap-3 pt-1">
        <code className="font-mono text-xs tracking-wider text-zinc-500">{formatted}</code>
        <Link to={`/rooms/${room.id}`}>
          <Button size="sm">Control →</Button>
        </Link>
      </footer>
    </Card>
  );
}

/* -------------------- chip / menu helpers -------------------- */

type DerivedStatus =
  | { kind: "running"; title: string | null; speaker: string | null; timer: string; haloColor: string }
  | { kind: "paused"; title: string | null; speaker: string | null; timer: string; haloColor: string }
  | { kind: "preroll"; title: string | null; speaker: string | null; timer: string; haloColor: string }
  | { kind: "idle-upcoming"; title: string; startsAt: string; untilStart: string }
  | { kind: "idle-empty" }
  | { kind: "ended" };

function describeStatus(snapshot: Snapshot | undefined, skewMs: number): DerivedStatus {
  if (!snapshot) return { kind: "idle-empty" };
  const halo = activeCountdownColor(snapshot, skewMs);

  if (snapshot.phase === "Running" && snapshot.currentItem) {
    const remaining = computeRemaining(snapshot, skewMs);
    return {
      kind: "running",
      title: snapshot.currentItem.title,
      speaker: snapshot.currentItem.speakerName ?? null,
      timer: remaining > 0 ? formatRemaining(remaining) : `+${formatRemaining(-remaining)}`,
      haloColor: halo,
    };
  }
  if (snapshot.phase === "Paused" && snapshot.currentItem) {
    const remaining = computeRemaining(snapshot, skewMs);
    return {
      kind: "paused",
      title: snapshot.currentItem.title,
      speaker: snapshot.currentItem.speakerName ?? null,
      timer: formatRemaining(Math.max(0, remaining)),
      haloColor: halo,
    };
  }
  if (snapshot.phase === "PreRoll" && snapshot.currentItem && snapshot.preRollEndsAtUtc) {
    const ms = new Date(snapshot.preRollEndsAtUtc).getTime() - (Date.now() + skewMs);
    return {
      kind: "preroll",
      title: snapshot.currentItem.title,
      speaker: snapshot.currentItem.speakerName ?? null,
      timer: ms > 0 ? formatRemaining(ms) : "0:00",
      haloColor: halo,
    };
  }
  if (snapshot.nextItem) {
    const startMs = new Date(snapshot.nextItem.scheduledStartUtc).getTime();
    return {
      kind: "idle-upcoming",
      title: snapshot.nextItem.title,
      startsAt: new Date(startMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      untilStart: relativeUntil(startMs - (Date.now() + skewMs)),
    };
  }
  if (snapshot.phase === "Ended") return { kind: "ended" };
  return { kind: "idle-empty" };
}

function StatusChip({ status }: { status: DerivedStatus }) {
  const map: Record<DerivedStatus["kind"], { icon: React.ReactNode; label: string; classes: string }> = {
    running: { icon: <Play className="size-3 fill-current" />, label: "Live", classes: "bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30" },
    paused: { icon: <Pause className="size-3 fill-current" />, label: "Paused", classes: "bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30" },
    preroll: { icon: <Hourglass className="size-3" />, label: "Pre-roll", classes: "bg-[var(--cta)]/15 text-[color:var(--cta)] ring-1 ring-[var(--cta)]/30" },
    "idle-upcoming": { icon: null, label: "Up next", classes: "bg-white/5 text-zinc-300 ring-1 ring-white/10" },
    "idle-empty": { icon: null, label: "Idle", classes: "bg-white/5 text-zinc-400 ring-1 ring-white/10" },
    ended: { icon: null, label: "Ended", classes: "bg-white/5 text-zinc-500 ring-1 ring-white/10" },
  };
  const m = map[status.kind];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${m.classes}`}>
      {m.icon}
      {m.label}
    </span>
  );
}

function MenuLink({ to, external, onClick, children }: { to: string; external?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener" : undefined}
      onClick={onClick}
      className="block px-3 py-2 text-zinc-200 hover:bg-white/5"
    >
      {children}
    </Link>
  );
}

function MenuButton({ onClick, danger, children }: { onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`block w-full px-3 py-2 text-left ${danger ? "text-red-400 hover:bg-red-500/10" : "text-zinc-200 hover:bg-white/5"}`}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div aria-hidden="true" className="my-1 border-t border-white/5" />;
}

function relativeUntil(ms: number): string {
  if (ms <= 0) return "starting now";
  const totalMin = Math.round(ms / 60_000);
  if (totalMin < 1) return "starting now";
  if (totalMin < 60) return `in ${totalMin} min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m === 0 ? `in ${h}h` : `in ${h}h ${m}m`;
}
