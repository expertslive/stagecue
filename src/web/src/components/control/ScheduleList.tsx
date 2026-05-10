import type { ScheduleItemDto } from "@/api/types";

interface Props {
  items: ScheduleItemDto[];
  currentItemId: string | null;
}

export default function ScheduleList({ items, currentItemId }: Props) {
  return (
    <ol className="rounded border border-zinc-800 divide-y divide-zinc-800">
      {items.map((item) => (
        <li key={item.id} className={`flex justify-between p-3 ${item.id === currentItemId ? "bg-zinc-800/60" : ""}`}>
          <div>
            <div className="text-sm font-medium">{item.title}</div>
            {item.speakerName && <div className="text-xs text-zinc-500">{item.speakerName}</div>}
          </div>
          <div className="text-xs text-zinc-500 text-right">
            <div>{new Date(item.scheduledStartUtc).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
            <div>{Math.floor(item.durationSec / 60)} min</div>
          </div>
        </li>
      ))}
      {items.length === 0 && <li className="p-3 text-sm text-zinc-500">No items in this room's schedule.</li>}
    </ol>
  );
}
