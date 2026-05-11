import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { publicInfo } from "@/api/publicInfo";
import { useTimerHub } from "@/hub/useTimerHub";
import { useBranding } from "@/hooks/useBranding";
import DoorPanel from "@/components/audience/DoorPanel";
import ConnectingScreen from "@/components/audience/ConnectingScreen";
import OfflineBanner from "@/components/audience/OfflineBanner";
import { parseDoorConfig } from "@/lib/doorDisplayConfig";

export default function DoorView() {
  const { accessCode } = useParams<{ accessCode: string }>();
  const normalised = (accessCode ?? "").replace("-", "").toUpperCase();
  const info = useQuery({ queryKey: ["roomInfo", accessCode], queryFn: () => publicInfo.room(accessCode!), enabled: !!accessCode });
  const { snapshot, skewMs, ready, error, connectionState } = useTimerHub(info.data?.roomId ?? null, normalised, "door");
  const { logoUrl } = useBranding(accessCode, "r");

  const config = useMemo(() => parseDoorConfig(info.data?.doorDisplayConfigJson), [info.data?.doorDisplayConfigJson]);

  if (info.error) return <ConnectingScreen target="this room" error="URL not valid" />;
  if (!info.data) return <ConnectingScreen target="this room" />;
  // Hold on to the last snapshot through reconnects so the door panel keeps ticking
  // through venue Wi-Fi blips instead of flashing back to "Connecting".
  if (!snapshot) {
    if (error) return <ConnectingScreen target={info.data.roomName ?? "this room"} error={error.message} />;
    if (!ready) return <ConnectingScreen target={info.data.roomName ?? "this room"} />;
    return <ConnectingScreen target={info.data.roomName ?? "this room"} />;
  }

  return (
    <div className="w-full h-full relative">
      {config.showLogo && logoUrl && (
        <img src={logoUrl} alt="" className="absolute top-6 right-6 max-h-12 opacity-90" />
      )}
      <DoorPanel
        snapshot={snapshot}
        skewMs={skewMs}
        eventName={info.data.eventName}
        roomName={info.data.roomName}
        config={config}
      />
      <OfflineBanner connectionState={connectionState} />
    </div>
  );
}
