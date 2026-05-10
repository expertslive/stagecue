import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { publicInfo } from "@/api/publicInfo";
import { TimerHub } from "@/hub/timerHub";
import type { Snapshot } from "@/api/types";
import { measureSkew } from "@/lib/clockSkew";
import RoomCard from "@/components/audience/RoomCard";

export default function LobbyView() {
  const { accessCode } = useParams<{ accessCode: string }>();
  const normalised = (accessCode ?? "").replace("-", "").toUpperCase();
  const info = useQuery({ queryKey: ["lobbyInfo", accessCode], queryFn: () => publicInfo.lobby(accessCode!), enabled: !!accessCode });

  const [snapshots, setSnapshots] = useState<Record<string, Snapshot>>({});
  const [skewMs, setSkewMs] = useState(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!info.data || !accessCode) return;
    let cancelled = false;
    const hub = new TimerHub(normalised);
    const off = hub.onSnapshot((snap) => {
      if (cancelled) return;
      setSnapshots((prev) => ({ ...prev, [snap.roomId]: snap }));
      setSkewMs(measureSkew(snap.serverNowUtc));
    });
    hub.start().then(() => { if (!cancelled) setReady(true); }).catch((e) => { if (!cancelled) setError(e as Error); });
    return () => { cancelled = true; off(); hub.stop().catch(() => {}); };
  }, [info.data, accessCode, normalised]);

  if (info.error) return <Center>URL not valid</Center>;
  if (!info.data || !ready) return <Center>Connecting…</Center>;
  if (error) return <Center>Connection error: {error.message}</Center>;

  return (
    <div className="p-8 h-full overflow-auto">
      <div className="text-sm uppercase tracking-widest text-zinc-500">{info.data.eventName}</div>
      <h1 className="text-3xl font-semibold mb-6">Lobby</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {info.data.rooms.map((r) => (
          <RoomCard key={r.id} roomName={r.name} snapshot={snapshots[r.id]} skewMs={skewMs} />
        ))}
      </div>
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center justify-center w-full h-full text-zinc-500">{children}</div>;
}
