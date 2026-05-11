import { Link } from "react-router-dom";
import type { ScheduleItemDto } from "@/api/types";
import { Pencil } from "lucide-react";

interface Props {
  items: ScheduleItemDto[];
  currentItemId: string | null;
  /** Link target for the "Edit schedule" affordance. */
  editHref: string;
}

/**
 * Compact, read-only schedule rail. Lives on the operator console at lg+ width.
 * Schedule editing happens on the dedicated `/rooms/:id/schedule` page.
 */
export default function ScheduleRail({ items, currentItemId, editHref }: Props) {
  return (
    <aside className="rounded-2xl border border-white/5 bg-zinc-900/60 backdrop-blur-sm overflow-hidden">
      <header className="flex items-center justify-between border-b border-white/5 px-4 py-3">
        <h2 className="text-sm font-semibold text-zinc-200">Schedule</h2>
        <Link
          to={editHref}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
          aria-label="Edit schedule"
        >
          <Pencil className="size-3.5" />
          Edit
        </Link>
      </header>
      <ol className="max-h-[calc(100vh-220px)] overflow-y-auto divide-y divide-white/5">
        {items.map((item) => {
          const isCurrent = item.id === currentItemId;
          return (
            <li
              key={item.id}
              className={`relative px-4 py-3 ${isCurrent ? "bg-white/[0.03]" : ""}`}
            >
              {isCurrent && (
                <span
                  aria-hidden="true"
                  className="absolute inset-y-3 left-0 w-0.5 rounded-r"
                  style={{ background: "var(--cta)" }}
                />
              )}
              <div className={`text-sm font-medium ${isCurrent ? "text-zinc-100" : "text-zinc-300"} truncate`} title={item.title}>
                {item.title}
              </div>
              <div className="mt-0.5 flex items-center gap-2 text-xs text-zinc-500">
                <span className="tabular-nums">
                  {new Date(item.scheduledStartUtc).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
                <span>·</span>
                <span>{Math.floor(item.durationSec / 60)} min</span>
                {item.speakerName && (
                  <>
                    <span>·</span>
                    <span className="truncate">{item.speakerName}</span>
                  </>
                )}
              </div>
            </li>
          );
        })}
        {items.length === 0 && (
          <li className="px-4 py-6 text-sm text-zinc-500">
            No sessions scheduled.{" "}
            <Link to={editHref} className="text-zinc-300 hover:text-zinc-100">Add the first one →</Link>
          </li>
        )}
      </ol>
    </aside>
  );
}
