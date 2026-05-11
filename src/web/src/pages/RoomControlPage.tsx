import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { rooms } from "@/api/rooms";
import { useTimerHub } from "@/hub/useTimerHub";
import TransportControlsV2 from "@/components/control/TransportControlsV2";
import TimeAdjustments from "@/components/control/TimeAdjustments";
import MessageInput from "@/components/control/MessageInput";
import ScheduleList from "@/components/control/ScheduleList";
import Countdown from "@/components/timer/Countdown";
import { useToast } from "@/components/ui/Toast";

export default function RoomControlPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const scheduleQuery = useQuery({
    queryKey: ["schedule", roomId],
    queryFn: () => rooms.schedule(roomId!),
    enabled: !!roomId,
  });
  const { hub, snapshot, skewMs, ready, error } = useTimerHub(roomId ?? null, null);
  const toast = useToast();

  if (!roomId) return <div className="p-8 text-red-400">Missing room id.</div>;
  if (error) return <div className="p-8 text-red-400">Connection error: {error.message}</div>;
  if (!ready || !snapshot) return <div className="p-8">Connecting…</div>;

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <h1 className="text-xl font-semibold">Room control</h1>

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
        <MessageInput hub={hub} snapshot={snapshot} onError={(m) => toast.show({ message: m, tone: "error" })} />
      </div>
      <div>
        <h2 className="text-sm uppercase tracking-widest text-zinc-500 mb-2">Schedule</h2>
        {scheduleQuery.data && (
          <ScheduleList items={scheduleQuery.data} currentItemId={snapshot.currentItem?.id ?? null} />
        )}
      </div>
    </div>
  );
}
