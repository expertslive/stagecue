import { useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import Countdown from "@/components/timer/Countdown";
import MessageOverlay from "@/components/timer/MessageOverlay";
import { useTimerHub } from "@/hub/useTimerHub";
import { publicInfo } from "@/api/publicInfo";
import { useBranding } from "@/hooks/useBranding";
import ConnectingScreen from "@/components/audience/ConnectingScreen";
import OfflineBanner from "@/components/audience/OfflineBanner";
import { activeCountdownColor, computeRemaining } from "@/lib/countdownState";
import { displayOptionsFromSearch, progressForSnapshot, speakerDisplayState, type SpeakerDisplayOptions } from "@/lib/speakerDisplay";
import type { Snapshot } from "@/api/types";

export default function SpeakerView() {
  const { accessCode } = useParams<{ accessCode: string }>();
  const location = useLocation();
  const displayOptions = displayOptionsFromSearch(location.search);
  const normalisedCode = (accessCode ?? "").replace("-", "").toUpperCase();
  const [roomId, setRoomId] = useState<string | null>(null);
  const [eventName, setEventName] = useState<string | null>(null);
  const [roomName, setRoomName] = useState<string | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);
  useBranding(accessCode, "r");

  useEffect(() => {
    if (!accessCode) return;
    publicInfo.room(accessCode)
      .then((info) => { setRoomId(info.roomId); setEventName(info.eventName); setRoomName(info.roomName); })
      .catch((e) => setResolveError(String((e as Error).message ?? e)));
  }, [accessCode]);

  const { snapshot, skewMs, ready, error, connectionState } = useTimerHub(roomId, normalisedCode, "speaker");

  if (resolveError) return <ConnectingScreen target="this room" error={resolveError} />;
  if (!roomId) return <ConnectingScreen target="this room" />;
  // Show ConnectingScreen only on first-load failures / initial connect. Once we have a snapshot,
  // we hold on to it through reconnects so the countdown keeps ticking through venue Wi-Fi blips.
  if (!snapshot) {
    if (error) return <ConnectingScreen target="this room" error={error.message} />;
    if (!ready) return <ConnectingScreen target="this room" />;
  }
  if (!snapshot) return <ConnectingScreen target="this room" />;

  const remainingMs = computeRemaining(snapshot, skewMs);
  const displayState = speakerDisplayState(snapshot, remainingMs);
  const progress = progressForSnapshot(snapshot, remainingMs);
  const color = activeCountdownColor(snapshot, skewMs);
  const showChrome = displayOptions.chrome !== "minimal";
  const hasMessage = snapshot.currentMessage !== null;

  return (
    <div className={`speaker-stage relative h-full w-full overflow-hidden ${displayOptions.contrast === "high" ? "speaker-high-contrast" : ""}`}>
      <div className="pointer-events-none absolute inset-0 opacity-80" style={{ background: `radial-gradient(900px 560px at 50% 42%, color-mix(in srgb, ${color} 10%, transparent), transparent 72%)` }} />
      <div className={`relative grid h-full grid-rows-[auto_1fr_auto] ${marginClass(displayOptions.margin)}`}>
        <header className={`flex min-h-20 items-start justify-between gap-8 transition-opacity duration-700 ${showChrome ? "opacity-100" : "opacity-0"}`}>
          <SessionIdentity snapshot={snapshot} />
          <ClockBadge quiet={displayOptions.chrome === "minimal"} />
        </header>

        <main key={displayState.kind} className="phase-enter flex min-h-0 flex-col items-center justify-center">
          {snapshot.phase === "Idle" && !snapshot.currentItem ? (
            <IdleState eventName={eventName} roomName={roomName} nextTitle={snapshot.nextItem?.title ?? null} nextStart={snapshot.nextItem?.scheduledStartUtc ?? null} />
          ) : (
            <>
              {displayOptions.progress === "ring" && <ProgressRing progress={progress} color={color} />}
              <Countdown
                snapshot={snapshot}
                skewMs={skewMs}
                scale={displayOptions.scale}
                label={displayState.label}
                pulse={displayState.kind === "final" && remainingMs <= 10_000}
              />
              {displayOptions.progress === "line" && <ProgressLine progress={progress} color={color} />}
            </>
          )}
        </main>

        <footer className="min-h-24">
          <MessageOverlay message={snapshot.currentMessage} />
          {!hasMessage && showChrome && <NextCue next={snapshot.nextItem} />}
          {showChrome && <RoomBadge eventName={eventName} roomName={roomName} />}
        </footer>
      </div>
      <OfflineBanner connectionState={connectionState} />
    </div>
  );
}

