import { useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import Countdown from "@/components/timer/Countdown";
import MessageOverlay from "@/components/timer/MessageOverlay";
import SessionHeader from "@/components/timer/SessionHeader";
import SessionFooter from "@/components/timer/SessionFooter";
import { useTimerHub } from "@/hub/useTimerHub";

export default function SpeakerView() {
  const { accessCode } = useParams<{ accessCode: string }>();
  const normalisedCode = (accessCode ?? "").replace("-", "").toUpperCase();
  const [roomId, setRoomId] = useState<string | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessCode) return;
    fetch(`/r/${accessCode}/ping`, { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) throw new Error(r.status === 401 ? "URL not valid" : `Lookup failed (${r.status})`);
        const body = await r.json();
        setRoomId(body.roomId);
      })
      .catch((e) => setResolveError(String(e.message ?? e)));
  }, [accessCode]);

  const { snapshot, skewMs, ready, error } = useTimerHub(roomId, normalisedCode);

  if (resolveError) return <CenterMessage>{resolveError}</CenterMessage>;
  if (!roomId) return <CenterMessage>Connecting…</CenterMessage>;
  if (error) return <CenterMessage>Connection error: {error.message}</CenterMessage>;
  if (!ready || !snapshot) return <CenterMessage>Connecting…</CenterMessage>;

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

function CenterMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-center w-full h-full">
      <div className="text-zinc-500">{children}</div>
    </div>
  );
}
