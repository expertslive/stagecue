import { type FormEvent, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { events } from "@/api/events";
import Sheet from "@/components/ui/Sheet";
import Button from "@/components/ui/Button";

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function CreateEventSheet({ open, onClose }: Props) {
  const qc = useQueryClient();
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [startLocal, setStartLocal] = useState(defaultStartLocal());
  const [durationHours, setDurationHours] = useState(8);
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => {
      const start = new Date(startLocal);
      const end = new Date(start.getTime() + durationHours * 3600 * 1000);
      return events.create({
        name: name.trim(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        startsAtUtc: start.toISOString(),
        endsAtUtc: end.toISOString(),
      });
    },
    onSuccess: (ev) => {
      qc.invalidateQueries({ queryKey: ["events"] });
      onClose();
      nav(`/events/${ev.id}`);
    },
    onError: (e: Error) => setError(e.message || "Could not create event."),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) { setError("Name is required."); return; }
    create.mutate();
  }

  return (
    <Sheet open={open} onClose={onClose}>
      <h2 className="text-lg font-semibold">New event</h2>
      <p className="mt-1 text-sm text-zinc-500">You can add rooms and a schedule once the event is created.</p>
      <form onSubmit={handleSubmit} className="mt-4 space-y-3">
        <label className="block">
          <span className="block text-sm text-zinc-400 mb-1">Name</span>
          <input
            autoFocus
            value={name} onChange={(e) => setName(e.target.value)}
            placeholder="Annual Conference 2026"
            className="w-full px-3 py-2 rounded bg-zinc-950/60 border border-white/10 focus-visible:outline-none focus-visible:border-blue-500"
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="block text-sm text-zinc-400 mb-1">Starts</span>
            <input
              type="datetime-local" value={startLocal}
              onChange={(e) => setStartLocal(e.target.value)}
              className="w-full px-3 py-2 rounded bg-zinc-950/60 border border-white/10"
            />
          </label>
          <label className="block">
            <span className="block text-sm text-zinc-400 mb-1">Duration (hours)</span>
            <input
              type="number" min={1} max={72} value={durationHours}
              onChange={(e) => setDurationHours(parseInt(e.target.value, 10) || 1)}
              className="w-full px-3 py-2 rounded bg-zinc-950/60 border border-white/10 font-mono"
            />
          </label>
        </div>
        <p className="text-xs text-zinc-500">Time zone: {Intl.DateTimeFormat().resolvedOptions().timeZone}</p>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={create.isPending}>{create.isPending ? "Creating…" : "Create event"}</Button>
        </div>
      </form>
    </Sheet>
  );
}

function defaultStartLocal(): string {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
