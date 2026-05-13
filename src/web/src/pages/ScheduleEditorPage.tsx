import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { useMemo, useState } from "react";
import { scheduleItems, type CreateScheduleItemBody } from "@/api/scheduleItems";
import { programmes } from "@/api/programmes";
import { useRoomEvent } from "@/hooks/useRoomEvent";
import type { ScheduleItemDto } from "@/api/types";
import ScheduleEditor from "@/components/control/ScheduleEditor";
import ScheduleItemForm, { type ScheduleItemFormValues } from "@/components/control/ScheduleItemForm";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/toastContext";
import SkeletonRow from "@/components/ui/SkeletonRow";
import { Plus } from "lucide-react";

export default function ScheduleEditorPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const qc = useQueryClient();
  const itemsQuery = useQuery({ queryKey: ["schedule", roomId], queryFn: () => scheduleItems.list(roomId!), enabled: !!roomId });

  // Resolve the room → event → programme so we know which slot list to surface in the form.
  const { room, event } = useRoomEvent(roomId);
  const eventId = event?.id ?? null;
  const programmeId = room?.programmeId ?? null;
  const programmesQuery = useQuery({
    queryKey: ["programmes", eventId],
    queryFn: () => programmes.list(eventId!),
    enabled: !!eventId && !!programmeId,
  });
  const programmeSlots = useMemo(() => {
    if (!programmeId) return undefined;
    return programmesQuery.data?.find((p) => p.id === programmeId)?.slots;
  }, [programmesQuery.data, programmeId]);

  const toast = useToast();

  const [editing, setEditing] = useState<ScheduleItemDto | null>(null);
  const [creating, setCreating] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<ScheduleItemDto | null>(null);

  const reorderMutation = useMutation({
    mutationFn: (orderedIds: string[]) => scheduleItems.reorder(roomId!, orderedIds),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["schedule", roomId] }),
  });
  const createMutation = useMutation({
    mutationFn: (body: CreateScheduleItemBody) => scheduleItems.create(roomId!, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["schedule", roomId] }),
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: CreateScheduleItemBody }) => scheduleItems.update(roomId!, id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["schedule", roomId] }),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => scheduleItems.remove(roomId!, id),
    onMutate: (id: string) => {
      // Capture the item so we can offer Undo from the closure.
      return itemsQuery.data?.find((i) => i.id === id);
    },
    onSuccess: (_data, _id, ctx) => {
      qc.invalidateQueries({ queryKey: ["schedule", roomId] });
      const deleted = ctx as unknown as ScheduleItemDto | undefined;
      if (!deleted) return;
      toast.show({
        message: `Deleted "${deleted.title}"`,
        timeoutMs: 8000,
        action: {
          label: "Undo",
          onClick: async () => {
            await createMutation.mutateAsync({
              title: deleted.title,
              speakerName: deleted.speakerName,
              scheduledStartUtc: deleted.scheduledStartUtc,
              durationSec: deleted.durationSec,
              preRollSec: deleted.preRollSec,
              autoStart: deleted.autoStart,
              thresholdsJson: deleted.thresholdsJson,
              programmeSlotId: deleted.programmeSlotId,
            });
            toast.show({ message: `Restored "${deleted.title}"` });
          },
        },
      });
    },
  });

  if (!roomId) return <div className="p-8 text-red-400">Missing room id.</div>;
  if (itemsQuery.isLoading) return <div className="p-8 max-w-3xl mx-auto"><SkeletonRow count={3} /></div>;
  if (itemsQuery.error) return <div className="p-8 text-red-400">Failed to load schedule.</div>;

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">Schedule</h1>
        <div className="flex gap-3 text-sm items-center">
          <Link to={`/rooms/${roomId}`} className="text-blue-400 hover:underline">Control →</Link>
          <Button size="sm" leadingIcon={<Plus className="size-4" />} onClick={() => setCreating(true)}>Add item</Button>
        </div>
      </div>

      {programmeId && (
        <p className="text-xs text-zinc-500">
          This room is bound to a programme. New sessions can attach to a slot from the picker (or be planned freely).
        </p>
      )}

      <ScheduleEditor
        items={itemsQuery.data!}
        programmeSlots={programmeSlots}
        onReorder={(ids) => reorderMutation.mutate(ids)}
        onEdit={(item) => setEditing(item)}
        onDelete={(item) => setPendingDelete(item)}
      />

      <ScheduleItemForm
        open={creating}
        programmeSlots={programmeSlots}
        onCancel={() => setCreating(false)}
        onSubmit={async (v) => { await createMutation.mutateAsync(toBody(v)); setCreating(false); }}
      />
      <ScheduleItemForm
        open={editing !== null}
        initial={editing ?? undefined}
        programmeSlots={programmeSlots}
        onCancel={() => setEditing(null)}
        onSubmit={async (v) => { if (editing) { await updateMutation.mutateAsync({ id: editing.id, body: toBody(v) }); setEditing(null); } }}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        tone="danger"
        title="Delete schedule item?"
        message={pendingDelete ? <>This removes <strong>{pendingDelete.title}</strong> from the schedule.</> : ""}
        confirmLabel="Delete"
        onConfirm={() => {
          if (pendingDelete) deleteMutation.mutate(pendingDelete.id);
          setPendingDelete(null);
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

function toBody(v: ScheduleItemFormValues): CreateScheduleItemBody {
  return {
    title: v.title,
    speakerName: v.speakerName.trim() || null,
    scheduledStartUtc: new Date(v.scheduledStartLocal).toISOString(),
    durationSec: v.durationSec,
    preRollSec: v.preRollSec,
    autoStart: v.autoStart,
    thresholdsJson: v.thresholds.length ? JSON.stringify(v.thresholds) : null,
    programmeSlotId: v.programmeSlotId,
  };
}
