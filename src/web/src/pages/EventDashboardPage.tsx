import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { events } from "@/api/events";
import { rooms as roomsApi } from "@/api/rooms";
import type { RoomDto } from "@/api/types";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import Skeleton from "@/components/ui/Skeleton";
import SkeletonRow from "@/components/ui/SkeletonRow";
import RoomFormSheet from "@/components/events/RoomFormSheet";
import { Plus, Pencil, Trash2, RotateCcw, DoorOpen } from "lucide-react";

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
  const [creatingRoom, setCreatingRoom] = useState(false);
  const [editingRoom, setEditingRoom] = useState<RoomDto | null>(null);
  const [pendingDeleteRoom, setPendingDeleteRoom] = useState<RoomDto | null>(null);

  const rotateLobby = useMutation({
    mutationFn: () => events.regenerateLobbyAccessCode(eventId!),
    onSuccess: (next) => qc.setQueryData(["event", eventId], next),
  });

  const rotateRoom = useMutation({
    mutationFn: (roomId: string) => roomsApi.regenerateAccessCode(eventId!, roomId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rooms", eventId] }),
  });

  const deleteRoom = useMutation({
    mutationFn: (roomId: string) => roomsApi.remove(eventId!, roomId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rooms", eventId] }),
  });

  if (!eventId) return <div className="p-8 text-red-400">Missing event id.</div>;
  if (evQuery.isLoading || roomsQuery.isLoading) {
    return (
      <div className="p-8 max-w-5xl mx-auto space-y-6">
        <Skeleton className="h-6 w-48" />
        <SkeletonRow count={2} />
      </div>
    );
  }
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

  function confirmDeleteRoom() {
    if (!pendingDeleteRoom) return;
    const name = pendingDeleteRoom.name;
    deleteRoom.mutate(pendingDeleteRoom.id, {
      onSuccess: () => toast.show({ message: `Removed "${name}"` }),
      onError: (e: Error) => toast.show({ message: e.message, tone: "error" }),
    });
    setPendingDeleteRoom(null);
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

      <div className="flex items-center justify-between">
        <h2 className="text-sm uppercase tracking-widest text-zinc-500">Rooms</h2>
        {rooms.length > 0 && (
          <Button size="sm" leadingIcon={<Plus className="size-4" />} onClick={() => setCreatingRoom(true)}>
            Add room
          </Button>
        )}
      </div>

      {rooms.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-800 p-10 text-center">
          <DoorOpen className="mx-auto size-10 text-zinc-600" />
          <h3 className="mt-3 text-lg font-medium">No rooms yet</h3>
          <p className="mt-1 text-sm text-zinc-500">
            Add a stage, studio, or breakout room — each gets its own timer, schedule, and access codes.
          </p>
          <div className="mt-4">
            <Button leadingIcon={<Plus className="size-4" />} onClick={() => setCreatingRoom(true)}>
              Add room
            </Button>
          </div>
        </div>
      ) : (
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {rooms.map((r) => (
            <li key={r.id} className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-medium text-lg">{r.name}</div>
                  <code className="text-xs text-zinc-500">{formatCode(r.accessCode)}</code>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    title="Edit room"
                    onClick={() => setEditingRoom(r)}
                    className="rounded p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
                  >
                    <Pencil className="size-4" />
                  </button>
                  <button
                    type="button"
                    title="Reset access code"
                    onClick={() => setPendingRotate({ kind: "room", id: r.id, name: r.name })}
                    disabled={rotateRoom.isPending}
                    className="rounded p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-50"
                  >
                    <RotateCcw className="size-4" />
                  </button>
                  <button
                    type="button"
                    title="Delete room"
                    onClick={() => setPendingDeleteRoom(r)}
                    className="rounded p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-red-400"
                  >
                    <Trash2 className="size-4" />
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
        </ul>
      )}

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

      <ConfirmDialog
        open={pendingDeleteRoom !== null}
        tone="danger"
        title="Delete room?"
        message={
          pendingDeleteRoom
            ? <>This removes <strong>{pendingDeleteRoom.name}</strong> from the event along with its schedule and timer state. Speaker and door displays using its access code will disconnect.</>
            : ""
        }
        confirmLabel="Delete room"
        onConfirm={confirmDeleteRoom}
        onCancel={() => setPendingDeleteRoom(null)}
      />

      <RoomFormSheet eventId={eventId} open={creatingRoom} onClose={() => setCreatingRoom(false)} />
      <RoomFormSheet
        eventId={eventId}
        open={editingRoom !== null}
        initial={editingRoom ?? undefined}
        onClose={() => setEditingRoom(null)}
      />
    </div>
  );
}

function formatCode(code: string): string {
  return code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}
