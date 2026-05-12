import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { audit } from "@/api/audit";
import { useState } from "react";
import SetupNav from "@/components/shell/SetupNav";
import { humaniseAudit } from "@/lib/auditHumanise";

export default function AuditPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const list = useQuery({ queryKey: ["audit", eventId], queryFn: () => audit.list(eventId!), enabled: !!eventId });
  const [filter, setFilter] = useState("");

  if (!eventId) return <div className="p-8 text-red-400">Missing event id.</div>;

  const rows = (list.data ?? []).filter((r) => {
    if (!filter) return true;
    const f = filter.toLowerCase();
    const { verb } = humaniseAudit(r.action, r.detailsJson);
    return (
      verb.toLowerCase().includes(f) ||
      r.action.toLowerCase().includes(f) ||
      (r.userEmail ?? "").toLowerCase().includes(f) ||
      (r.roomName ?? "").toLowerCase().includes(f)
    );
  });

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <SetupNav eventId={eventId} />
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">Audit log</h1>
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by action / user / room"
          className="w-full px-3 py-2 rounded bg-zinc-950/60 border border-white/10 text-sm"
        />
        <ul className="rounded-xl border border-white/5 divide-y divide-white/5 text-sm">
          {rows.map((r) => {
            const { verb, detail } = humaniseAudit(r.action, r.detailsJson);
            return (
              <li key={r.id} className="grid grid-cols-[160px_1fr_160px_140px] gap-3 px-3 py-2 items-baseline">
                <span className="text-xs font-mono text-zinc-500">{new Date(r.atUtc).toLocaleString()}</span>
                <span className="min-w-0">
                  <span className="text-zinc-100">{verb}</span>
                  {detail && <span className="ml-2 text-xs text-zinc-500">{detail}</span>}
                </span>
                <span className="text-xs text-zinc-400 truncate" title={r.userEmail ?? "system"}>
                  {r.userEmail ?? <span className="text-zinc-600">system</span>}
                </span>
                <span className="text-xs text-zinc-500 truncate" title={r.roomName ?? "—"}>
                  {r.roomName ?? <span className="text-zinc-700">—</span>}
                </span>
              </li>
            );
          })}
          {rows.length === 0 && <li className="p-3 text-sm text-zinc-500">No entries.</li>}
        </ul>
      </div>
    </div>
  );
}
