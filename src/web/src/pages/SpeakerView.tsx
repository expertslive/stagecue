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
  const [resolveError, setResolveError] = useState<string | null>(null);
  useBranding(accessCode, "r");

  useEffect(() => {
    if (!accessCode) return;
    publicInfo.room(accessCode)
      .then((info) => setRoomId(info.roomId))
      .catch((e) => setResolveError(String((e as Error).message ?? e)));
  }, [accessCode]);

  const { snapshot, skewMs, ready, error } = useTimerHub(roomId, normalisedCode);

  if (resolveError) return <ConnectingScreen target="this room" error={resolveError} />;
  if (!roomId) return <ConnectingScreen target="this room" />;
  if (error) return <ConnectingScreen target="this room" error={error.message} />;
  if (!ready || !snapshot) return <ConnectingScreen target="this room" />;

  return (
    <div className="relative w-full h-full overflow-hidden">
      <SessionHeader item={snapshot.currentItem} />
      <div className="flex items-center justify-center w-full h-full">
        <Countdown snapshot={snapshot} skewMs={skewMs} />
      </div>
      <MessageOverlay message={snapshot.currentMessage} />
      <SessionFooter next={snapshot.nextItem} />
    </div>
  );
}

