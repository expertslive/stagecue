import { useEffect, useState } from "react";
import Sheet from "@/components/ui/Sheet";
import Button from "@/components/ui/Button";
import DurationInput from "@/components/ui/DurationInput";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Called when the operator confirms — should create the schedule item and start it. */
  onSubmit: (values: { title: string; durationSec: number }) => Promise<void>;
}

const PRESETS_SEC = [
  { label: "5 min", value: 300 },
  { label: "10 min", value: 600 },
  { label: "15 min", value: 900 },
  { label: "30 min", value: 1800 },
];

/**
 * Ad-hoc countdown for rooms without a schedule. Creates a one-off schedule item
 * with the given title + duration and starts it immediately.
 */
export default function QuickTimerSheet({ open, onClose, onSubmit }: Props) {
  const [title, setTitle] = useState("");
  const [durationSec, setDurationSec] = useState(600);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form whenever the sheet opens fresh.
  useEffect(() => {
    if (open) {
      setError(null);
      setSubmitting(false);
    }
  }, [open]);

  async function handleSubmit() {
    if (durationSec <= 0) { setError("Duration must be at least 1 second."); return; }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({ title: title.trim() || "Quick timer", durationSec });
      // Caller closes the sheet on success.
      setTitle("");
      setDurationSec(600);
    } catch (e) {
      setError(((e as Error).message) || "Could not start the timer.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} onConfirm={handleSubmit} maxWidth="28rem">
      <h2 className="text-lg font-semibold text-zinc-100">Quick timer</h2>
      <p className="mt-1 text-sm text-zinc-400">
        Start an ad-hoc countdown right now. It will be added to the schedule so you can find it later.
      </p>

      <div className="mt-4 space-y-4">
        <label className="block">
          <span className="block text-sm font-medium text-zinc-300 mb-1.5">Title (optional)</span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Coffee break"
            autoFocus
            className="w-full rounded-lg bg-zinc-950/60 border border-white/10 px-3 py-2 text-zinc-100 placeholder-zinc-500 focus-visible:border-[var(--cta)]"
          />
        </label>

        <div>
          <span className="block text-sm font-medium text-zinc-300 mb-1.5">Duration</span>
          <div className="flex items-center gap-2">
            <DurationInput value={durationSec} onChange={setDurationSec} min={1} max={6 * 60 * 60} className="w-28" aria-label="Duration" />
            <span className="text-xs text-zinc-500">MM:SS</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {PRESETS_SEC.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => setDurationSec(p.value)}
                className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
                  durationSec === p.value
                    ? "bg-zinc-700 text-zinc-100"
                    : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>

      <div className="mt-6 flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="button" onClick={handleSubmit} disabled={submitting || durationSec <= 0}>
          {submitting ? "Starting…" : "Start timer"}
        </Button>
      </div>
    </Sheet>
  );
}
