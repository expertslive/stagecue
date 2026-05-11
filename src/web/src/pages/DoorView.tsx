import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { publicInfo } from "@/api/publicInfo";
import { useTimerHub } from "@/hub/useTimerHub";
import { useBranding } from "@/hooks/useBranding";
import DoorPanel from "@/components/audience/DoorPanel";
import ConnectingScreen from "@/components/audience/ConnectingScreen";

export default function DoorView() {
  const { accessCode } = useParams<{ accessCode: string }>();
  const normalised = (accessCode ?? "").replace("-", "").toUpperCase();
  const info = useQuery({ queryKey: ["roomInfo", accessCode], queryFn: () => publicInfo.room(accessCode!), enabled: !!accessCode });
  const { snapshot, skewMs, ready, error } = useTimerHub(info.data?.roomId ?? null, normalised, "door");
  const { logoUrl } = useBranding(accessCode, "r");

  if (info.error) return <ConnectingScreen target="this room" error="URL not valid" />;
  if (!info.data || !ready || !snapshot) return <ConnectingScreen target={info.data?.roomName ?? "this room"} />;
  if (error) return <ConnectingScreen target={info.data?.roomName ?? "this room"} error={error.message} />;

  return (
    <div className="w-full h-full relative">
      {logoUrl && <img src={logoUrl} alt="" className="absolute top-6 right-6 max-h-12 opacity-90" />}
      <DoorPanel snapshot={snapshot} skewMs={skewMs} eventName={info.data.eventName} roomName={info.data.roomName} />
    </div>
  );
}
