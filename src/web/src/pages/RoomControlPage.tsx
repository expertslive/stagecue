import { useCallback, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { rooms } from "@/api/rooms";
import { scheduleItems } from "@/api/scheduleItems";
import Skeleton from "@/components/ui/Skeleton";
import { useTimerHub } from "@/hub/useTimerHub";
import { useOfflineCommands } from "@/hub/useOfflineCommands";
import TransportControlsV2 from "@/components/control/TransportControlsV2";
import OperatorHero from "@/components/control/OperatorHero";
import ToolsPanel, { type ToolsTabId } from "@/components/control/ToolsPanel";
import ScheduleRail from "@/components/control/ScheduleRail";
import QuickTimerSheet from "@/components/control/QuickTimerSheet";
import LiveIndicator from "@/components/timer/LiveIndicator";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/toastContext";
import useShortcuts from "@/hooks/useShortcuts";
import ShortcutsOverlay from "@/components/control/ShortcutsOverlay";
import { humaniseHubError } from "@/lib/hubErrors";
import useRehearsalClock from "@/hooks/useRehearsalClock";
import RehearsalControls from "@/components/control/RehearsalControls";
import Button from "@/components/ui/Button";

export default function RoomControlPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const scheduleQuery = useQuery({
    queryKey: ["schedule", roomId],
    queryFn: () => rooms.schedule(roomId!),
    enabled: !!roomId,
  });
  const { hub, snapshot: serverSnapshot, skewMs, ready, error, connectionState } = useTimerHub(roomId ?? null, null);
  const rehearsal = useRehearsalClock(skewMs);
  const toast = useToast();
  const qc = useQueryClient();
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [pendingDestructive, setPendingDestructive] = useState<"skip" | "reset" | null>(null);
  const [toolsTab, setToolsTab] = useState<ToolsTabId>("adjust");
  const [quickTimerOpen, setQuickTimerOpen] = useState(false);
  const messageInputRef = useRef<HTMLInputElement>(null);

  const handleReconcile = useCallback((synced: number, skipped: number) => {
    if (synced === 0 && skipped === 0) return;
    const parts: string[] = [];
    parts.push(`${synced} synced`);
    if (skipped > 0) parts.push(`${skipped} skipped`);
    toast.show({ message: `Reconnected · ${parts.join(", ")}` });
  }, [toast]);

  const handleCommandError = useCallback((e: Error) => {
    toast.show({ message: humaniseHubError(e), tone: "error" });
  }, [toast]);

  const offline = useOfflineCommands({
    hub,
    serverSnapshot,
    connectionState,
    onReconcile: handleReconcile,
    onError: handleCommandError,
  });
  // From here on we render against the optimistic snapshot, not the raw server one.
  const snapshot = offline.snapshot;
  const isOnline = offline.online;

  async function startQuickTimer({ title, durationSec }: { title: string; durationSec: number }) {
    if (!hub || !snapshot || !roomId || !isOnline) throw new Error("Quick timer requires a live connection.");
    const item = await scheduleItems.create(roomId, {
      title,
      speakerName: null,
      scheduledStartUtc: new Date().toISOString(),
      durationSec,
      preRollSec: 0,
      autoStart: false,
      thresholdsJson: null,
    });
    qc.invalidateQueries({ queryKey: ["schedule", roomId] });
    await hub.startItem(snapshot.roomId, item.id, snapshot.version);
    setQuickTimerOpen(false);
  }

  const safe = (p: Promise<unknown>) => p.catch((e) => toast.show({ message: humaniseHubError(e), tone: "error" }));

  const sendPreset = (i: number) => {
    const list = ["Wrap up", "5 min over", "Q&A time", "Mic check"];
    safe(offline.setMessage(list[i - 1]));
  };

  const focusMessage = () => {
    setToolsTab("message");
    requestAnimationFrame(() => messageInputRef.current?.focus());
  };

  useShortcuts({
    Space: () => {
      if (!snapshot || !hub) return;
      if (snapshot.phase === "Running") safe(offline.pause());
      else if (snapshot.phase === "Paused") safe(offline.resume());
      else if (snapshot.phase === "Idle" && isOnline) {
        safe(snapshot.currentItem
          ? hub.startItem(snapshot.roomId, snapshot.currentItem.id, snapshot.version)
          : hub.startAuto(snapshot.roomId, snapshot.version));
      }
    },
    S: () => isOnline && snapshot && hub && setPendingDestructive("skip"),
    R: () => isOnline && snapshot && hub && setPendingDestructive("reset"),
    m: focusMessage,
    "?": () => setShortcutsOpen(true),
    "1": () => sendPreset(1),
    "2": () => sendPreset(2),
    "3": () => sendPreset(3),
    "4": () => sendPreset(4),
  });

  if (!roomId) return <div className="p-8 text-red-400">Missing room id.</div>;
  // First-load only — once we have a snapshot we hold onto it through reconnects so the
  // countdown keeps ticking through venue Wi-Fi blips.
  if (!snapshot) {
    if (error) return <div className="p-8 text-red-400">Connection error: {error.message}</div>;
    if (!ready) {
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
  }
  if (!snapshot) return null;

  const nextTitle = snapshot.nextItem?.title ?? null;
  const scheduleList = scheduleQuery.data ?? [];

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="mb-4 flex items-center justify-end gap-3">
        <LiveIndicator
          connectionState={connectionState}
          queuedCount={offline.queuedCount}
          lastSnapshotUtc={serverSnapshot?.serverNowUtc ?? null}
        />
        <Link to={`/rooms/${roomId}/show`}>
          <Button size="sm" variant="ghost">Show mode</Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">
        <div className="space-y-4 min-w-0">
          <OperatorHero
            snapshot={snapshot}
            skewMs={rehearsal.effectiveSkewMs}
            onQuickTimer={isOnline ? () => setQuickTimerOpen(true) : undefined}
          />
          <TransportControlsV2
            hub={hub}
            snapshot={snapshot}
            online={isOnline}
            onPause={() => safe(offline.pause())}
            onResume={() => safe(offline.resume())}
            onError={(m) => toast.show({ message: m, tone: "error" })}
          />
          <RehearsalControls
            enabled={rehearsal.enabled}
            speed={rehearsal.speed}
            onStart={rehearsal.start}
            onStop={rehearsal.stop}
          />
          <ToolsPanel
            ref={messageInputRef}
            hub={hub}
            snapshot={snapshot}
            online={isOnline}
            onAdjustTime={(deltaSec) => safe(offline.adjustTime(deltaSec))}
            onSetMessage={(text) => safe(offline.setMessage(text))}
            onClearMessage={() => safe(offline.clearMessage())}
            activeTab={toolsTab}
            onTabChange={setToolsTab}
            scheduleItems={scheduleList}
            includeScheduleTab
            onError={(m) => toast.show({ message: m, tone: "error" })}
          />
        </div>

        <div className="hidden lg:block lg:sticky lg:top-20">
          <ScheduleRail
            items={scheduleList}
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
          if (hub) safe(hub.skipNext(snapshot.roomId, snapshot.version));
        }}
        onCancel={() => setPendingDestructive(null)}
      />

      <QuickTimerSheet
        open={quickTimerOpen}
        onClose={() => setQuickTimerOpen(false)}
        onSubmit={startQuickTimer}
      />

      <ConfirmDialog
        open={pendingDestructive === "reset"}
        tone="danger"
        title="Clear current session?"
        message="The countdown will be cleared. Any audience display will revert to idle. This cannot be undone."
        confirmLabel="Clear session"
        onConfirm={() => {
          setPendingDestructive(null);
          if (hub) safe(hub.reset(snapshot.roomId, snapshot.version));
        }}
        onCancel={() => setPendingDestructive(null)}
      />
    </div>
  );
}
