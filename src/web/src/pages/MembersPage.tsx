import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { useState } from "react";
import { members, roleNumeric, type EventRoleName, type MemberDto } from "@/api/members";
import { invitations } from "@/api/invitations";
import { Trash2, Copy, Lock } from "lucide-react";
import { roleLabel, roleDescription } from "@/lib/roleLabels";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import Button from "@/components/ui/Button";
import SetupNav from "@/components/shell/SetupNav";
import MemberActionsMenu, { type MemberAction } from "@/components/members/MemberActionsMenu";
import EditMemberSheet from "@/components/members/EditMemberSheet";
import SetTempPasswordSheet from "@/components/members/SetTempPasswordSheet";
import { useToast } from "@/components/ui/toastContext";
import { apiErrorMessage } from "@/lib/apiErrors";

export default function MembersPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const qc = useQueryClient();
  const toast = useToast();
  const memberQuery = useQuery({ queryKey: ["members", eventId], queryFn: () => members.list(eventId!), enabled: !!eventId });
  const inviteQuery = useQuery({ queryKey: ["invitations", eventId], queryFn: () => invitations.list(eventId!), enabled: !!eventId });

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<EventRoleName>("Viewer");
  const [pendingRemoveMember, setPendingRemoveMember] = useState<MemberDto | null>(null);
  const [pendingRevoke, setPendingRevoke] = useState<{ id: string; email: string } | null>(null);
  const [pendingLock, setPendingLock] = useState<MemberDto | null>(null);
  const [editing, setEditing] = useState<MemberDto | null>(null);
  const [settingPasswordFor, setSettingPasswordFor] = useState<MemberDto | null>(null);

  const refreshMembers = () => qc.invalidateQueries({ queryKey: ["members", eventId] });
  const showError = (e: unknown) => toast.show({ message: apiErrorMessage(e), tone: "error" });

  const create = useMutation({
    mutationFn: () => invitations.create(eventId!, { email, role: roleNumeric[role] }),
    onSuccess: () => { setEmail(""); qc.invalidateQueries({ queryKey: ["invitations", eventId] }); },
  });
  const removeMember = useMutation({
    mutationFn: (id: string) => members.remove(eventId!, id),
    onSuccess: refreshMembers,
    onError: showError,
  });
  const revoke = useMutation({
    mutationFn: (id: string) => invitations.revoke(eventId!, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["invitations", eventId] }),
  });
  const updateRole = useMutation({
    mutationFn: ({ id, r }: { id: string; r: EventRoleName }) =>
      members.updateRole(eventId!, id, { role: roleNumeric[r], scopedRoomIds: null }),
    onSuccess: refreshMembers,
    onError: showError,
  });
  const sendResetLink = useMutation({
    mutationFn: (id: string) => members.sendResetLink(eventId!, id),
    onSuccess: (data, _id) => {
      if (data.emailSent) toast.show({ message: "Reset link sent." });
      else toast.show({ message: "Couldn't send email — try setting a temporary password instead.", tone: "error" });
    },
    onError: showError,
  });
  const setTempPassword = useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) => members.setTempPassword(eventId!, id, password),
    onError: showError,
  });
  const updateProfile = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { displayName: string | null; email: string } }) =>
      members.updateProfile(eventId!, id, body),
    onSuccess: () => { refreshMembers(); toast.show({ message: "Profile updated." }); },
    onError: showError,
  });
  const lock = useMutation({
    mutationFn: (id: string) => members.lock(eventId!, id),
    onSuccess: () => { refreshMembers(); toast.show({ message: "Account locked." }); },
    onError: showError,
  });
  const unlock = useMutation({
    mutationFn: (id: string) => members.unlock(eventId!, id),
    onSuccess: () => { refreshMembers(); toast.show({ message: "Account unlocked." }); },
    onError: showError,
  });

  function handleAction(member: MemberDto, action: MemberAction) {
    switch (action) {
      case "edit": setEditing(member); return;
      case "send-reset-link": sendResetLink.mutate(member.id); return;
      case "set-temp-password": setSettingPasswordFor(member); return;
      case "lock": setPendingLock(member); return;
      case "unlock": unlock.mutate(member.id); return;
      case "remove": setPendingRemoveMember(member); return;
    }
  }

  if (!eventId) return <div className="p-8 text-red-400">Missing event id.</div>;

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <SetupNav eventId={eventId} />
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">Members & invitations</h1>

        <section className="space-y-3">
          <h2 className="text-base font-semibold text-zinc-200">Invite</h2>
          <div className="flex gap-2 items-center flex-wrap">
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@example.com"
              className="flex-1 min-w-[200px] px-3 py-2 rounded bg-zinc-950/60 border border-white/10" />
            <select value={role} onChange={(e) => setRole(e.target.value as EventRoleName)}
              className="px-3 py-2 rounded bg-zinc-950/60 border border-white/10">
              <option value="EventAdmin">{roleLabel("EventAdmin")}</option>
              <option value="RoomOperator">{roleLabel("RoomOperator")}</option>
              <option value="Viewer">{roleLabel("Viewer")}</option>
            </select>
            <Button disabled={!email.trim() || create.isPending} onClick={() => create.mutate()}>
              Invite
            </Button>
          </div>
          <p className="text-xs text-zinc-500">{roleDescription(role)}</p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-zinc-200 mb-3">Pending invitations</h2>
          <ul className="rounded-xl border border-white/5 divide-y divide-white/5">
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
            {inviteQuery.data?.length === 0 && <li className="p-6 text-center text-sm text-zinc-500">No invitations waiting.</li>}
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold text-zinc-200 mb-3">Members</h2>
          <ul className="rounded-xl border border-white/5 divide-y divide-white/5">
            {memberQuery.data?.map((m) => (
              <li key={m.id} className="flex items-center gap-2 p-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{m.email}</span>
                    {m.isLocked && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-300 ring-1 ring-amber-500/20">
                        <Lock className="size-3" />
                        Locked
                      </span>
                    )}
                  </div>
                  {m.displayName && <div className="text-xs text-zinc-500 truncate">{m.displayName}</div>}
                </div>
                <select value={m.role}
                  onChange={(e) => updateRole.mutate({ id: m.id, r: e.target.value as EventRoleName })}
                  className="px-2 py-1 rounded bg-zinc-950/60 border border-white/10 text-sm">
                  <option value="EventAdmin">{roleLabel("EventAdmin")}</option>
                  <option value="RoomOperator">{roleLabel("RoomOperator")}</option>
                  <option value="Viewer">{roleLabel("Viewer")}</option>
                </select>
                <MemberActionsMenu isLocked={m.isLocked} onSelect={(a) => handleAction(m, a)} />
              </li>
            ))}
            {memberQuery.data?.length === 0 && <li className="p-6 text-center text-sm text-zinc-500">No members yet — invite one above.</li>}
          </ul>
        </section>
      </div>

      <EditMemberSheet
        open={editing !== null}
        member={editing}
        onClose={() => setEditing(null)}
        onSubmit={async ({ displayName, email }) => {
          if (!editing) return;
          await updateProfile.mutateAsync({ id: editing.id, body: { displayName, email } });
        }}
      />

      <SetTempPasswordSheet
        open={settingPasswordFor !== null}
        member={settingPasswordFor}
        onClose={() => setSettingPasswordFor(null)}
        onSubmit={async (newPassword) => {
          if (!settingPasswordFor) return;
          await setTempPassword.mutateAsync({ id: settingPasswordFor.id, password: newPassword });
        }}
      />

      <ConfirmDialog
        open={pendingLock !== null}
        tone="danger"
        title="Lock this account?"
        message={pendingLock ? <><strong>{pendingLock.email}</strong> will be unable to sign in until you unlock the account. They will be signed out of any current session.</> : ""}
        confirmLabel="Lock account"
        onConfirm={() => {
          if (pendingLock) lock.mutate(pendingLock.id);
          setPendingLock(null);
        }}
        onCancel={() => setPendingLock(null)}
      />

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
