import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { useState } from "react";
import { members, roleNumeric, type EventRoleName } from "@/api/members";
import { invitations } from "@/api/invitations";
import { Trash2, Copy } from "lucide-react";
import { roleLabel, roleDescription } from "@/lib/roleLabels";
import ConfirmDialog from "@/components/ui/ConfirmDialog";

export default function MembersPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const qc = useQueryClient();
  const memberQuery = useQuery({ queryKey: ["members", eventId], queryFn: () => members.list(eventId!), enabled: !!eventId });
  const inviteQuery = useQuery({ queryKey: ["invitations", eventId], queryFn: () => invitations.list(eventId!), enabled: !!eventId });

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<EventRoleName>("Viewer");
  const [pendingRemoveMember, setPendingRemoveMember] = useState<{ id: string; email: string } | null>(null);
  const [pendingRevoke, setPendingRevoke] = useState<{ id: string; email: string } | null>(null);

  const create = useMutation({
    mutationFn: () => invitations.create(eventId!, { email, role: roleNumeric[role] }),
    onSuccess: () => { setEmail(""); qc.invalidateQueries({ queryKey: ["invitations", eventId] }); },
  });
  const removeMember = useMutation({
    mutationFn: (id: string) => members.remove(eventId!, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["members", eventId] }),
  });
  const revoke = useMutation({
    mutationFn: (id: string) => invitations.revoke(eventId!, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["invitations", eventId] }),
  });
  const updateRole = useMutation({
    mutationFn: ({ id, r }: { id: string; r: EventRoleName }) => members.updateRole(eventId!, id, { role: roleNumeric[r], scopedRoomIds: null }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["members", eventId] }),
  });

  if (!eventId) return <div className="p-8 text-red-400">Missing event id.</div>;

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-6">
      <Link to={`/events/${eventId}`} className="text-sm text-zinc-400 hover:text-zinc-200">← Event</Link>
      <h1 className="text-2xl font-semibold">Members & invitations</h1>

      <section className="space-y-3">
        <h2 className="text-sm uppercase tracking-widest text-zinc-500">Invite</h2>
        <div className="flex gap-2 items-center flex-wrap">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@example.com"
            className="flex-1 min-w-[200px] px-3 py-2 rounded bg-zinc-900 border border-zinc-800" />
          <select value={role} onChange={(e) => setRole(e.target.value as EventRoleName)}
            className="px-3 py-2 rounded bg-zinc-900 border border-zinc-800">
            <option value="EventAdmin">{roleLabel("EventAdmin")}</option>
            <option value="RoomOperator">{roleLabel("RoomOperator")}</option>
            <option value="Viewer">{roleLabel("Viewer")}</option>
          </select>
          <button disabled={!email.trim() || create.isPending} onClick={() => create.mutate()}
            className="px-3 py-2 rounded bg-blue-600 hover:bg-blue-500 text-sm disabled:opacity-50">Invite</button>
        </div>
        <p className="text-xs text-zinc-500">{roleDescription(role)}</p>
      </section>

      <section>
        <h2 className="text-sm uppercase tracking-widest text-zinc-500 mb-2">Pending invitations</h2>
        <ul className="rounded border border-zinc-800 divide-y divide-zinc-800">
          {inviteQuery.data?.map((inv) => (
            <li key={inv.id} className="flex items-center gap-2 p-3">
              <div className="flex-1">
                <div className="text-sm">{inv.email} <span className="text-zinc-500">· {roleLabel(inv.role as EventRoleName)}</span></div>
                <div className="text-xs text-zinc-500">Expires {new Date(inv.expiresAt).toLocaleString()}</div>
              </div>
              {inv.emailSendFailed && <span className="text-xs text-orange-400">Email failed</span>}
              <button onClick={() => navigator.clipboard.writeText(inv.acceptUrl)}
                className="text-zinc-500 hover:text-zinc-300" title="Copy accept link">
                <Copy className="size-4" />
              </button>
              <button onClick={() => setPendingRevoke({ id: inv.id, email: inv.email })}
                className="text-zinc-500 hover:text-red-400">
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
          {inviteQuery.data?.length === 0 && <li className="p-3 text-sm text-zinc-500">No pending invitations.</li>}
        </ul>
      </section>

      <section>
        <h2 className="text-sm uppercase tracking-widest text-zinc-500 mb-2">Members</h2>
        <ul className="rounded border border-zinc-800 divide-y divide-zinc-800">
          {memberQuery.data?.map((m) => (
            <li key={m.id} className="flex items-center gap-2 p-3">
              <div className="flex-1">
                <div className="text-sm font-medium">{m.email}</div>
                {m.displayName && <div className="text-xs text-zinc-500">{m.displayName}</div>}
              </div>
              <select value={m.role}
                onChange={(e) => updateRole.mutate({ id: m.id, r: e.target.value as EventRoleName })}
                className="px-2 py-1 rounded bg-zinc-900 border border-zinc-800 text-sm">
                <option value="EventAdmin">{roleLabel("EventAdmin")}</option>
                <option value="RoomOperator">{roleLabel("RoomOperator")}</option>
                <option value="Viewer">{roleLabel("Viewer")}</option>
              </select>
              <button onClick={() => setPendingRemoveMember({ id: m.id, email: m.email })}
                className="text-zinc-500 hover:text-red-400">
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      </section>
      <ConfirmDialog
        open={pendingRemoveMember !== null}
        tone="danger"
        title="Remove member?"
        message={pendingRemoveMember ? <><strong>{pendingRemoveMember.email}</strong> will lose access to this event.</> : ""}
        confirmLabel="Remove"
        onConfirm={() => {
          if (pendingRemoveMember) removeMember.mutate(pendingRemoveMember.id);
          setPendingRemoveMember(null);
        }}
        onCancel={() => setPendingRemoveMember(null)}
      />
      <ConfirmDialog
        open={pendingRevoke !== null}
        tone="danger"
        title="Revoke invitation?"
        message={pendingRevoke ? <><strong>{pendingRevoke.email}</strong> won't be able to accept this invitation anymore.</> : ""}
        confirmLabel="Revoke"
        onConfirm={() => {
          if (pendingRevoke) revoke.mutate(pendingRevoke.id);
          setPendingRevoke(null);
        }}
        onCancel={() => setPendingRevoke(null)}
      />
    </div>
  );
}
