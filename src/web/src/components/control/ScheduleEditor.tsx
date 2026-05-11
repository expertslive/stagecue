import { DndContext, closestCenter, type DragEndEvent, KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Pencil, Trash2 } from "lucide-react";
import type { ScheduleItemDto } from "@/api/types";

interface Props {
  items: ScheduleItemDto[];
  onReorder: (orderedIds: string[]) => void;
  onEdit: (item: ScheduleItemDto) => void;
  onDelete: (item: ScheduleItemDto) => void;
}

export default function ScheduleEditor({ items, onReorder, onEdit, onDelete }: Props) {
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
        <ol className="rounded border border-zinc-800 divide-y divide-zinc-800">
          {items.map((item) => (
            <SortableRow key={item.id} item={item} onEdit={onEdit} onDelete={onDelete} />
          ))}
          {items.length === 0 && <li className="p-6 text-center text-sm text-zinc-500">
  Plan the order of your sessions. Add the first item with the button above.
</li>}
        </ol>
      </SortableContext>
    </DndContext>
  );
}

function SortableRow({ item, onEdit, onDelete }: { item: ScheduleItemDto; onEdit: (i: ScheduleItemDto) => void; onDelete: (i: ScheduleItemDto) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 };

  return (
    <li ref={setNodeRef} style={style} className="flex items-center gap-3 p-3 bg-zinc-900">
      <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-zinc-500 hover:text-zinc-300">
        <GripVertical className="size-5" />
      </button>
      <div className="flex-1">
        <div className="text-sm font-medium">{item.title}</div>
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
