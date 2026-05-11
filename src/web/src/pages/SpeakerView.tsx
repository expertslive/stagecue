import { useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import Countdown from "@/components/timer/Countdown";
import MessageOverlay from "@/components/timer/MessageOverlay";
import SessionHeader from "@/components/timer/SessionHeader";
import SessionFooter from "@/components/timer/SessionFooter";
import { useTimerHub } from "@/hub/useTimerHub";
import { publicInfo } from "@/api/publicInfo";
import { useBranding } from "@/hooks/useBranding";
import ConnectingScreen from "@/components/audience/ConnectingScreen";

export default function SpeakerView() {
  const { accessCode } = useParams<{ accessCode: string }>();
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

  const { snapshot, skewMs, ready, error } = useTimerHub(roomId, normalisedCode, "speaker");

  if (resolveError) return <ConnectingScreen target="this room" error={resolveError} />;
  if (!roomId) return <ConnectingScreen target="this room" />;
  if (error) return <ConnectingScreen target="this room" error={error.message} />;
  if (!ready || !snapshot) return <ConnectingScreen target="this room" />;

  return (
    <div className="relative w-full h-full overflow-hidden">
      <SessionHeader item={snapshot.currentItem} />
      <ClockBadge />
      {/* `key` on the phase makes the wrapper re-mount on phase transitions, replaying the brief enter animation. */}
      <div key={snapshot.phase} className="phase-enter flex items-center justify-center w-full h-full">
        <Countdown snapshot={snapshot} skewMs={skewMs} />
      </div>
      <MessageOverlay message={snapshot.currentMessage} />
      <SessionFooter next={snapshot.nextItem} />
      <RoomBadge eventName={eventName} roomName={roomName} />
    </div>
  );
}

function ClockBadge() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="absolute top-6 right-8 text-sm font-mono text-zinc-500/60 tabular-nums">
      {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
    </div>
  );
}

function RoomBadge({ eventName, roomName }: { eventName: string | null; roomName: string | null }) {
  if (!eventName && !roomName) return null;
  return (
    <div className="absolute bottom-6 left-8 text-sm text-zinc-500/60">
      {eventName && <span>{eventName}</span>}
      {eventName && roomName && <span className="mx-2 text-zinc-700">·</span>}
      {roomName && <span>{roomName}</span>}
    </div>
  );
}
