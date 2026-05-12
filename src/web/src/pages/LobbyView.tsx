import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { publicInfo, type LobbyRoom } from "@/api/publicInfo";
import { TimerHub, type ConnectionState } from "@/hub/timerHub";
import type { Snapshot } from "@/api/types";
import { measureSkew } from "@/lib/clockSkew";
import { useBranding } from "@/hooks/useBranding";
import ConnectingScreen from "@/components/audience/ConnectingScreen";
import OfflineBanner from "@/components/audience/OfflineBanner";

/**
 * Public lobby signage. State-driven layout: one hero zone reshapes around what's actually
 * happening (1 live → big card; 2+ live → grid; 0 live but upcoming → next-up hero; done → quiet card).
 *
 * Design philosophy: this screen tells the audience two things — what's running, and what's
 * next. No countdown digits (anxious, operator-grade information). Progress is a bar only.
 * Times are scheduled times — the audience navigates to moments, not to durations.
 */
export default function LobbyView() {
  const { accessCode } = useParams<{ accessCode: string }>();
  const normalised = (accessCode ?? "").replace("-", "").toUpperCase();
  const info = useQuery({ queryKey: ["lobbyInfo", accessCode], queryFn: () => publicInfo.lobby(accessCode!), enabled: !!accessCode });
  const { logoUrl } = useBranding(accessCode, "e");

  const [snapshots, setSnapshots] = useState<Record<string, Snapshot>>({});
  const [skewMs, setSkewMs] = useState(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>("disconnected");

  // 1Hz tick — drives the progress bar position and the wall clock.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!info.data || !accessCode) return;
    let cancelled = false;
    const hub = new TimerHub(normalised, "lobby");
    const roomIds = info.data.rooms.map((r) => r.id);

    const syncAllRooms = async () => {
      const results = await Promise.all(
        roomIds.map((id) => hub.resync(id).catch(() => null as Snapshot | null)),
      );
      if (cancelled) return;
      const merged: Record<string, Snapshot> = {};
      for (const snap of results) {
        if (snap) merged[snap.roomId] = snap;
      }
      if (Object.keys(merged).length > 0) {
        setSnapshots((prev) => ({ ...prev, ...merged }));
        const last = Object.values(merged).at(-1);
        if (last) setSkewMs(measureSkew(last.serverNowUtc));
      }
    };

    const off = hub.onSnapshot((snap) => {
      if (cancelled) return;
      setSnapshots((prev) => ({ ...prev, [snap.roomId]: snap }));
      setSkewMs(measureSkew(snap.serverNowUtc));
    });
    const offConn = hub.onConnectionChange((s) => {
      if (cancelled) return;
      setConnectionState(s);
      if (s === "connected") syncAllRooms();
    });

    const startWithRetry = async (): Promise<void> => {
      try {
        await hub.start();
      } catch (firstError) {
        if (cancelled) throw firstError;
        await new Promise((r) => setTimeout(r, 250));
        if (cancelled) throw firstError;
        await hub.start();
      }
    };

    startWithRetry()
      .then(async () => {
        if (cancelled) return;
        setReady(true);
        await syncAllRooms();
      })
      .catch((e) => { if (!cancelled) setError(e as Error); });
    return () => { cancelled = true; off(); offConn(); hub.stop().catch(() => {}); };
  }, [info.data, accessCode, normalised]);

  // Build the live + upcoming derived state. Recomputed each tick because progress, "live",
  // and "upcoming" all shift with time. Costs are tiny — handful of rooms, handful of items.
  const view = useMemo(() => {
    if (!info.data) return null;
    const adjustedNow = nowMs + skewMs;
    const live: LiveCard[] = [];
    const liveItemIds = new Set<string>();
    for (const room of info.data.rooms) {
      const snap = snapshots[room.id];
      const card = snap ? buildLiveCard(room, snap, adjustedNow) : null;
      if (card) {
        live.push(card);
        if (snap?.currentItem) liveItemIds.add(snap.currentItem.id);
      }
    }
    const upcoming = collectUpcoming(info.data.rooms, adjustedNow, liveItemIds);
    return { live, upcoming, adjustedNow };
  }, [info.data, snapshots, nowMs, skewMs]);

  // Wall clock + date label, both rendered in the event timezone — minutes only (no seconds;
  // a public screen shouldn't have a digit twitching every second).
  const headerStrings = useMemo(() => {
    if (!info.data || !view) return null;
    const tz = info.data.timeZone;
    const clock = new Intl.DateTimeFormat(undefined, {
      hour: "2-digit", minute: "2-digit", hour12: false, timeZone: tz,
    }).format(new Date(view.adjustedNow));
    const date = new Intl.DateTimeFormat(undefined, {
      weekday: "long", day: "numeric", month: "long", timeZone: tz,
    }).format(new Date(view.adjustedNow));
    return { clock, date };
  }, [info.data, view]);

  if (info.error) return <ConnectingScreen target="this event" error="URL not valid" />;
  if (!info.data) return <ConnectingScreen target="this event" />;
  if (!ready && Object.keys(snapshots).length === 0) {
    if (error) return <ConnectingScreen target={info.data.eventName ?? "this event"} error={error.message} />;
    return <ConnectingScreen target={info.data.eventName ?? "this event"} />;
  }
  if (!view || !headerStrings) return <ConnectingScreen target={info.data.eventName} />;

  const tz = info.data.timeZone;
  const totalSessionsToday = info.data.rooms.reduce((n, r) => n + r.scheduleItems.length, 0);

  return (
    <div className="h-full w-full overflow-hidden flex flex-col bg-[var(--bg)] relative">
      {/* Header — single hairline, event left, date+clock right */}
      <header className="shrink-0 flex items-center justify-between px-20 py-8 border-b border-white/[0.06]">
        <div className="flex items-center gap-5 min-w-0">
          {logoUrl && <img src={logoUrl} alt="" className="max-h-14 opacity-90" />}
          <h1 className="text-2xl font-medium tracking-[0.18em] uppercase text-zinc-300 truncate">{info.data.eventName}</h1>
        </div>
        <div className="text-right shrink-0">
          <div className="text-base tracking-wider text-zinc-500">{headerStrings.date}</div>
          <div className="mt-1 font-mono text-4xl font-medium tabular-nums text-zinc-100">{headerStrings.clock}</div>
        </div>
      </header>

      {/* Hero zone — adapts to state */}
      <main className="flex-1 min-h-0 flex items-center justify-center px-20 py-10">
        <HeroZone view={view} timezone={tz} eventName={info.data.eventName} totalSessions={totalSessionsToday} />
      </main>

      {/* Up Next list — quiet, chronological, never dominates */}
      {view.upcoming.length > 0 && (
        <footer className="shrink-0 border-t border-white/[0.06] px-20 py-8">
          <UpNextList items={view.upcoming} timezone={tz} />
        </footer>
      )}

      <OfflineBanner connectionState={connectionState} />
    </div>
  );
}

