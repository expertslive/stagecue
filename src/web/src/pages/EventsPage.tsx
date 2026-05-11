import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useState } from "react";
import { events } from "@/api/events";
import Button from "@/components/ui/Button";
import SkeletonRow from "@/components/ui/SkeletonRow";
import CreateEventSheet from "@/components/events/CreateEventSheet";
import { Plus, Calendar } from "lucide-react";

export default function EventsPage() {
  const eventsQuery = useQuery({ queryKey: ["events"], queryFn: events.list });
  const [creating, setCreating] = useState(false);

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Events</h1>
        <Button leadingIcon={<Plus className="size-4" />} onClick={() => setCreating(true)}>New event</Button>
      </div>

      {eventsQuery.isLoading && <SkeletonRow count={3} />}
      {eventsQuery.error && <p className="text-sm text-red-400">Couldn't load events.</p>}

      {eventsQuery.data && eventsQuery.data.length > 0 && (
        <ul className="space-y-2">
          {eventsQuery.data.map((ev) => (
            <li key={ev.id} className="rounded border border-zinc-800 bg-zinc-900 transition-colors hover:bg-zinc-800/60">
              <Link to={`/events/${ev.id}`} className="block w-full p-4">
                <div className="font-medium">{ev.name}</div>
                <div className="text-xs text-zinc-400">{new Date(ev.startsAtUtc).toLocaleString()}</div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {eventsQuery.data && eventsQuery.data.length === 0 && (
        <div className="rounded-lg border border-dashed border-zinc-800 p-10 text-center">
          <Calendar className="mx-auto size-10 text-zinc-600" />
          <h2 className="mt-3 text-lg font-medium">Create your first event</h2>
          <p className="mt-1 text-sm text-zinc-500">
            An event groups one or more rooms, each with its own schedule and timer.
          </p>
          <div className="mt-4">
            <Button leadingIcon={<Plus className="size-4" />} onClick={() => setCreating(true)}>New event</Button>
          </div>
        </div>
      )}

      <CreateEventSheet open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}
