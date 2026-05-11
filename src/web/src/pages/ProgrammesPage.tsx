import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { useState } from "react";
import { ChevronDown, ChevronRight, Plus, Trash2, Pencil } from "lucide-react";
import { programmes, type ProgrammeDto, type ProgrammeSlotDto } from "@/api/programmes";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import DurationInput from "@/components/ui/DurationInput";
import SetupNav from "@/components/shell/SetupNav";
import { useToast } from "@/components/ui/toastContext";
import { apiErrorMessage } from "@/lib/apiErrors";

/**
 * Event-level high-level time schedules ("programmes"). Each programme has an ordered list
 * of slots with absolute start times. Rooms can bind to a programme; sessions in those
 * rooms can attach to slots so the operator doesn't have to type a time per session.
 */
export default function ProgrammesPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const qc = useQueryClient();
  const toast = useToast();
  const list = useQuery({ queryKey: ["programmes", eventId], queryFn: () => programmes.list(eventId!), enabled: !!eventId });
  const [newName, setNewName] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [pendingDelete, setPendingDelete] = useState<ProgrammeDto | null>(null);

  const showError = (e: unknown) => toast.show({ message: apiErrorMessage(e), tone: "error" });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["programmes", eventId] });

  const create = useMutation({
    mutationFn: () => programmes.create(eventId!, newName.trim()),
    onSuccess: () => { setNewName(""); invalidate(); },
    onError: showError,
  });
  const rename = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => programmes.rename(eventId!, id, name),
    onSuccess: invalidate,
    onError: showError,
  });
  const remove = useMutation({
    mutationFn: (id: string) => programmes.remove(eventId!, id),
    onSuccess: () => { invalidate(); toast.show({ message: "Programme removed." }); },
    onError: showError,
  });

  if (!eventId) return <div className="p-8 text-red-400">Missing event id.</div>;

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <SetupNav eventId={eventId} />
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">Programmes</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Define the high-level time schedule for the event — slots like "Keynote", "Morning break", or "Workshop hour" with absolute start times. Bind rooms to a programme so sessions can attach to a slot without retyping the time.
          </p>
        </div>

        <div className="flex gap-2">
          <input
            value={newName} onChange={(e) => setNewName(e.target.value)}
            placeholder="New programme name… (e.g. 'Day 1')"
            className="flex-1 rounded-lg bg-zinc-950/60 border border-white/10 px-3 py-2 text-zinc-100 placeholder-zinc-500 focus-visible:border-[var(--cta)]"
          />
          <Button leadingIcon={<Plus className="size-4" />} disabled={!newName.trim() || create.isPending} onClick={() => create.mutate()}>
            Add programme
          </Button>
        </div>

        <div className="space-y-3">
          {list.data?.length === 0 && (
            <Card tone="dashed" density="comfortable" className="text-center">
              <div className="text-sm text-zinc-400">
                No programmes yet. Programmes are optional — rooms can still schedule sessions freely without one.
              </div>
            </Card>
          )}
          {list.data?.map((p) => (
            <ProgrammeRow
              key={p.id}
              programme={p}
              eventId={eventId}
              expanded={!!expanded[p.id]}
              onToggle={() => setExpanded((prev) => ({ ...prev, [p.id]: !prev[p.id] }))}
              onRename={(name) => rename.mutate({ id: p.id, name })}
              onDelete={() => setPendingDelete(p)}
            />
          ))}
        </div>
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        tone="danger"
        title="Delete programme?"
        message={
          pendingDelete
            ? <>This removes <strong>{pendingDelete.name}</strong> and unlinks it from any rooms and sessions. Sessions keep their current start times.</>
            : ""
        }
        confirmLabel="Delete programme"
        onConfirm={() => {
          if (pendingDelete) remove.mutate(pendingDelete.id);
          setPendingDelete(null);
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

interface ProgrammeRowProps {
  programme: ProgrammeDto;
  eventId: string;
  expanded: boolean;
  onToggle: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}

function ProgrammeRow({ programme, eventId, expanded, onToggle, onRename, onDelete }: ProgrammeRowProps) {
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(programme.name);
  const totalLinked = programme.slots.reduce((acc, s) => acc + s.linkedItemCount, 0);

  return (
    <Card density="comfortable" className="!p-0">
      <header className="flex items-center gap-2 px-5 py-4">
        <button type="button" onClick={onToggle} className="rounded-md p-1.5 text-zinc-400 hover:bg-white/5 hover:text-zinc-100" aria-label={expanded ? "Collapse" : "Expand"}>
          {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </button>
        <div className="min-w-0 flex-1">
          {editingName ? (
            <input
              autoFocus
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={() => { if (nameDraft.trim() && nameDraft !== programme.name) onRename(nameDraft.trim()); setEditingName(false); }}
              onKeyDown={(e) => { if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur(); if (e.key === "Escape") { setNameDraft(programme.name); setEditingName(false); } }}
              className="w-full rounded-md bg-zinc-950/60 border border-white/10 px-2 py-1 text-sm text-zinc-100"
            />
          ) : (
            <button type="button" onClick={() => { setNameDraft(programme.name); setEditingName(true); }} className="text-left text-base font-semibold text-zinc-100 hover:text-zinc-300">
              {programme.name}
            </button>
          )}
          <div className="mt-0.5 text-xs text-zinc-500">
            {programme.slots.length} slot{programme.slots.length === 1 ? "" : "s"}
            {totalLinked > 0 && ` · ${totalLinked} session${totalLinked === 1 ? "" : "s"} linked`}
          </div>
        </div>
        <button type="button" onClick={() => { setNameDraft(programme.name); setEditingName(true); }} className="rounded-md p-1.5 text-zinc-500 hover:bg-white/5 hover:text-zinc-300" aria-label="Rename">
          <Pencil className="size-4" />
        </button>
        <button type="button" onClick={onDelete} className="rounded-md p-1.5 text-zinc-500 hover:bg-red-500/10 hover:text-red-400" aria-label="Delete programme">
          <Trash2 className="size-4" />
        </button>
      </header>
      {expanded && <SlotsEditor programme={programme} eventId={eventId} />}
    </Card>
  );
}

interface SlotsEditorProps {
  programme: ProgrammeDto;
  eventId: string;
}

function SlotsEditor({ programme, eventId }: SlotsEditorProps) {
  const qc = useQueryClient();
  const toast = useToast();
  const showError = (e: unknown) => toast.show({ message: apiErrorMessage(e), tone: "error" });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["programmes", eventId] });

  const [addingLabel, setAddingLabel] = useState("");
  const [addingStart, setAddingStart] = useState(defaultStartLocal());
  const [addingDuration, setAddingDuration] = useState(900);

  const [pendingCascade, setPendingCascade] = useState<{
    slot: ProgrammeSlotDto;
    nextLabel: string;
    nextStartUtc: string;
    nextDurationSec: number;
  } | null>(null);

  const createSlot = useMutation({
    mutationFn: () => programmes.createSlot(eventId, programme.id, {
      label: addingLabel.trim(),
      startUtc: new Date(addingStart).toISOString(),
      durationSec: addingDuration,
    }),
    onSuccess: () => {
      setAddingLabel("");
      invalidate();
    },
    onError: showError,
  });

  const updateSlot = useMutation({
    mutationFn: ({ slotId, body }: { slotId: string; body: { label: string; startUtc: string; durationSec: number; cascade?: "update" | "detach" } }) =>
      programmes.updateSlot(eventId, programme.id, slotId, body),
    onSuccess: invalidate,
    onError: showError,
  });

  const removeSlot = useMutation({
    mutationFn: (slotId: string) => programmes.removeSlot(eventId, programme.id, slotId),
    onSuccess: invalidate,
    onError: showError,
  });

  function saveSlotEdit(slot: ProgrammeSlotDto, next: { label: string; startUtc: string; durationSec: number }) {
    const timingChanged = next.startUtc !== slot.startUtc || next.durationSec !== slot.durationSec;
    if (timingChanged && slot.linkedItemCount > 0) {
      setPendingCascade({ slot, nextLabel: next.label, nextStartUtc: next.startUtc, nextDurationSec: next.durationSec });
      return;
    }
    updateSlot.mutate({ slotId: slot.id, body: { ...next, cascade: "update" } });
  }

  return (
    <div className="border-t border-white/5 px-5 py-4 space-y-3">
      {programme.slots.length === 0 ? (
        <p className="text-sm text-zinc-500">No slots yet. Add one below.</p>
      ) : (
        <ul className="space-y-2">
          {programme.slots.map((slot) => (
            <SlotRow
              key={slot.id}
              slot={slot}
              onSave={(next) => saveSlotEdit(slot, next)}
              onRemove={() => removeSlot.mutate(slot.id)}
            />
          ))}
        </ul>
      )}

      <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-3 space-y-2">
        <div className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Add slot</div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
          <input
            value={addingLabel}
            onChange={(e) => setAddingLabel(e.target.value)}
            placeholder="Label (e.g. Keynote slot)"
            className="rounded-lg bg-zinc-950/60 border border-white/10 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus-visible:border-[var(--cta)]"
          />
          <input
            type="datetime-local"
            value={addingStart}
            onChange={(e) => setAddingStart(e.target.value)}
            className="rounded-lg bg-zinc-950/60 border border-white/10 px-3 py-2 text-sm text-zinc-100 focus-visible:border-[var(--cta)]"
          />
          <DurationInput value={addingDuration} onChange={setAddingDuration} min={1} className="!py-2 text-sm w-28" aria-label="Slot duration" />
          <Button
            size="md"
            leadingIcon={<Plus className="size-4" />}
            disabled={!addingLabel.trim() || addingDuration <= 0 || createSlot.isPending}
            onClick={() => createSlot.mutate()}
          >
            Add
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={pendingCascade !== null}
        tone="danger"
        title="Update or detach linked sessions?"
        message={
          pendingCascade
            ? <>
                <strong>{pendingCascade.slot.linkedItemCount}</strong>{" "}
                session{pendingCascade.slot.linkedItemCount === 1 ? " is" : "s are"} linked to <strong>{pendingCascade.slot.label}</strong>.
                <br />
                Choose <strong>Update</strong> to push the new time/duration to those sessions, or <strong>Detach</strong> to leave their current times alone and clear the slot link.
              </>
            : ""
        }
        confirmLabel="Update linked"
        cancelLabel="Detach instead"
        onConfirm={() => {
          if (!pendingCascade) return;
          updateSlot.mutate({
            slotId: pendingCascade.slot.id,
            body: { label: pendingCascade.nextLabel, startUtc: pendingCascade.nextStartUtc, durationSec: pendingCascade.nextDurationSec, cascade: "update" },
          });
          setPendingCascade(null);
        }}
        onCancel={() => {
          if (!pendingCascade) { setPendingCascade(null); return; }
          updateSlot.mutate({
            slotId: pendingCascade.slot.id,
            body: { label: pendingCascade.nextLabel, startUtc: pendingCascade.nextStartUtc, durationSec: pendingCascade.nextDurationSec, cascade: "detach" },
          });
          setPendingCascade(null);
        }}
      />
    </div>
  );
}

interface SlotRowProps {
  slot: ProgrammeSlotDto;
  onSave: (next: { label: string; startUtc: string; durationSec: number }) => void;
  onRemove: () => void;
}

function SlotRow({ slot, onSave, onRemove }: SlotRowProps) {
  const [label, setLabel] = useState(slot.label);
  const [startLocal, setStartLocal] = useState(toLocalDateTime(new Date(slot.startUtc)));
  const [durationSec, setDurationSec] = useState(slot.durationSec);

  // Sync local state when the upstream slot identity (id) changes — e.g. after re-fetch.
  // Avoid clobbering an in-progress edit on the same slot.
  // (Intentionally no useEffect — single render is enough since props are derived per-row.)

  const dirty = label !== slot.label || startLocal !== toLocalDateTime(new Date(slot.startUtc)) || durationSec !== slot.durationSec;

  function commit() {
    if (!dirty) return;
    if (!label.trim() || durationSec <= 0) return;
    onSave({
      label: label.trim(),
      startUtc: new Date(startLocal).toISOString(),
      durationSec,
    });
  }

  return (
    <li className="grid grid-cols-1 gap-2 rounded-lg bg-zinc-950/40 px-3 py-2 sm:grid-cols-[1fr_auto_auto_auto_auto] items-center">
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur(); }}
        className="rounded-md bg-zinc-950/60 border border-white/10 px-2 py-1 text-sm text-zinc-100"
      />
      <input
        type="datetime-local"
        value={startLocal}
        onChange={(e) => setStartLocal(e.target.value)}
        onBlur={commit}
        className="rounded-md bg-zinc-950/60 border border-white/10 px-2 py-1 text-sm text-zinc-100 font-mono"
      />
      <DurationInput value={durationSec} onChange={setDurationSec} min={1} className="!py-1 text-sm w-24" aria-label={`Duration of ${slot.label}`} />
      {slot.linkedItemCount > 0 ? (
        <span className="text-xs text-zinc-400" title={`${slot.linkedItemCount} session(s) attached`}>{slot.linkedItemCount} ·</span>
      ) : <span className="text-xs text-zinc-600">—</span>}
      <button type="button" onClick={onRemove} className="rounded-md p-1.5 text-zinc-500 hover:bg-red-500/10 hover:text-red-400" aria-label="Delete slot">
        <Trash2 className="size-4" />
      </button>
    </li>
  );
}

function defaultStartLocal(): string {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return toLocalDateTime(d);
}

function toLocalDateTime(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
