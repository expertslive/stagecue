import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { publicInfo } from "@/api/publicInfo";
import { useTimerHub } from "@/hub/useTimerHub";
import DoorPanel from "@/components/audience/DoorPanel";

export default function DoorView() {
  const { accessCode } = useParams<{ accessCode: string }>();
  const normalised = (accessCode ?? "").replace("-", "").toUpperCase();
  const info = useQuery({ queryKey: ["roomInfo", accessCode], queryFn: () => publicInfo.room(accessCode!), enabled: !!accessCode });
  const { snapshot, skewMs, ready, error } = useTimerHub(info.data?.roomId ?? null, normalised);

  if (info.error) return <Center>URL not valid</Center>;
  if (!info.data || !ready || !snapshot) return <Center>Connecting…</Center>;
  if (error) return <Center>Connection error: {error.message}</Center>;

  return <div className="w-full h-full"><DoorPanel snapshot={snapshot} skewMs={skewMs} eventName={info.data.eventName} roomName={info.data.roomName} /></div>;
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center justify-center w-full h-full text-zinc-500">{children}</div>;
}
