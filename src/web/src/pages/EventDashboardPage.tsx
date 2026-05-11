import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { events } from "@/api/events";
import { rooms as roomsApi } from "@/api/rooms";
import type { RoomDto } from "@/api/types";
import { useEventRoomSnapshots } from "@/hub/useEventRoomSnapshots";
import EventIdentity from "@/components/events/EventIdentity";
import LobbyCard from "@/components/events/LobbyCard";
import RoomTile from "@/components/events/RoomTile";
import UpcomingToday from "@/components/events/UpcomingToday";
import PreflightPanel from "@/components/events/PreflightPanel";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { useToast } from "@/components/ui/toastContext";
import Skeleton from "@/components/ui/Skeleton";
import SkeletonRow from "@/components/ui/SkeletonRow";
import RoomFormSheet from "@/components/events/RoomFormSheet";
import DoorDisplaySettingsSheet from "@/components/events/DoorDisplaySettingsSheet";
import RoomPanel from "@/components/events/RoomPanel";
import { apiErrorMessage } from "@/lib/apiErrors";
import { Plus, DoorOpen } from "lucide-react";

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
  const [configuringDoor, setConfiguringDoor] = useState<RoomDto | null>(null);
  const [pendingDeleteRoom, setPendingDeleteRoom] = useState<RoomDto | null>(null);
  /** Which room's slide-in details panel is open, if any. */
  const [openPanelRoom, setOpenPanelRoom] = useState<RoomDto | null>(null);

  const roomIds = roomsQuery.data?.map((r) => r.id) ?? [];
  const { snapshots, presence, skewMs } = useEventRoomSnapshots(roomIds, eventId);

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

  const updateDoorConfig = useMutation({
    mutationFn: ({ roomId, json }: { roomId: string; json: string }) =>
      roomsApi.updateDoorConfig(eventId!, roomId, json),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rooms", eventId] });
      toast.show({ message: "Door display updated." });
    },
    onError: (e) => toast.show({ message: apiErrorMessage(e), tone: "error" }),
  });

  if (!eventId) return <div className="p-8 text-red-400">Missing event id.</div>;
  if (evQuery.isLoading || roomsQuery.isLoading) {
    return (
      <div className="p-8 max-w-6xl mx-auto space-y-6">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-4 w-56" />
        <SkeletonRow count={2} />
      </div>
    );
  }
  if (evQuery.error || roomsQuery.error) return <div className="p-8 text-red-400">Failed to load.</div>;

  const ev = evQuery.data!;
  const eventRooms = roomsQuery.data!;

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
    <div className="px-6 py-8 lg:px-8 max-w-6xl mx-auto space-y-8">
      <EventIdentity event={ev} snapshots={snapshots} roomCount={eventRooms.length} />

      <LobbyCard
        code={ev.lobbyAccessCode}
        connectedCount={presence.lobby}
        onReset={() => setPendingRotate({ kind: "lobby" })}
      />

      <PreflightPanel event={ev} rooms={eventRooms} presence={presence} />

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-zinc-200">Rooms</h2>
          {eventRooms.length > 0 && (
            <Button size="sm" variant="ghost" leadingIcon={<Plus className="size-4" />} onClick={() => setCreatingRoom(true)}>
              Add room
            </Button>
          )}
        </div>

        {eventRooms.length === 0 ? (
          <Card tone="dashed" density="comfortable" className="text-center !p-10">
            <DoorOpen className="mx-auto size-10 text-zinc-600" />
            <h3 className="mt-3 text-lg font-medium text-zinc-200">No rooms yet</h3>
            <p className="mt-1 text-sm text-zinc-500">
              Add a stage, studio, or breakout — each gets its own timer, schedule, and access codes.
            </p>
            <div className="mt-4 flex justify-center">
              <Button leadingIcon={<Plus className="size-4" />} onClick={() => setCreatingRoom(true)}>Add room</Button>
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {eventRooms.map((r) => (
              <RoomTile
                key={r.id}
                room={r}
                snapshot={snapshots[r.id]}
                presence={presence.rooms[r.id]}
                skewMs={skewMs}
                onOpenPanel={setOpenPanelRoom}
              />
            ))}
            <AddRoomTile onClick={() => setCreatingRoom(true)} />
          </div>
        )}
      </section>

      {eventRooms.length > 0 && <UpcomingToday rooms={eventRooms} />}

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

      <DoorDisplaySettingsSheet
        open={configuringDoor !== null}
        room={configuringDoor}
        onClose={() => setConfiguringDoor(null)}
        onSubmit={async (json) => {
          if (!configuringDoor) return;
          await updateDoorConfig.mutateAsync({ roomId: configuringDoor.id, json });
        }}
      />

      <RoomPanel
        open={openPanelRoom !== null}
        room={openPanelRoom}
        snapshot={openPanelRoom ? snapshots[openPanelRoom.id] : undefined}
        skewMs={skewMs}
        onClose={() => setOpenPanelRoom(null)}
        onEdit={(room) => { setEditingRoom(room); setOpenPanelRoom(null); }}
        onConfigureDoor={(room) => { setConfiguringDoor(room); setOpenPanelRoom(null); }}
        onResetCode={(room) => { setPendingRotate({ kind: "room", id: room.id, name: room.name }); setOpenPanelRoom(null); }}
        onDelete={(room) => { setPendingDeleteRoom(room); setOpenPanelRoom(null); }}
      />
    </div>
  );
}

function AddRoomTile({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex min-h-[200px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/10 bg-white/[0.01] text-zinc-500 transition-colors hover:border-white/20 hover:text-zinc-300"
    >
      <Plus className="size-5 transition-transform group-hover:scale-110" />
      <span className="text-sm font-medium">Add room</span>
    </button>
  );
}