function ClockBadge({ quiet }: { quiet: boolean }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className={`text-sm font-mono tabular-nums transition-opacity duration-700 ${quiet ? "opacity-0" : "text-zinc-500/50"}`}>
      {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
    </div>
  );
}

function RoomBadge({ eventName, roomName }: { eventName: string | null; roomName: string | null }) {
  if (!eventName && !roomName) return null;
  return (
    <div className="absolute bottom-6 left-8 text-sm text-zinc-500/50">
      {eventName && <span>{eventName}</span>}
      {eventName && roomName && <span className="mx-2 text-zinc-700">·</span>}
      {roomName && <span>{roomName}</span>}
    </div>
  );
}

function SessionIdentity({ snapshot }: { snapshot: Snapshot }) {
  const current = snapshot.currentItem;
  if (!current) return <div />;
  return (
    <div className="min-w-0">
      <div className="truncate text-[clamp(20px,2vw,34px)] font-semibold tracking-tight text-zinc-100" title={current.title}>
        {current.title}
      </div>
      {current.speakerName && <div className="mt-1 truncate text-[clamp(14px,1.3vw,22px)] text-zinc-500">{current.speakerName}</div>}
    </div>
  );
}

function NextCue({ next }: { next: { title: string; scheduledStartUtc: string } | null }) {
  if (!next) return null;
  return (
    <div className="absolute bottom-6 left-1/2 max-w-[56rem] -translate-x-1/2 truncate text-center text-[clamp(16px,1.4vw,24px)] text-zinc-500">
      <span className="text-zinc-600">Next</span>
      <span className="mx-3 text-zinc-700">·</span>
      <span className="text-zinc-400">{next.title}</span>
      <span className="mx-3 text-zinc-700">·</span>
      {new Date(next.scheduledStartUtc).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
    </div>
  );
}

function IdleState({ eventName, roomName, nextTitle, nextStart }: { eventName: string | null; roomName: string | null; nextTitle: string | null; nextStart: string | null }) {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="mb-5 text-xs font-medium uppercase tracking-[0.28em] text-zinc-600">{roomName ?? eventName ?? "Stagecue"}</div>
      <div className="text-[clamp(42px,7vw,108px)] font-semibold tracking-tight text-zinc-100">
        {nextTitle ? "Up next" : "Standing by"}
      </div>
      {nextTitle && (
        <div className="mt-5 max-w-5xl truncate text-[clamp(24px,3vw,48px)] text-zinc-400">
          {nextTitle}
        </div>
      )}
      {nextStart && (
        <div className="mt-4 font-mono text-[clamp(18px,2vw,32px)] tabular-nums text-zinc-500">
          {new Date(nextStart).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </div>
      )}
    </div>
  );
}

function ProgressLine({ progress, color }: { progress: number; color: string }) {
  return (
    <div className="mt-10 h-px w-[min(58vw,760px)] overflow-hidden rounded-full bg-white/10">
      <div className="h-full transition-[width,background-color] duration-300 ease-[var(--ease-out)]" style={{ width: `${progress * 100}%`, background: color }} />
    </div>
  );
}

function ProgressRing({ progress, color }: { progress: number; color: string }) {
  const circumference = 2 * Math.PI * 46;
  return (
    <svg className="absolute left-1/2 top-1/2 h-[min(74vmin,620px)] w-[min(74vmin,620px)] -translate-x-1/2 -translate-y-1/2 opacity-35" viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="46" fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth="0.6" />
      <circle
        cx="50"
        cy="50"
        r="46"
        fill="none"
        stroke={color}
        strokeWidth="0.9"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - progress)}
        transform="rotate(-90 50 50)"
      />
    </svg>
  );
}

function marginClass(margin: SpeakerDisplayOptions["margin"]): string {
  switch (margin) {
    case "tight": return "p-8";
    case "safe": return "p-[clamp(56px,7vw,120px)]";
    default: return "p-[clamp(32px,5vw,88px)]";
  }
}
