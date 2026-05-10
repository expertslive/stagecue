import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { events } from "@/api/events";

export default function EventDashboardPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const evQuery = useQuery({ queryKey: ["event", eventId], queryFn: () => events.get(eventId!), enabled: !!eventId });
  const roomsQuery = useQuery({ queryKey: ["rooms", eventId], queryFn: () => events.rooms(eventId!), enabled: !!eventId });

  if (!eventId) return <div className="p-8 text-red-400">Missing event id.</div>;
  if (evQuery.isLoading || roomsQuery.isLoading) return <div className="p-8">Loading…</div>;
  if (evQuery.error || roomsQuery.error) return <div className="p-8 text-red-400">Failed to load.</div>;

  const ev = evQuery.data!;
  const rooms = roomsQuery.data!;

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <Link to="/" className="text-sm text-zinc-400 hover:text-zinc-200">← All events</Link>
      <div className="flex items-baseline gap-4 flex-wrap">
        <h1 className="text-2xl font-semibold">{ev.name}</h1>
        <span className="text-sm text-zinc-500">lobby code <code>{formatCode(ev.lobbyAccessCode)}</code></span>
        <Link to={`/e/${formatCode(ev.lobbyAccessCode)}/lobby`} target="_blank" className="text-sm text-blue-400 hover:underline">Open lobby →</Link>
        <Link to={`/events/${ev.id}/templates`} className="text-sm text-blue-400 hover:underline">Templates</Link>
      </div>
      <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {rooms.map((r) => (
          <li key={r.id} className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 space-y-2">
            <div className="flex items-baseline justify-between">
              <div className="font-medium text-lg">{r.name}</div>
              <code className="text-xs text-zinc-500">{formatCode(r.accessCode)}</code>
            </div>
            <div className="flex gap-3 text-sm flex-wrap">
              <Link to={`/rooms/${r.id}`} className="text-blue-400 hover:underline">Control →</Link>
              <Link to={`/rooms/${r.id}/schedule`} className="text-blue-400 hover:underline">Schedule</Link>
              <Link to={`/r/${formatCode(r.accessCode)}/speaker`} target="_blank" className="text-blue-400 hover:underline">Speaker</Link>
              <Link to={`/r/${formatCode(r.accessCode)}/door`} target="_blank" className="text-blue-400 hover:underline">Door</Link>
            </div>
          </li>
        ))}
        {rooms.length === 0 && <li className="text-zinc-400">No rooms yet.</li>}
      </ul>
    </div>
  );
}

function formatCode(code: string): string {
  return code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}
