import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { useState } from "react";
import { scheduleItems, type CreateScheduleItemBody } from "@/api/scheduleItems";
import type { ScheduleItemDto } from "@/api/types";
import ScheduleEditor from "@/components/control/ScheduleEditor";
import ScheduleItemForm, { type ScheduleItemFormValues } from "@/components/control/ScheduleItemForm";

export default function ScheduleEditorPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const qc = useQueryClient();
  const itemsQuery = useQuery({ queryKey: ["schedule", roomId], queryFn: () => scheduleItems.list(roomId!), enabled: !!roomId });

  const [editing, setEditing] = useState<ScheduleItemDto | null>(null);
  const [creating, setCreating] = useState(false);

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
    onSuccess: () => qc.invalidateQueries({ queryKey: ["schedule", roomId] }),
  });

  if (!roomId) return <div className="p-8 text-red-400">Missing room id.</div>;
  if (itemsQuery.isLoading) return <div className="p-8">Loading…</div>;
  if (itemsQuery.error) return <div className="p-8 text-red-400">Failed to load schedule.</div>;

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Schedule</h1>
        <div className="flex gap-3 text-sm items-center">
          <Link to={`/rooms/${roomId}`} className="text-blue-400 hover:underline">Control →</Link>
          <button onClick={() => setCreating(true)} className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white">Add item</button>
        </div>
      </div>

      <ScheduleEditor
        items={itemsQuery.data!}
        onReorder={(ids) => reorderMutation.mutate(ids)}
        onEdit={(item) => setEditing(item)}
        onDelete={(item) => { if (confirm(`Delete "${item.title}"?`)) deleteMutation.mutate(item.id); }}
      />

      {creating && (
        <ScheduleItemForm
          onCancel={() => setCreating(false)}
          onSubmit={async (v) => { await createMutation.mutateAsync(toBody(v)); setCreating(false); }}
        />
      )}
      {editing && (
        <ScheduleItemForm
          initial={editing}
          onCancel={() => setEditing(null)}
          onSubmit={async (v) => { await updateMutation.mutateAsync({ id: editing.id, body: toBody(v) }); setEditing(null); }}
        />
      )}
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
  };
}
