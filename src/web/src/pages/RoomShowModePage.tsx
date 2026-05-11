import { useCallback } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { rooms } from "@/api/rooms";
import { useTimerHub } from "@/hub/useTimerHub";
import { useOfflineCommands } from "@/hub/useOfflineCommands";
import Countdown from "@/components/timer/Countdown";
import LiveIndicator from "@/components/timer/LiveIndicator";
import MessageInput from "@/components/control/MessageInput";
import RehearsalControls from "@/components/control/RehearsalControls";
import TransportControlsV2 from "@/components/control/TransportControlsV2";
import Skeleton from "@/components/ui/Skeleton";
import Button from "@/components/ui/Button";
import useRehearsalClock from "@/hooks/useRehearsalClock";
import { useToast } from "@/components/ui/toastContext";
import { humaniseHubError } from "@/lib/hubErrors";

export default function RoomShowModePage() {
  const { roomId } = useParams<{ roomId: string }>();
  const scheduleQuery = useQuery({
    queryKey: ["schedule", roomId],
    queryFn: () => rooms.schedule(roomId!),
    enabled: !!roomId,
  });
  const { hub, snapshot: serverSnapshot, skewMs, ready, error, connectionState } = useTimerHub(roomId ?? null, null);
  const rehearsal = useRehearsalClock(skewMs);
  const toast = useToast();

  const handleReconcile = useCallback((synced: number, skipped: number) => {
    if (synced === 0 && skipped === 0) return;
    const parts: string[] = [`${synced} synced`];
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
  const snapshot = offline.snapshot;
  const isOnline = offline.online;
  const safe = (p: Promise<unknown>) => p.catch((e) => toast.show({ message: humaniseHubError(e), tone: "error" }));

  if (!roomId) return <div className="p-8 text-red-400">Missing room id.</div>;
  if (!snapshot) {
    if (error) return <div className="p-8 text-red-400">Connection error: {error.message}</div>;
    if (!ready) {
      return (
        <div className="p-8 space-y-6">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-64 w-full" />
        </div>
      );
    }
    return null;
  }

  const effectiveSkew = rehearsal.effectiveSkewMs;
  const currentTitle = snapshot.currentItem?.title ?? snapshot.nextItem?.title ?? "Nothing cued";
  const speaker = snapshot.currentItem?.speakerName ?? null;

  return (
    <div className="min-h-full bg-[radial-gradient(1200px_800px_at_50%_20%,rgba(255,255,255,0.06),transparent_60%),var(--bg)] px-6 py-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-5">
        <header className="flex items-center justify-between gap-4">
          <Link to={`/rooms/${roomId}`}>
            <Button variant="ghost" leadingIcon={<ArrowLeft className="size-4" />}>Control</Button>
          </Link>
          <LiveIndicator
            connectionState={connectionState}
            queuedCount={offline.queuedCount}
            lastSnapshotUtc={serverSnapshot?.serverNowUtc ?? null}
          />
        </header>

        <section className="grid min-h-[520px] grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
          <div className="relative overflow-hidden rounded-[28px] border border-white/10 bg-black/40 p-8 shadow-2xl">
            {rehearsal.enabled && (
              <div className="absolute left-6 top-6 rounded-full bg-[var(--cta)]/15 px-3 py-1 text-xs font-medium text-[color:var(--cta)] ring-1 ring-[var(--cta)]/25">
                Rehearsal {rehearsal.speed}x
              </div>
            )}
            <div className="flex h-full flex-col items-center justify-center text-center">
              <div className="mb-5 max-w-4xl">
                <div className="text-xs font-medium uppercase tracking-widest text-zinc-500">{snapshot.phase}</div>
                <h1 className="mt-2 truncate text-4xl font-semibold tracking-tight text-zinc-100" title={currentTitle}>{currentTitle}</h1>
                {speaker && <p className="mt-2 text-lg text-zinc-400">{speaker}</p>}
              </div>
              <Countdown snapshot={snapshot} skewMs={effectiveSkew} />
            </div>
          </div>

          <aside className="flex flex-col gap-4">
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
            <div className="rounded-xl border border-white/5 bg-zinc-900/50 p-4">
              <MessageInput
                snapshot={snapshot}
                onSetMessage={(text) => safe(offline.setMessage(text))}
                onClearMessage={() => safe(offline.clearMessage())}
              />
            </div>
            <div className="rounded-xl border border-white/5 bg-zinc-900/50 p-4">
              <h2 className="text-sm font-medium text-zinc-200">Upcoming</h2>
              <div className="mt-3 space-y-2">
                {(scheduleQuery.data ?? []).slice(0, 5).map((item) => (
                  <div key={item.id} className={`rounded-lg px-3 py-2 text-sm ${item.id === snapshot.currentItem?.id ? "bg-white/10 text-zinc-100" : "bg-white/[0.03] text-zinc-400"}`}>
                    <div className="truncate font-medium">{item.title}</div>
                    <div className="text-xs text-zinc-500">{new Date(item.scheduledStartUtc).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </section>
      </div>
    </div>
  );
}
