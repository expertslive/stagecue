import { type FormEvent, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { rooms } from "@/api/rooms";
import type { RoomDto } from "@/api/types";
import Sheet from "@/components/ui/Sheet";
import Button from "@/components/ui/Button";
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
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      if (initial) {
        await rooms.update(eventId, initial.id, { name: name.trim(), defaultPreRollSec: preRoll });
      } else {
        await rooms.create(eventId, { name: name.trim(), defaultPreRollSec: preRoll });
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
          ? "Update the room's name and default pre-roll."
          : "Add a stage, studio, or breakout room to this event."}
      </p>
      <form onSubmit={handleSubmit} className="mt-4 space-y-3">
        <label className="block">
          <span className="block text-sm text-zinc-400 mb-1">Name</span>
          <input
            autoFocus
            value={name} onChange={(e) => setName(e.target.value)}
            placeholder="Main Stage"
            className="w-full px-3 py-2 rounded bg-zinc-900 border border-zinc-800"
          />
        </label>
        <label className="block">
          <span className="block text-sm text-zinc-400 mb-1">Default pre-roll (seconds)</span>
          <input
            type="number" min={0} max={300} value={preRoll}
            onChange={(e) => setPreRoll(parseInt(e.target.value, 10) || 0)}
            className="w-full px-3 py-2 rounded bg-zinc-900 border border-zinc-800 font-mono"
          />
          <p className="mt-1 text-xs text-zinc-500">
            How long the audience sees a "starts in…" countdown before each session begins. Items can override this.
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
