import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { events } from "@/api/events";
import { auth } from "@/api/auth";
import { useAuthStore } from "@/state/authStore";

export default function EventsPage() {
  const eventsQuery = useQuery({ queryKey: ["events"], queryFn: events.list });

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
          <li key={ev.id} className="rounded border border-zinc-800 bg-zinc-900 hover:bg-zinc-800/60">
            <Link to={`/events/${ev.id}`} className="block w-full p-4">
              <div className="font-medium">{ev.name}</div>
              <div className="text-xs text-zinc-400">
                {new Date(ev.startsAtUtc).toLocaleString()} — lobby code {ev.lobbyAccessCode}
              </div>
            </Link>
          </li>
        ))}
      </ul>
      {eventsQuery.data!.length === 0 && (
        <p className="text-zinc-400">No events yet. Seed the dev data with <code>--seed</code> or create one via the API.</p>
      )}
    </div>
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
