import { useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { rooms } from "@/api/rooms";
import Skeleton from "@/components/ui/Skeleton";
import { useTimerHub } from "@/hub/useTimerHub";
import TransportControlsV2 from "@/components/control/TransportControlsV2";
import OperatorHero from "@/components/control/OperatorHero";
import ToolsPanel, { type ToolsTabId } from "@/components/control/ToolsPanel";
import ScheduleRail from "@/components/control/ScheduleRail";
import LiveIndicator from "@/components/timer/LiveIndicator";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
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
  const [pendingDestructive, setPendingDestructive] = useState<"skip" | "reset" | null>(null);
  const [toolsTab, setToolsTab] = useState<ToolsTabId>("adjust");
  const messageInputRef = useRef<HTMLInputElement>(null);

  const safe = (p: Promise<unknown>) => p.catch((e) => toast.show({ message: humaniseHubError(e), tone: "error" }));

  const sendPreset = (i: number) => {
    if (!snapshot || !hub) return;
    const list = ["Wrap up", "5 min over", "Q&A time", "Mic check"];
    safe(hub.setMessage(snapshot.roomId, list[i - 1]));
  };

  const focusMessage = () => {
    setToolsTab("message");
    // Defer to next frame so the input is mounted before we try to focus it.
    requestAnimationFrame(() => messageInputRef.current?.focus());
  };

  useShortcuts({
    Space: () => {
      if (!snapshot || !hub) return;
      if (snapshot.phase === "Running") safe(hub.pause(snapshot.roomId, snapshot.version));
      else if (snapshot.phase === "Paused") safe(hub.resume(snapshot.roomId, snapshot.version));
      else if (snapshot.phase === "Idle") safe(snapshot.currentItem ? hub.startItem(snapshot.roomId, snapshot.currentItem.id, snapshot.version) : hub.startAuto(snapshot.roomId, snapshot.version));
    },
    S: () => snapshot && hub && setPendingDestructive("skip"),
    R: () => snapshot && hub && setPendingDestructive("reset"),
    m: focusMessage,
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
      <div className="p-6 max-w-7xl mx-auto space-y-4">
        <Skeleton className="h-6 w-40" />
        <div className="rounded-2xl border border-white/5 bg-zinc-900/60 backdrop-blur-sm p-6 flex justify-center">
          <Skeleton className="h-48 w-2/3" />
        </div>
        <Skeleton className="h-10 w-64" />
      </div>
    );
  }

  const nextTitle = snapshot.nextItem?.title ?? null;
  const scheduleItems = scheduleQuery.data ?? [];

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Header row: just the live indicator. The EventContextBar already provides Event ▸ Room. */}
      <div className="mb-4 flex items-center justify-end">
        <LiveIndicator ready={ready} hasError={error !== null} lastSnapshotUtc={snapshot.serverNowUtc} />
      </div>

      {/* Two-column on lg+: control surface left, schedule rail right. */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">
        <div className="space-y-4 min-w-0">
          <OperatorHero snapshot={snapshot} skewMs={skewMs} />
          <TransportControlsV2
            hub={hub}
            snapshot={snapshot}
            onError={(m) => toast.show({ message: m, tone: "error" })}
          />
          <ToolsPanel
            ref={messageInputRef}
            hub={hub}
            snapshot={snapshot}
            activeTab={toolsTab}
            onTabChange={setToolsTab}
            scheduleItems={scheduleItems}
            includeScheduleTab // narrow viewports stack everything, so we expose Schedule here too
            onError={(m) => toast.show({ message: m, tone: "error" })}
          />
        </div>

        <div className="hidden lg:block lg:sticky lg:top-20">
          <ScheduleRail
            items={scheduleItems}
            currentItemId={snapshot.currentItem?.id ?? null}
            editHref={`/rooms/${roomId}/schedule`}
          />
        </div>
      </div>

      <ShortcutsOverlay open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />

      <ConfirmDialog
        open={pendingDestructive === "skip"}
        tone="danger"
        title="Skip to next item?"
        message={
          nextTitle
            ? <>The current session will end and <strong>{nextTitle}</strong> will be cued up.</>
            : "The current session will end. There is no next item — the room will go idle."
        }
        confirmLabel="Skip"
        onConfirm={() => {
          setPendingDestructive(null);
          safe(hub!.skipNext(snapshot.roomId, snapshot.version));
        }}
        onCancel={() => setPendingDestructive(null)}
      />

      <ConfirmDialog
        open={pendingDestructive === "reset"}
        tone="danger"
        title="Clear current session?"
        message="The countdown will be cleared. Any audience display will revert to idle. This cannot be undone."
        confirmLabel="Clear session"
        onConfirm={() => {
          setPendingDestructive(null);
          safe(hub!.reset(snapshot.roomId, snapshot.version));
        }}
        onCancel={() => setPendingDestructive(null)}
      />
    </div>
  );
}
