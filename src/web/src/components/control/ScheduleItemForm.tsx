import { type FormEvent, useState } from "react";
import type { ScheduleItemDto, Threshold } from "@/api/types";
import ThresholdsEditor from "./ThresholdsEditor";

export interface ScheduleItemFormValues {
  title: string;
  speakerName: string;
  scheduledStartLocal: string;
  durationSec: number;
  preRollSec: number;
  autoStart: boolean;
  thresholds: Threshold[];
}

interface Props {
  initial?: ScheduleItemDto;
  onSubmit: (values: ScheduleItemFormValues) => Promise<void>;
  onCancel: () => void;
}

export default function ScheduleItemForm({ initial, onSubmit, onCancel }: Props) {
  const [values, setValues] = useState<ScheduleItemFormValues>(() => initialValuesFrom(initial));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try { await onSubmit(values); }
    catch (err) { setError(String((err as Error).message ?? err)); }
    finally { setSubmitting(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-6">
      <form onSubmit={handleSubmit} className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 w-full max-w-xl space-y-4 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold">{initial ? "Edit item" : "New schedule item"}</h2>

        <Field label="Title" value={values.title} onChange={(v) => setValues({ ...values, title: v })} required />
        <Field label="Speaker" value={values.speakerName} onChange={(v) => setValues({ ...values, speakerName: v })} />

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="block text-sm text-zinc-400 mb-1">Scheduled start</span>
            <input
              type="datetime-local" value={values.scheduledStartLocal}
              onChange={(e) => setValues({ ...values, scheduledStartLocal: e.target.value })}
              className="w-full px-3 py-2 rounded bg-zinc-950 border border-zinc-800" required />
          </label>
          <label className="block">
            <span className="block text-sm text-zinc-400 mb-1">Duration (seconds)</span>
            <input
              type="number" min={1} value={values.durationSec}
              onChange={(e) => setValues({ ...values, durationSec: parseInt(e.target.value, 10) || 0 })}
              className="w-full px-3 py-2 rounded bg-zinc-950 border border-zinc-800 font-mono" required />
          </label>
          <label className="block">
            <span className="block text-sm text-zinc-400 mb-1">Pre-roll (seconds)</span>
            <input
              type="number" min={0} value={values.preRollSec}
              onChange={(e) => setValues({ ...values, preRollSec: parseInt(e.target.value, 10) || 0 })}
              className="w-full px-3 py-2 rounded bg-zinc-950 border border-zinc-800 font-mono" />
          </label>
          <label className="flex items-center gap-2 mt-7">
            <input type="checkbox" checked={values.autoStart}
              onChange={(e) => setValues({ ...values, autoStart: e.target.checked })} />
            <span className="text-sm">Auto-start</span>
          </label>
        </div>

        <div>
          <span className="block text-sm text-zinc-400 mb-2">Color thresholds</span>
          <ThresholdsEditor value={values.thresholds} onChange={(t) => setValues({ ...values, thresholds: t })} />
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onCancel} className="px-3 py-2 rounded bg-zinc-800 hover:bg-zinc-700 text-sm">Cancel</button>
          <button type="submit" disabled={submitting} className="px-3 py-2 rounded bg-blue-600 hover:bg-blue-500 text-sm disabled:opacity-50">
            {submitting ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, value, onChange, required = false }: { label: string; value: string; onChange: (s: string) => void; required?: boolean }) {
  return (
    <label className="block">
      <span className="block text-sm text-zinc-400 mb-1">{label}</span>
      <input
        type="text" value={value} onChange={(e) => onChange(e.target.value)} required={required}
        className="w-full px-3 py-2 rounded bg-zinc-950 border border-zinc-800" />
    </label>
  );
}

function initialValuesFrom(item?: ScheduleItemDto): ScheduleItemFormValues {
  if (!item) {
    const now = new Date();
    return {
      title: "",
      speakerName: "",
      scheduledStartLocal: toLocalDateTime(now),
      durationSec: 1800,
      preRollSec: 30,
      autoStart: false,
      thresholds: [],
    };
  }
  return {
    title: item.title,
    speakerName: item.speakerName ?? "",
    scheduledStartLocal: toLocalDateTime(new Date(item.scheduledStartUtc)),
    durationSec: item.durationSec,
    preRollSec: item.preRollSec,
    autoStart: item.autoStart,
    thresholds: item.thresholdsJson ? JSON.parse(item.thresholdsJson) as Threshold[] : [],
  };
}

function toLocalDateTime(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
