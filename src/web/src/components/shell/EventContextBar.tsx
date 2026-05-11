import { Link, useLocation, useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { events } from "@/api/events";
import { auth } from "@/api/auth";
import { useAuthStore } from "@/state/authStore";
import { useRoomEvent } from "@/hooks/useRoomEvent";
import Wordmark from "@/components/shell/Wordmark";
import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const SETUP_SEGMENTS = ["templates", "branding", "members", "audit"];

export default function EventContextBar() {
  const { eventId, roomId } = useParams();
  const location = useLocation();
  const eventsQuery = useQuery({ queryKey: ["events"], queryFn: events.list });

  // Resolve current event from either /events/:eventId/* or /rooms/:roomId/*.
  const fromEventsRoute = eventsQuery.data?.find((e) => e.id === eventId);
  const { event: fromRoomRoute, room } = useRoomEvent(roomId);
  const current = fromEventsRoute ?? fromRoomRoute;

  const onSetupTab = SETUP_SEGMENTS.some((s) => location.pathname.includes(`/${s}`));
  const onRunTab = !!eventId && !onSetupTab;

  return (
    <header className="sticky top-0 z-40 flex items-center justify-between border-b border-white/5 bg-zinc-950/95 px-6 py-3 backdrop-blur">
      <div className="flex items-center gap-2 min-w-0">
        <Link to="/" aria-label="Stagecue home"><Wordmark size="sm" /></Link>
        {current && (
          <>
            <Separator />
            <EventSwitcher current={current} events={eventsQuery.data ?? []} />
            {room && (
              <>
                <Separator />
                <Link
                  to={`/rooms/${room.id}`}
                  className="truncate rounded px-2 py-1 text-sm font-medium hover:bg-zinc-800"
                  title={room.name}
                >
                  {room.name}
                </Link>
              </>
            )}
          </>
        )}
      </div>
      <div className="flex items-center gap-4">
        {current && !room && (
          <nav className="flex items-center gap-1 text-sm">
            <TabLink to={`/events/${current.id}`} active={onRunTab}>Run</TabLink>
            <TabLink to={`/events/${current.id}/templates`} active={onSetupTab}>Setup</TabLink>
          </nav>
        )}
        <SignOutButton />
      </div>
    </header>
  );
}

function Separator() {
  return <span className="text-zinc-700">/</span>;
}

function TabLink({ to, active, children }: { to: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className={`rounded px-3 py-1.5 transition-colors ${active ? "bg-zinc-800 text-zinc-100" : "text-zinc-400 hover:text-zinc-100"}`}
    >
      {children}
    </Link>
  );
}

function EventSwitcher({ current, events }: { current: { id: string; name: string }; events: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((s) => !s)}
        className="flex items-center gap-1 rounded px-2 py-1 text-sm font-medium hover:bg-zinc-800"
      >
        {current.name}
        <ChevronDown className="size-3.5 text-zinc-500" />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 min-w-[200px] rounded-md border border-white/10 bg-zinc-900/80 py-1 shadow-lg">
          {events.map((e) => (
            <Link
              key={e.id} to={`/events/${e.id}`} onClick={() => setOpen(false)}
              className={`block px-3 py-1.5 text-sm hover:bg-zinc-800 ${e.id === current.id ? "text-zinc-100" : "text-zinc-400"}`}
            >
              {e.name}
            </Link>
          ))}
        </div>
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
