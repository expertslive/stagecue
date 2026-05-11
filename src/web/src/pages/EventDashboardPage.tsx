import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { events } from "@/api/events";
import { rooms as roomsApi } from "@/api/rooms";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";

export default function EventDashboardPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const qc = useQueryClient();
  const evQuery = useQuery({ queryKey: ["event", eventId], queryFn: () => events.get(eventId!), enabled: !!eventId });
  const roomsQuery = useQuery({ queryKey: ["rooms", eventId], queryFn: () => events.rooms(eventId!), enabled: !!eventId });

  const toast = useToast();
  const [pendingRotate, setPendingRotate] = useState<
    | { kind: "lobby" }
    | { kind: "room"; id: string; name: string }
    | null
  >(null);

  const rotateLobby = useMutation({
    mutationFn: () => events.regenerateLobbyAccessCode(eventId!),
    onSuccess: (next) => qc.setQueryData(["event", eventId], next),
  });

  const rotateRoom = useMutation({
    mutationFn: (roomId: string) => roomsApi.regenerateAccessCode(eventId!, roomId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rooms", eventId] }),
  });

  if (!eventId) return <div className="p-8 text-red-400">Missing event id.</div>;
  if (evQuery.isLoading || roomsQuery.isLoading) return <div className="p-8">Loading…</div>;
  if (evQuery.error || roomsQuery.error) return <div className="p-8 text-red-400">Failed to load.</div>;

  const ev = evQuery.data!;
  const rooms = roomsQuery.data!;

  function confirmRotate() {
    if (!pendingRotate) return;
    if (pendingRotate.kind === "lobby") {
      rotateLobby.mutate(undefined, {
        onSuccess: () => toast.show({ message: "Lobby access code reset" }),
        onError: (e: Error) => toast.show({ message: e.message, tone: "error" }),
      });
    } else {
      const name = pendingRotate.name;
      rotateRoom.mutate(pendingRotate.id, {
        onSuccess: () => toast.show({ message: `Access code reset for ${name}` }),
        onError: (e: Error) => toast.show({ message: e.message, tone: "error" }),
      });
    }
    setPendingRotate(null);
  }

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex items-baseline gap-4 flex-wrap">
        <h1 className="text-2xl font-semibold">{ev.name}</h1>
        <span className="text-sm text-zinc-500">lobby code <code>{formatCode(ev.lobbyAccessCode)}</code></span>
        <button
          type="button"
          onClick={() => setPendingRotate({ kind: "lobby" })}
          disabled={rotateLobby.isPending}
          className="text-xs text-zinc-400 hover:text-zinc-200 underline disabled:opacity-50"
        >
          {rotateLobby.isPending ? "Resetting…" : "Reset access code"}
        </button>
        <Link to={`/e/${formatCode(ev.lobbyAccessCode)}/lobby`} target="_blank" className="text-sm text-blue-400 hover:underline">Open lobby →</Link>
      </div>
<ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {rooms.map((r) => (
          <li key={r.id} className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 space-y-2">
            <div className="flex items-baseline justify-between">
              <div className="font-medium text-lg">{r.name}</div>
              <div className="flex items-baseline gap-2">
                <code className="text-xs text-zinc-500">{formatCode(r.accessCode)}</code>
                <button
                  type="button"
                  onClick={() => setPendingRotate({ kind: "room", id: r.id, name: r.name })}
                  disabled={rotateRoom.isPending}
                  className="text-xs text-zinc-400 hover:text-zinc-200 underline disabled:opacity-50"
                >
                  Reset access code
                </button>
              </div>
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
      <ConfirmDialog
        open={pendingRotate !== null}
        tone="danger"
        title="Reset access code?"
        message={
          pendingRotate?.kind === "lobby"
            ? "The current lobby code will stop working. Anyone viewing the lobby — including signage and audience devices — will be disconnected and need the new code."
            : pendingRotate?.kind === "room"
              ? <>The current access code for <strong>{pendingRotate.name}</strong> will stop working. Any speaker view or door display using this code will be disconnected.</>
              : ""
        }
        confirmLabel="Reset code"
        onConfirm={confirmRotate}
        onCancel={() => setPendingRotate(null)}
      />
    </div>
  );
}

function formatCode(code: string): string {
  return code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}