/* -------------------- types -------------------- */

interface LiveCard {
  roomId: string;
  roomName: string;
  title: string;
  speaker: string | null;
  startMs: number; // actual start (Running/Paused) or scheduled start (PreRoll)
  endMs: number;   // start + scheduled duration (incl. operator adjustment)
  progress: number; // 0..1, capped — never exceeds 1 even on overrun (host stops the session)
  phase: "Running" | "Paused" | "PreRoll";
}

interface UpcomingItem {
  id: string;
  roomName: string;
  title: string;
  speaker: string | null;
  startMs: number;
}

/* -------------------- derivation helpers -------------------- */

function buildLiveCard(room: LobbyRoom, snap: Snapshot, adjustedNow: number): LiveCard | null {
  if (!snap.currentItem) return null;
  const totalSec = snap.currentItem.durationSec + snap.adjustmentSec;
  const totalMs = totalSec * 1000;

  if (snap.phase === "Running" && snap.startedAtUtc) {
    const startMs = new Date(snap.startedAtUtc).getTime();
    const elapsed = adjustedNow - startMs - snap.pausedAccumSec * 1000;
    const progress = Math.max(0, Math.min(1, elapsed / totalMs));
    return {
      roomId: room.id,
      roomName: room.name,
      title: snap.currentItem.title,
      speaker: snap.currentItem.speakerName ?? null,
      startMs,
      endMs: startMs + totalMs,
      progress,
      phase: "Running",
    };
  }
  if (snap.phase === "Paused" && snap.startedAtUtc) {
    const startMs = new Date(snap.startedAtUtc).getTime();
    const remaining = snap.pauseRemainingMs ?? 0;
    const progress = Math.max(0, Math.min(1, (totalMs - remaining) / totalMs));
    return {
      roomId: room.id,
      roomName: room.name,
      title: snap.currentItem.title,
      speaker: snap.currentItem.speakerName ?? null,
      startMs,
      endMs: startMs + totalMs,
      progress,
      phase: "Paused",
    };
  }
  if (snap.phase === "PreRoll") {
    // Pre-roll: the session is "about to start". For the audience this still belongs in the
    // live hero (room is occupied right now). Anchor the times to the scheduled start.
    const startMs = snap.preRollEndsAtUtc ? new Date(snap.preRollEndsAtUtc).getTime() : adjustedNow;
    return {
      roomId: room.id,
      roomName: room.name,
      title: snap.currentItem.title,
      speaker: snap.currentItem.speakerName ?? null,
      startMs,
      endMs: startMs + totalMs,
      progress: 0,
      phase: "PreRoll",
    };
  }
  return null;
}

