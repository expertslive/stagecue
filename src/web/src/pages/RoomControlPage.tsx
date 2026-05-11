import { useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { rooms } from "@/api/rooms";
import Skeleton from "@/components/ui/Skeleton";
import { useTimerHub } from "@/hub/useTimerHub";
import TransportControlsV2 from "@/components/control/TransportControlsV2";
import TimeAdjustments from "@/components/control/TimeAdjustments";
import MessageInput from "@/components/control/MessageInput";
import ScheduleList from "@/components/control/ScheduleList";
import Countdown from "@/components/timer/Countdown";
import CueStrip from "@/components/control/CueStrip";
import { useToast } from "@/components/ui/Toast";
import useShortcuts from "@/hooks/useShortcuts";
import ShortcutsOverlay from "@/components/control/ShortcutsOverlay";
import { humaniseHubError } from "@/lib/hubErrors";

export default function RoomControlPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const scheduleQuery = useQuery({
    queryKey: ["schedule", roomId],
    queryFn: () => rooms.schedule(roomId!),
    enabled: !!roomId,
  });
  const { hub, snapshot, skewMs, ready, error } = useTimerHub(roomId ?? null, null);
  const toast = useToast();
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const messageInputRef = useRef<HTMLInputElement>(null);

  const safe = (p: Promise<unknown>) => p.catch((e) => toast.show({ message: humaniseHubError(e), tone: "error" }));

  const sendPreset = (i: number) => {
    if (!snapshot || !hub) return;
    const list = ["Wrap up", "5 min over", "Q&A time", "Mic check"];
    safe(hub.setMessage(snapshot.roomId, list[i - 1]));
  };

  useShortcuts({
    Space: () => {
      if (!snapshot || !hub) return;
      if (snapshot.phase === "Running") safe(hub.pause(snapshot.roomId, snapshot.version));
      else if (snapshot.phase === "Paused") safe(hub.resume(snapshot.roomId, snapshot.version));
      else if (snapshot.phase === "Idle") safe(snapshot.currentItem ? hub.startItem(snapshot.roomId, snapshot.currentItem.id, snapshot.version) : hub.startAuto(snapshot.roomId, snapshot.version));
    },
    s: () => snapshot && hub && safe(hub.skipNext(snapshot.roomId, snapshot.version)),
    r: () => snapshot && hub && safe(hub.reset(snapshot.roomId, snapshot.version)),
    m: () => messageInputRef.current?.focus(),
    "?": () => setShortcutsOpen(true),
    "1": () => sendPreset(1),
    "2": () => sendPreset(2),
    "3": () => sendPreset(3),
    "4": () => sendPreset(4),
  });

  if (!roomId) return <div className="p-8 text-red-400">Missing room id.</div>;
  if (error) return <div className="p-8 text-red-400">Connection error: {error.message}</div>;
  if (!ready || !snapshot) {
    return (
      <div className="p-8 max-w-5xl mx-auto space-y-6">
        <Skeleton className="h-6 w-40" />
        <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-6 flex justify-center">
          <Skeleton className="h-48 w-2/3" />
        </div>
        <Skeleton className="h-10 w-64" />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <h1 className="text-xl font-semibold">Room control</h1>
      <CueStrip snapshot={snapshot} />
      <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-6 flex justify-center">
        <Countdown snapshot={snapshot} skewMs={skewMs} />
      </div>

      <TransportControlsV2 hub={hub} snapshot={snapshot} onError={(m) => toast.show({ message: m, tone: "error" })} />

      <div>
        <h2 className="text-sm uppercase tracking-widest text-zinc-500 mb-2">Adjust time</h2>
        <TimeAdjustments hub={hub} snapshot={snapshot} onError={(m) => toast.show({ message: m, tone: "error" })} />
      </div>
      <div>
        <h2 className="text-sm uppercase tracking-widest text-zinc-500 mb-2">Live message</h2>
        <MessageInput ref={messageInputRef} hub={hub} snapshot={snapshot} onError={(m) => toast.show({ message: m, tone: "error" })} />
      </div>
      <div>
        <h2 className="text-sm uppercase tracking-widest text-zinc-500 mb-2">Schedule</h2>
        {scheduleQuery.data && (
          <ScheduleList items={scheduleQuery.data} currentItemId={snapshot.currentItem?.id ?? null} />
        )}
      </div>
      <ShortcutsOverlay open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </div>
  );
}
