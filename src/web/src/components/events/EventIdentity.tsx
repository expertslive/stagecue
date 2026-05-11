import { useEffect, useState } from "react";
import type { EventDto, Snapshot } from "@/api/types";

interface Props {
  event: EventDto;
  /** Map of roomId → latest snapshot. Used to derive "live now / X rooms running". */
  snapshots: Record<string, Snapshot>;
  /** Total number of rooms — for the rooms-running denominator. */
  roomCount: number;
}

export default function EventIdentity({ event, snapshots, roomCount }: Props) {
  // Tick once a minute so the relative time / status pill stays current.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const status = deriveStatus(event, snapshots, roomCount);

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-100 truncate" title={event.name}>
          {event.name}
        </h1>
        <p className="mt-1 text-sm text-zinc-400">
          {formatEventWhen(event)}
        </p>
      </div>
      <StatusPill status={status} />
    </div>
  );
}

interface StatusInfo {
  kind: "before" | "live-running" | "live-idle" | "after" | "today";
  label: string;
}

function StatusPill({ status }: { status: StatusInfo }) {
  const tone =
    status.kind === "live-running" ? { dot: "bg-emerald-500", text: "text-emerald-400", bg: "bg-emerald-500/10", ring: "ring-emerald-500/20" }
    : status.kind === "live-idle" ? { dot: "bg-zinc-400", text: "text-zinc-300", bg: "bg-white/5", ring: "ring-white/10" }
    : status.kind === "before" ? { dot: "bg-[var(--cta)]", text: "text-[color:var(--cta)]", bg: "bg-[var(--cta)]/10", ring: "ring-[var(--cta)]/20" }
    : status.kind === "after" ? { dot: "bg-zinc-600", text: "text-zinc-500", bg: "bg-white/5", ring: "ring-white/10" }
    : { dot: "bg-zinc-400", text: "text-zinc-300", bg: "bg-white/5", ring: "ring-white/10" };

  return (
    <span className={`inline-flex items-center gap-2 self-start rounded-full px-3 py-1.5 text-sm font-medium ring-1 ${tone.bg} ${tone.ring} ${tone.text}`}>
      <span aria-hidden="true" className={`size-1.5 rounded-full ${tone.dot} ${status.kind === "live-running" ? "animate-pulse" : ""}`} />
      {status.label}
    </span>
  );
}

function deriveStatus(event: EventDto, snapshots: Record<string, Snapshot>, _roomCount: number): StatusInfo {
  const now = Date.now();
  const start = new Date(event.startsAtUtc).getTime();
  const end = new Date(event.endsAtUtc).getTime();

  // Count rooms currently in a live phase.
  const runningRooms = Object.values(snapshots).filter((s) =>
    s.phase === "Running" || s.phase === "PreRoll" || s.phase === "Paused",
  ).length;

  if (now < start) {
    return { kind: "before", label: `Starts ${relativeFuture(start - now)}` };
  }
  if (now >= end) {
    return { kind: "after", label: `Ended ${relativePast(now - end)}` };
  }
  if (runningRooms > 0) {
    const label = runningRooms === 1 ? "Live · 1 room running" : `Live · ${runningRooms} rooms running`;
    return { kind: "live-running", label };
  }
  return { kind: "live-idle", label: "In progress · all rooms idle" };
}

function formatEventWhen(event: EventDto): string {
  const start = new Date(event.startsAtUtc);
  const end = new Date(event.endsAtUtc);
  const sameDay = start.toDateString() === end.toDateString();
  const dateOpts: Intl.DateTimeFormatOptions = { weekday: "long", month: "long", day: "numeric" };
  const timeOpts: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" };
  const tz = event.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (sameDay) {
    return `${start.toLocaleDateString([], dateOpts)} · ${start.toLocaleTimeString([], timeOpts)}–${end.toLocaleTimeString([], timeOpts)} · ${tz}`;
  }
  return `${start.toLocaleDateString([], dateOpts)} → ${end.toLocaleDateString([], dateOpts)} · ${tz}`;
}

function relativeFuture(ms: number): string {
  const m = Math.round(ms / 60_000);
  if (m < 1) return "any moment";
  if (m < 60) return `in ${m} min`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h < 24) return rem === 0 ? `in ${h}h` : `in ${h}h ${rem}m`;
  const d = Math.round(h / 24);
  return d === 1 ? "tomorrow" : `in ${d} days`;
}

function relativePast(ms: number): string {
  const m = Math.round(ms / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "yesterday" : `${d} days ago`;
}