function collectUpcoming(rooms: LobbyRoom[], adjustedNow: number, liveItemIds: Set<string>): UpcomingItem[] {
  const out: UpcomingItem[] = [];
  for (const room of rooms) {
    for (const item of room.scheduleItems) {
      if (liveItemIds.has(item.id)) continue;
      const startMs = new Date(item.scheduledStartUtc).getTime();
      // Skip items whose scheduled start has already passed: between sessions there's
      // natural buffer time (laptop swaps, audience walking), so any past-scheduled item
      // that isn't actively live is presumed done and shouldn't appear as "Coming up".
      if (startMs < adjustedNow) continue;
      out.push({
        id: item.id,
        roomName: room.name,
        title: item.title,
        speaker: item.speakerName,
        startMs,
      });
    }
  }
  out.sort((a, b) => a.startMs - b.startMs);
  return out;
}

/* -------------------- hero zone -------------------- */

function HeroZone({ view, timezone, eventName, totalSessions }:
  { view: { live: LiveCard[]; upcoming: UpcomingItem[]; adjustedNow: number }; timezone: string; eventName: string; totalSessions: number }) {
  if (view.live.length === 1) {
    return <LiveHero card={view.live[0]} timezone={timezone} />;
  }
  if (view.live.length > 1) {
    return <LiveGrid cards={view.live} timezone={timezone} />;
  }
  if (view.upcoming.length > 0) {
    return <NextHero next={view.upcoming[0]} now={view.adjustedNow} timezone={timezone} />;
  }
  if (totalSessions === 0) {
    return <QuietHero title={eventName} body="No sessions on the programme yet." />;
  }
  return <QuietHero title={eventName} body="Thank you. The programme has ended." />;
}

function LiveHero({ card, timezone }: { card: LiveCard; timezone: string }) {
  return (
    <article className="w-full max-w-[1600px] flex flex-col gap-10">
      <RoomEyebrow roomName={card.roomName} phase={card.phase} />
      <header className="space-y-4">
        <h2 className="text-[clamp(64px,7vw,108px)] font-semibold leading-[1.05] tracking-tight text-zinc-50">
          {card.title}
        </h2>
        {card.speaker && (
          <p className="text-3xl text-zinc-400">{card.speaker}</p>
        )}
      </header>
      <ProgressBar progress={card.progress} startMs={card.startMs} endMs={card.endMs} timezone={timezone} />
    </article>
  );
}

