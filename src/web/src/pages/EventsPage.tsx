import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { events } from "@/api/events";
import { auth } from "@/api/auth";
import { useAuthStore } from "@/state/authStore";
import { useState } from "react";

export default function EventsPage() {
  const eventsQuery = useQuery({ queryKey: ["events"], queryFn: events.list });
  const [openEvent, setOpenEvent] = useState<string | null>(null);

  if (eventsQuery.isLoading) return <div className="p-8">Loading…</div>;
  if (eventsQuery.error) return <div className="p-8 text-red-400">Failed to load events.</div>;

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Events</h1>
        <SignOutButton />
      </div>
      <ul className="space-y-2">
        {eventsQuery.data!.map((ev) => (
          <li key={ev.id} className="rounded border border-zinc-800 bg-zinc-900">
            <button
              className="w-full text-left p-4 hover:bg-zinc-800/60"
              onClick={() => setOpenEvent(openEvent === ev.id ? null : ev.id)}
            >
              <div className="font-medium">{ev.name}</div>
              <div className="text-xs text-zinc-400">
                {new Date(ev.startsAtUtc).toLocaleString()} — lobby code {ev.lobbyAccessCode}
              </div>
            </button>
            {openEvent === ev.id && <RoomList eventId={ev.id} />}
          </li>
        ))}
      </ul>
      {eventsQuery.data!.length === 0 && (
        <p className="text-zinc-400">No events yet. Seed the dev data with <code>--seed</code> or create one via the API.</p>
      )}
    </div>
  );
}

function RoomList({ eventId }: { eventId: string }) {
  const roomsQuery = useQuery({ queryKey: ["rooms", eventId], queryFn: () => events.rooms(eventId) });
  if (roomsQuery.isLoading) return <div className="p-4 text-sm text-zinc-400">Loading rooms…</div>;
  if (roomsQuery.error) return <div className="p-4 text-sm text-red-400">Failed to load rooms.</div>;
  return (
    <ul className="border-t border-zinc-800 divide-y divide-zinc-800">
      {roomsQuery.data!.map((r) => (
        <li key={r.id} className="p-4 flex items-center justify-between">
          <div>
            <div className="font-medium">{r.name}</div>
            <div className="text-xs text-zinc-400">access code {r.accessCode}</div>
          </div>
          <Link to={`/rooms/${r.id}`} className="text-blue-400 hover:underline text-sm">Open control →</Link>
        </li>
      ))}
    </ul>
  );
}

function SignOutButton() {
  const nav = useNavigate();
  const signOut = useAuthStore((s) => s.signOut);
  return (
    <button
      onClick={async () => { await auth.signOut(); signOut(); nav("/signin"); }}
      className="text-sm text-zinc-400 hover:text-zinc-200">
      Sign out
    </button>
  );
}
