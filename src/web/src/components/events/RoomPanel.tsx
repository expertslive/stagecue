import { useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { X, ExternalLink, Calendar, Sliders, Monitor, ChevronRight, RotateCcw, Trash2, Play, AlertTriangle } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import type { RoomDto, Snapshot } from "@/api/types";
import { activeCountdownColor, computeRemaining } from "@/lib/countdownState";
import { formatRemaining } from "@/lib/time";
import Button from "@/components/ui/Button";

interface Props {
  open: boolean;
  room: RoomDto | null;
  snapshot: Snapshot | undefined;
  skewMs: number;
  onClose: () => void;
  onEdit: (room: RoomDto) => void;
  onConfigureDoor: (room: RoomDto) => void;
  onResetCode: (room: RoomDto) => void;
  onDelete: (room: RoomDto) => void;
}

/**
 * Right-anchored slide-in panel showing everything you can do with one room: live state,
 * audience displays (with inline QRs), operate, configure, danger. Replaces the cramped
 * 8-item ⋯ dropdown the room tile used to carry.
 */
export default function RoomPanel({ open, room, snapshot, skewMs, onClose, onEdit, onConfigureDoor, onResetCode, onDelete }: Props) {
  // Esc closes.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); onClose(); } };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const formattedCode = useMemo(() => {
    if (!room) return "";
    return room.accessCode.length === 8 ? `${room.accessCode.slice(0, 4)}-${room.accessCode.slice(4)}` : room.accessCode;
  }, [room]);

  if (!open || !room) return null;

  const speakerUrl = `${window.location.origin}/r/${formattedCode}/speaker`;
  const doorUrl = `${window.location.origin}/r/${formattedCode}/door`;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm drawer-backdrop-enter"
    >
      <aside
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`${room.name} — room actions`}
        className="drawer-panel-enter relative flex h-full w-full max-w-md flex-col overflow-hidden border-l border-white/10 bg-zinc-950/95 shadow-2xl backdrop-blur-xl"
      >
        {/* Header */}
        <header className="flex items-start justify-between gap-2 border-b border-white/5 px-6 py-5">
          <div className="min-w-0">
            <h2 className="truncate text-2xl font-semibold tracking-tight text-zinc-100" title={room.name}>{room.name}</h2>
            <code className="mt-1 block font-mono text-xs tracking-wider text-zinc-500">{formattedCode}</code>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1.5 text-zinc-400 hover:bg-white/5 hover:text-zinc-100"
          >
            <X className="size-5" />
          </button>
        </header>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto">
          <LiveStatus snapshot={snapshot} skewMs={skewMs} />

          <Section title="Audience displays">
            <DisplayRow
              url={speakerUrl}
              title="Speaker view"
              caption="The countdown the person on stage sees."
              external
            />
            <DisplayRow
              url={doorUrl}
              title="Door view"
              caption="The signage by the room door."
              external
              configureLabel="Configure layout"
              onConfigure={() => onConfigureDoor(room)}
            />
          </Section>

          <Section title="Operate">
            <NavRow to={`/rooms/${room.id}`} icon={<Play className="size-4" />}>
              Open control surface
            </NavRow>
            <NavRow to={`/rooms/${room.id}/show`} icon={<Monitor className="size-4" />}>
              Open show mode
            </NavRow>
            <NavRow to={`/rooms/${room.id}/schedule`} icon={<Calendar className="size-4" />}>
              Edit schedule
            </NavRow>
          </Section>

          <Section title="Configure">
            <ActionRow
              icon={<Sliders className="size-4" />}
              onClick={() => onEdit(room)}
            >
              Room settings (name, pre-roll, programme)
            </ActionRow>
            <ActionRow
              icon={<Monitor className="size-4" />}
              onClick={() => onConfigureDoor(room)}
            >
              Door display layout
            </ActionRow>
            <ActionRow
              icon={<RotateCcw className="size-4" />}
              onClick={() => onResetCode(room)}
            >
              Reset access code
            </ActionRow>
          </Section>

          <Section title="Danger zone" tone="danger">
            <ActionRow
              icon={<Trash2 className="size-4" />}
              onClick={() => onDelete(room)}
              danger
            >
              Delete room
            </ActionRow>
          </Section>
        </div>
      </aside>
    </div>
  );
}

/* -------------------- live status -------------------- */

