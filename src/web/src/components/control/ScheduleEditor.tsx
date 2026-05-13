import { DndContext, closestCenter, type DragEndEvent, KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Link2, Pencil, Trash2 } from "lucide-react";
import type { ScheduleItemDto } from "@/api/types";
import type { ProgrammeSlotDto } from "@/api/programmes";

interface Props {
  items: ScheduleItemDto[];
  /** Slots from the room's bound programme — used to show a binding chip next to linked items. */
  programmeSlots?: ProgrammeSlotDto[];
  onReorder: (orderedIds: string[]) => void;
  onEdit: (item: ScheduleItemDto) => void;
  onDelete: (item: ScheduleItemDto) => void;
}

export default function ScheduleEditor({ items, programmeSlots, onReorder, onEdit, onDelete }: Props) {
  const slotById = new Map((programmeSlots ?? []).map((s) => [s.id, s] as const));
  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const reordered = [...items];
    const [moved] = reordered.splice(oldIndex, 1);
    reordered.splice(newIndex, 0, moved);
    onReorder(reordered.map((i) => i.id));
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <ol className="rounded-xl border border-white/5 divide-y divide-white/5">
          {items.map((item) => (
            <SortableRow
              key={item.id}
              item={item}
              slotLabel={item.programmeSlotId ? slotById.get(item.programmeSlotId)?.label ?? null : null}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
          {items.length === 0 && <li className="p-6 text-center text-sm text-zinc-500">
  Plan the order of your sessions. Add the first item with the button above.
</li>}
        </ol>
      </SortableContext>
    </DndContext>
  );
}

function SortableRow({ item, slotLabel, onEdit, onDelete }: { item: ScheduleItemDto; slotLabel: string | null; onEdit: (i: ScheduleItemDto) => void; onDelete: (i: ScheduleItemDto) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 };

  return (
    <li ref={setNodeRef} style={style} className="flex items-center gap-3 p-3 bg-zinc-900">
      <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-zinc-500 hover:text-zinc-300">
        <GripVertical className="size-5" />
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium truncate">{item.title}</span>
          {slotLabel && (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-[var(--cta)]/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[color:var(--cta)] ring-1 ring-[var(--cta)]/20"
              title={`Linked to programme slot "${slotLabel}". Start and duration mirror the slot.`}
            >
              <Link2 className="size-2.5" />
              {slotLabel}
            </span>
          )}
        </div>
        <div className="text-xs text-zinc-500">
          {new Date(item.scheduledStartUtc).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} ·
          {" "}{Math.floor(item.durationSec / 60)} min · pre-roll {item.preRollSec}s
          {item.autoStart && " · auto"}
          {item.speakerName && ` · ${item.speakerName}`}
        </div>
      </div>
      <button onClick={() => onEdit(item)} className="text-zinc-500 hover:text-zinc-300"><Pencil className="size-4" /></button>
      <button onClick={() => onDelete(item)} className="text-zinc-500 hover:text-red-400"><Trash2 className="size-4" /></button>
    </li>
  );
}
