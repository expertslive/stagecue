import { Link, useLocation } from "react-router-dom";

const TABS = [
  { id: "programmes", label: "Programmes" },
  { id: "templates", label: "Templates" },
  { id: "branding", label: "Branding" },
  { id: "members", label: "Members" },
  { id: "audit", label: "Audit log" },
] as const;

interface Props { eventId: string }

export default function SetupNav({ eventId }: Props) {
  const location = useLocation();
  return (
    <nav
      aria-label="Event setup sections"
      className="flex gap-1 border-b border-white/5 -mx-8 px-8 mb-4"
    >
      {TABS.map((t) => {
        const to = `/events/${eventId}/${t.id}`;
        const active = location.pathname === to;
        return (
          <Link
            key={t.id}
            to={to}
            aria-current={active ? "page" : undefined}
            className={`relative px-3 py-2 text-sm transition-colors ${
              active
                ? "text-zinc-100"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {t.label}
            {active && (
              <span
                aria-hidden="true"
                className="absolute inset-x-2 bottom-0 h-0.5 rounded-full"
                style={{ background: "var(--cta)" }}
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