function LiveGrid({ cards, timezone }: { cards: LiveCard[]; timezone: string }) {
  // Up to 3 prominent. Anything beyond gets a small "+N more live" hint — for very large
  // multi-track events we'd cycle, but that's not in v1.
  const visible = cards.slice(0, 3);
  const overflow = cards.length - visible.length;
  return (
    <div className="w-full max-w-[1800px]">
      <div className={`grid gap-8 ${visible.length === 1 ? "grid-cols-1" : visible.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
        {visible.map((card) => (
          <article key={card.roomId} className="flex flex-col gap-6 rounded-3xl bg-zinc-900/40 ring-1 ring-white/[0.06] p-10">
            <RoomEyebrow roomName={card.roomName} phase={card.phase} compact />
            <header className="space-y-2 min-h-[8rem]">
              <h2 className="text-[clamp(36px,3vw,52px)] font-semibold leading-tight tracking-tight text-zinc-50">
                {card.title}
              </h2>
              {card.speaker && (
                <p className="text-xl text-zinc-400 truncate">{card.speaker}</p>
              )}
            </header>
            <ProgressBar progress={card.progress} startMs={card.startMs} endMs={card.endMs} timezone={timezone} compact />
          </article>
        ))}
      </div>
      {overflow > 0 && (
        <div className="mt-6 text-center text-base text-zinc-500">
          + {overflow} more room{overflow === 1 ? "" : "s"} live
        </div>
      )}
    </div>
  );
}

function NextHero({ next, now, timezone }: { next: UpcomingItem; now: number; timezone: string }) {
  const startsToday = sameLocalDay(next.startMs, now, timezone);
  const label = startsToday ? "Next" : "Tomorrow";
  return (
    <article className="w-full max-w-[1600px] flex flex-col gap-10">
      <div className="text-2xl font-medium tracking-[0.18em] uppercase text-[color:var(--cta)]">{label}</div>
      <header className="space-y-4">
        <h2 className="text-[clamp(64px,7vw,108px)] font-semibold leading-[1.05] tracking-tight text-zinc-50">
          {next.title}
        </h2>
        <p className="text-3xl text-zinc-400">
          {next.speaker ? `${next.speaker} · ` : ""}{next.roomName}
        </p>
      </header>
      <div className="font-mono text-[clamp(72px,8vw,128px)] font-medium tabular-nums leading-none text-zinc-100">
        {formatHourMinute(next.startMs, timezone)}
      </div>
    </article>
  );
}

function QuietHero({ title, body }: { title: string; body: string }) {
  return (
    <article className="text-center max-w-[1200px]">
      <h2 className="text-6xl font-medium tracking-tight text-zinc-100">{title}</h2>
      <p className="mt-8 text-2xl text-zinc-500">{body}</p>
    </article>
  );
}

/* -------------------- bits -------------------- */

function RoomEyebrow({ roomName, phase, compact = false }:
  { roomName: string; phase: LiveCard["phase"]; compact?: boolean }) {
  const colour =
    phase === "Running" ? "bg-emerald-500"
    : phase === "Paused" ? "bg-amber-400"
    : "bg-[color:var(--cta)]";
  const label =
    phase === "Running" ? "Live"
    : phase === "Paused" ? "Paused"
    : "Starting";
  return (
    <div className="flex items-center gap-3">
      <span className={`relative inline-flex ${compact ? "size-2.5" : "size-3"}`}>
        <span className={`absolute inset-0 rounded-full ${colour} opacity-75 animate-ping`} />
        <span className={`relative inline-flex rounded-full w-full h-full ${colour}`} />
      </span>
      <span className={`uppercase tracking-[0.18em] text-zinc-300 ${compact ? "text-base" : "text-2xl"}`}>
        {roomName} · {label}
      </span>
    </div>
  );
}

function ProgressBar({ progress, startMs, endMs, timezone, compact = false }:
  { progress: number; startMs: number; endMs: number; timezone: string; compact?: boolean }) {
  const pct = Math.max(0, Math.min(1, progress)) * 100;
  return (
    <div className="w-full">
      <div className={`relative ${compact ? "h-1" : "h-1.5"} rounded-full bg-white/[0.07]`}>
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-emerald-500 transition-[width] duration-300 ease-out"
          style={{ width: `${pct}%` }}
        />
        <div
          className={`absolute top-1/2 ${compact ? "size-3" : "size-4"} rounded-full bg-emerald-300 ring-4 ring-emerald-500/30`}
          style={{ left: `${pct}%`, transform: "translate(-50%, -50%)" }}
        />
      </div>
      <div className={`mt-4 flex justify-between font-mono tabular-nums text-zinc-500 ${compact ? "text-lg" : "text-2xl"}`}>
        <span>{formatHourMinute(startMs, timezone)}</span>
        <span>{formatHourMinute(endMs, timezone)}</span>
      </div>
    </div>
  );
}

function UpNextList({ items, timezone }: { items: UpcomingItem[]; timezone: string }) {
  // Show up to 4 explicit items, then a "+ N more" hint.
  const VISIBLE = 4;
  const visible = items.slice(0, VISIBLE);
  const overflow = items.length - visible.length;
  return (
    <div>
      <div className="text-sm font-medium tracking-[0.18em] uppercase text-zinc-500 mb-5">Coming up</div>
      <ul className="space-y-3">
        {visible.map((item) => (
          <li key={item.id} className="flex items-baseline gap-8">
            <span className="font-mono text-2xl tabular-nums text-zinc-300 w-20 shrink-0">
              {formatHourMinute(item.startMs, timezone)}
            </span>
            <span className="text-base tracking-[0.18em] uppercase text-zinc-500 w-44 truncate shrink-0">
              {item.roomName}
            </span>
            <span className="text-2xl text-zinc-100 truncate flex-1">{item.title}</span>
            {item.speaker && (
              <span className="text-xl text-zinc-500 truncate hidden lg:inline">{item.speaker}</span>
            )}
          </li>
        ))}
      </ul>
      {overflow > 0 && (
        <div className="mt-4 text-base text-zinc-500">+ {overflow} more {overflow === 1 ? "session" : "sessions"} today</div>
      )}
    </div>
  );
}

/* -------------------- formatting helpers -------------------- */

function formatHourMinute(ms: number, timezone: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit", minute: "2-digit", hour12: false, timeZone: timezone,
  }).format(new Date(ms));
}

function sameLocalDay(aMs: number, bMs: number, timezone: string): boolean {
  const fmt = new Intl.DateTimeFormat(undefined, { year: "numeric", month: "2-digit", day: "2-digit", timeZone: timezone });
  return fmt.format(new Date(aMs)) === fmt.format(new Date(bMs));
}