function LiveStatus({ snapshot, skewMs }: { snapshot: Snapshot | undefined; skewMs: number }) {
  if (!snapshot) {
    return (
      <div className="px-6 py-4 text-sm text-zinc-500">
        Loading live state…
      </div>
    );
  }
  if (snapshot.phase === "Running" || snapshot.phase === "Paused") {
    const remaining = computeRemaining(snapshot, skewMs);
    const color = activeCountdownColor(snapshot, skewMs);
    return (
      <div className="px-6 py-4 border-b border-white/5">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-zinc-500">
          {snapshot.phase === "Paused" ? "Paused" : "Running"}
        </div>
        <div className="mt-1 text-base font-medium text-zinc-100 truncate" title={snapshot.currentItem?.title ?? ""}>
          {snapshot.currentItem?.title ?? "—"}
        </div>
        {snapshot.currentItem?.speakerName && (
          <div className="text-sm text-zinc-400 truncate">{snapshot.currentItem.speakerName}</div>
        )}
        <div className="mt-2 font-mono text-2xl font-semibold tabular-nums" style={{ color }}>
          {remaining > 0 ? formatRemaining(remaining) : `+${formatRemaining(-remaining)}`}
        </div>
      </div>
    );
  }
  if (snapshot.phase === "PreRoll" && snapshot.preRollEndsAtUtc) {
    const ms = new Date(snapshot.preRollEndsAtUtc).getTime() - (Date.now() + skewMs);
    return (
      <div className="px-6 py-4 border-b border-white/5">
        <div className="text-xs font-medium uppercase tracking-widest text-zinc-500">Starting</div>
        <div className="mt-1 text-base font-medium text-zinc-100">{snapshot.currentItem?.title ?? "—"}</div>
        <div className="mt-2 font-mono text-2xl font-semibold tabular-nums text-[color:var(--cta)]">
          {ms > 0 ? formatRemaining(ms) : "0:00"}
        </div>
      </div>
    );
  }
  if (snapshot.nextItem) {
    const startMs = new Date(snapshot.nextItem.scheduledStartUtc).getTime();
    const min = Math.round((startMs - (Date.now() + skewMs)) / 60_000);
    return (
      <div className="px-6 py-4 border-b border-white/5">
        <div className="text-xs font-medium uppercase tracking-widest text-zinc-500">Up next</div>
        <div className="mt-1 text-base font-medium text-zinc-100 truncate">{snapshot.nextItem.title}</div>
        <div className="text-sm text-zinc-500">
          {new Date(startMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          {min > 0 ? ` · in ${min} min` : min === 0 ? " · starting now" : ""}
        </div>
      </div>
    );
  }
  return (
    <div className="px-6 py-4 border-b border-white/5 text-sm text-zinc-500">
      No live activity in this room.
    </div>
  );
}

/* -------------------- section helpers -------------------- */

function Section({ title, tone, children }: { title: string; tone?: "danger"; children: React.ReactNode }) {
  return (
    <section className="px-6 py-5 border-b border-white/5 last:border-b-0">
      <h3 className={`mb-3 text-xs font-semibold uppercase tracking-widest ${tone === "danger" ? "text-red-400/80" : "text-zinc-500"}`}>{title}</h3>
      <div className="space-y-2">
        {children}
      </div>
    </section>
  );
}

interface DisplayRowProps {
  url: string;
  title: string;
  caption: string;
  external?: boolean;
  configureLabel?: string;
  onConfigure?: () => void;
}

function DisplayRow({ url, title, caption, external, configureLabel, onConfigure }: DisplayRowProps) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-white/5 bg-zinc-900/50 p-3">
      <div className="rounded-lg bg-white p-2 shrink-0">
        <QRCodeSVG value={url} size={64} bgColor="#ffffff" fgColor="#0a0a0a" level="M" />
      </div>
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="text-sm font-semibold text-zinc-100">{title}</div>
        <p className="text-xs text-zinc-500">{caption}</p>
        <div className="flex flex-wrap gap-1.5 pt-1">
          <a
            href={url}
            target={external ? "_blank" : undefined}
            rel={external ? "noopener" : undefined}
            className="inline-flex items-center gap-1.5 rounded-md bg-zinc-800 px-2.5 py-1 text-xs font-medium text-zinc-100 hover:bg-zinc-700"
          >
            <ExternalLink className="size-3" />
            Open
          </a>
          {configureLabel && onConfigure && (
            <Button size="sm" variant="ghost" onClick={onConfigure}>{configureLabel}</Button>
          )}
        </div>
      </div>
    </div>
  );
}

function NavRow({ to, icon, children }: { to: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-zinc-200 hover:bg-white/5"
    >
      <span className="text-zinc-500">{icon}</span>
      <span className="flex-1">{children}</span>
      <ChevronRight className="size-4 text-zinc-500" />
    </Link>
  );
}

function ActionRow({ icon, onClick, danger, children }: { icon: React.ReactNode; onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium ${
        danger ? "text-red-400 hover:bg-red-500/10" : "text-zinc-200 hover:bg-white/5"
      }`}
    >
      <span className={danger ? "text-red-500/80" : "text-zinc-500"}>{icon}</span>
      <span className="flex-1">{children}</span>
      {danger ? <AlertTriangle className="size-4 text-red-500/70" /> : <ChevronRight className="size-4 text-zinc-500" />}
    </button>
  );
}
