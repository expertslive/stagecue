import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { audit } from "@/api/audit";
import { useState } from "react";

export default function AuditPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const list = useQuery({ queryKey: ["audit", eventId], queryFn: () => audit.list(eventId!), enabled: !!eventId });
  const [filter, setFilter] = useState("");

  if (!eventId) return <div className="p-8 text-red-400">Missing event id.</div>;

  const rows = (list.data ?? []).filter((r) =>
    !filter ||
    r.action.toLowerCase().includes(filter.toLowerCase()) ||
    (r.userEmail ?? "").toLowerCase().includes(filter.toLowerCase()) ||
    (r.roomName ?? "").toLowerCase().includes(filter.toLowerCase()),
  );

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-4">
      <Link to={`/events/${eventId}`} className="text-sm text-zinc-400 hover:text-zinc-200">← Event</Link>
      <h1 className="text-2xl font-semibold">Audit log</h1>
      <input
        value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter by action / user / room"
        className="w-full px-3 py-2 rounded bg-zinc-900 border border-zinc-800 text-sm" />
      <ul className="rounded border border-zinc-800 divide-y divide-zinc-800 font-mono text-xs">
        {rows.map((r) => (
          <li key={r.id} className="grid grid-cols-[140px_120px_140px_1fr_2fr] gap-3 p-2">
            <span className="text-zinc-500">{new Date(r.atUtc).toLocaleString()}</span>
            <span className="text-blue-400">{r.action}</span>
            <span className="text-zinc-400 truncate">{r.userEmail ?? "system"}</span>
            <span className="text-zinc-400 truncate">{r.roomName ?? "—"}</span>
            <span className="text-zinc-500 truncate" title={r.detailsJson}>{r.detailsJson}</span>
          </li>
        ))}
        {rows.length === 0 && <li className="p-3 text-sm text-zinc-500">No entries.</li>}
      </ul>
    </div>
  );
}
