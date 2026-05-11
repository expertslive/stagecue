import { useEffect, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { scheduleItems } from "@/api/scheduleItems";
import type { RoomDto, ScheduleItemDto } from "@/api/types";
import Card from "@/components/ui/Card";

interface Props {
  rooms: RoomDto[];
  /** Window length in minutes. Default 90. */
  windowMinutes?: number;
}

/**
 * Horizontal "next 90 minutes" timeline across all rooms. Reads each room's
 * schedule via React Query (cached against the operator console) and renders
 * one lane per room with markers for upcoming items.
 */
export default function UpcomingToday({ rooms, windowMinutes = 90 }: Props) {
  const queries = useQueries({
    queries: rooms.map((r) => ({
      queryKey: ["schedule", r.id],
      queryFn: () => scheduleItems.list(r.id),
      staleTime: 30_000,
    })),
  });

  // Tick every minute so the "now" marker and item positions stay current.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const allLoading = queries.every((q) => q.isLoading);
  if (allLoading) return null;

  const end = now + windowMinutes * 60_000;
  const lanes: Lane[] = rooms.map((r, i) => {
    const items = (queries[i].data ?? []).filter((it) => {
      const start = new Date(it.scheduledStartUtc).getTime();
      return start >= now - 5 * 60_000 && start <= end;
    });
    return { room: r, items };
  });

  const totalUpcoming = lanes.reduce((acc, l) => acc + l.items.length, 0);
  if (totalUpcoming === 0) return null;

  return (
    <Card density="comfortable">
      <div className="space-y-4">
        <header className="flex items-baseline justify-between">
          <h2 className="text-base font-semibold text-zinc-200">Up next</h2>
          <p className="text-xs text-zinc-500">Next {windowMinutes} min</p>
        </header>
        <TimeAxis windowMinutes={windowMinutes} now={now} />
        <div className="space-y-2.5">
          {lanes.map(({ room, items }) => (
            <LaneRow key={room.id} room={room} items={items} now={now} end={end} windowMs={windowMinutes * 60_000} />
          ))}
        </div>
      </div>
    </Card>
  );
}

interface Lane { room: RoomDto; items: ScheduleItemDto[] }

function TimeAxis({ windowMinutes, now }: { windowMinutes: number; now: number }) {
  // Show 4 markers across the timeline: now, +1/3, +2/3, +full.
  const stops = [0, 1 / 3, 2 / 3, 1].map((f) => {
    const t = now + f * windowMinutes * 60_000;
    return new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  });
  return (
    <div className="grid grid-cols-4 text-xs tabular-nums text-zinc-500">
      {stops.map((s, i) => (
        <div key={i} className={i === 0 ? "" : i === 3 ? "text-right" : "text-center"}>
          {s}
        </div>
      ))}
    </div>
  );
}

function LaneRow({ room, items, now, end, windowMs }: { room: RoomDto; items: ScheduleItemDto[]; now: number; end: number; windowMs: number }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-24 shrink-0 truncate text-sm text-zinc-300" title={room.name}>{room.name}</div>
      <div className="relative h-7 flex-1 overflow-hidden rounded-md bg-white/[0.03] ring-1 ring-white/5">
        {/* Now line */}
        <div
          aria-hidden="true"
          className="absolute inset-y-0 w-px"
          style={{ left: 0, background: "var(--cta)" }}
        />
        {items.map((item) => {
          const start = new Date(item.scheduledStartUtc).getTime();
          const itemStart = Math.max(start, now);
          const itemEnd = Math.min(start + item.durationSec * 1000, end);
          if (itemEnd <= itemStart) return null;
          const leftPct = ((itemStart - now) / windowMs) * 100;
          const widthPct = ((itemEnd - itemStart) / windowMs) * 100;
          return (
            <div
              key={item.id}
              className="absolute inset-y-1 rounded bg-white/[0.08] ring-1 ring-white/10 px-2 flex items-center"
              style={{ left: `${leftPct}%`, width: `${Math.max(widthPct, 4)}%` }}
              title={`${item.title} · ${new Date(start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
            >
              <span className="truncate text-[11px] font-medium text-zinc-200">{item.title}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
