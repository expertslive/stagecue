import { useQueries } from "@tanstack/react-query";
import { CheckCircle2, CircleAlert } from "lucide-react";
import { scheduleItems } from "@/api/scheduleItems";
import type { EventDto, RoomDto } from "@/api/types";
import type { DisplayPresence } from "@/hub/timerHub";
import { evaluatePreflight } from "@/lib/preflight";
import Card from "@/components/ui/Card";

export default function PreflightPanel({ event, rooms, presence }: { event: EventDto; rooms: RoomDto[]; presence: DisplayPresence }) {
  const scheduleQueries = useQueries({
    queries: rooms.map((room) => ({
      queryKey: ["schedule", room.id],
      queryFn: () => scheduleItems.list(room.id),
      staleTime: 30_000,
    })),
  });

  const schedules = Object.fromEntries(rooms.map((room, index) => [room.id, scheduleQueries[index]?.data ?? []]));
  const result = evaluatePreflight(event, rooms, schedules, presence);
  const loading = scheduleQueries.some((q) => q.isLoading);

  return (
    <Card density="comfortable" className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-zinc-200">Preflight</h2>
          <p className="text-sm text-zinc-500">Show-day readiness across schedule, screens, and event setup.</p>
        </div>
        <span className={`inline-flex self-start rounded-full px-3 py-1.5 text-sm font-medium ring-1 ${
          result.ready
            ? "bg-emerald-500/10 text-emerald-300 ring-emerald-500/20"
            : "bg-amber-500/10 text-amber-300 ring-amber-500/20"
        }`}>
          {loading ? "Checking…" : result.ready ? "Ready" : "Needs attention"}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {result.items.map((item) => (
          <div key={item.id} className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
            <div className="flex items-center gap-2">
              {item.ok ? <CheckCircle2 className="size-4 text-emerald-400" /> : <CircleAlert className="size-4 text-amber-400" />}
              <span className="text-sm font-medium text-zinc-200">{item.label}</span>
            </div>
            <p className="mt-1 text-xs text-zinc-500">{item.detail}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}
