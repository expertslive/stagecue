import { type FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { rooms } from "@/api/rooms";
import { programmes } from "@/api/programmes";
import type { RoomDto } from "@/api/types";
import Sheet from "@/components/ui/Sheet";
import Button from "@/components/ui/Button";
import DurationInput from "@/components/ui/DurationInput";
import { apiErrorMessage } from "@/lib/apiErrors";

interface Props {
  eventId: string;
  open: boolean;
  onClose: () => void;
  /** When provided, the sheet edits the room. Otherwise it creates a new one. */
  initial?: RoomDto;
}

export default function RoomFormSheet({ eventId, open, onClose, initial }: Props) {
  const qc = useQueryClient();
  const [name, setName] = useState(initial?.name ?? "");
  const [preRoll, setPreRoll] = useState(initial?.defaultPreRollSec ?? 30);
  const [programmeId, setProgrammeId] = useState<string | "">(initial?.programmeId ?? "");
  const [error, setError] = useState<string | null>(null);

  // List of programmes for this event — used to populate the optional binding dropdown.
  const programmeList = useQuery({
    queryKey: ["programmes", eventId],
    queryFn: () => programmes.list(eventId),
    enabled: open,
  });

  const save = useMutation({
    mutationFn: async () => {
      const pid = programmeId === "" ? null : programmeId;
      if (initial) {
        await rooms.update(eventId, initial.id, { name: name.trim(), defaultPreRollSec: preRoll, programmeId: pid });
      } else {
        await rooms.create(eventId, { name: name.trim(), defaultPreRollSec: preRoll, programmeId: pid });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rooms", eventId] });
      onClose();
    },
    onError: (e) => setError(apiErrorMessage(e)),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) { setError("Name is required."); return; }
    save.mutate();
  }

  return (
    <Sheet open={open} onClose={onClose}>
      <h2 className="text-lg font-semibold">{initial ? "Edit room" : "New room"}</h2>
      <p className="mt-1 text-sm text-zinc-500">
        {initial
          ? "Update the room's name, default pre-roll, and optional programme binding."
          : "Add a stage, studio, or breakout room to this event."}
      </p>
      <form onSubmit={handleSubmit} className="mt-4 space-y-3">
        <label className="block">
          <span className="block text-sm text-zinc-400 mb-1">Name</span>
          <input
            autoFocus
            value={name} onChange={(e) => setName(e.target.value)}
            placeholder="Main Stage"
            className="w-full px-3 py-2 rounded bg-zinc-950/60 border border-white/10"
          />
        </label>
        <label className="block">
          <span className="block text-sm text-zinc-400 mb-1">Default countdown before start</span>
          <DurationInput
            value={preRoll}
            onChange={setPreRoll}
            min={0}
            max={600}
            className="w-full"
          />
          <p className="mt-1 text-xs text-zinc-500">
            How long the audience sees a "starts in…" countdown before each session begins. Items can override this.
          </p>
        </label>

        <label className="block">
          <span className="block text-sm text-zinc-400 mb-1">Programme (optional)</span>
          <select
            value={programmeId}
            onChange={(e) => setProgrammeId(e.target.value)}
            className="w-full px-3 py-2 rounded bg-zinc-950/60 border border-white/10 text-zinc-100"
          >
            <option value="">— None (schedule freely) —</option>
            {programmeList.data?.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <p className="mt-1 text-xs text-zinc-500">
            When bound, sessions in this room can attach to a slot from the programme. Sessions can still be planned freely if no slot fits.
          </p>
        </label>

        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending
              ? (initial ? "Saving…" : "Creating…")
              : (initial ? "Save changes" : "Create room")}
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
