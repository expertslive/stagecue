import { type FormEvent, useRef, useState } from "react";
import type { ScheduleItemDto, Threshold } from "@/api/types";
import ThresholdsEditor from "./ThresholdsEditor";
import Sheet from "@/components/ui/Sheet";
import Button from "@/components/ui/Button";
import DurationInput from "@/components/ui/DurationInput";

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
  open: boolean;
  onSubmit: (values: ScheduleItemFormValues) => Promise<void>;
  onCancel: () => void;
}

export default function ScheduleItemForm({ initial, open, onSubmit, onCancel }: Props) {
  const [values, setValues] = useState<ScheduleItemFormValues>(() => initialValuesFrom(initial));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try { await onSubmit(values); }
    catch (err) { setError(String((err as Error).message ?? err)); }
    finally { setSubmitting(false); }
  }

  return (
    <Sheet open={open} onClose={onCancel} onConfirm={() => formRef.current?.requestSubmit()} maxWidth="36rem">
      <h2 className="text-lg font-semibold">{initial ? "Edit item" : "New schedule item"}</h2>
      <form ref={formRef} onSubmit={handleSubmit} className="mt-4 space-y-4">
        <Field label="Title" value={values.title} onChange={(v) => setValues({ ...values, title: v })} required autoFocus />
        <Field label="Speaker" value={values.speakerName} onChange={(v) => setValues({ ...values, speakerName: v })} />

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="block text-sm text-zinc-400 mb-1">Scheduled start</span>
            <input
              type="datetime-local" value={values.scheduledStartLocal}
              onChange={(e) => setValues({ ...values, scheduledStartLocal: e.target.value })}
              className="w-full px-3 py-2 rounded bg-zinc-950/60 border border-white/10" required />
          </label>
          <label className="block">
            <span className="block text-sm text-zinc-400 mb-1">Duration</span>
            <DurationInput
              value={values.durationSec}
              onChange={(s) => setValues({ ...values, durationSec: s })}
              min={1}
              required
              className="w-full"
            />
          </label>
          <label className="block">
            <span className="block text-sm text-zinc-400 mb-1">Countdown before start</span>
            <DurationInput
              value={values.preRollSec}
              onChange={(s) => setValues({ ...values, preRollSec: s })}
              max={600}
              className="w-full"
            />
          </label>
          <label className="flex items-center gap-2 mt-7">
            <input type="checkbox" checked={values.autoStart}
              onChange={(e) => setValues({ ...values, autoStart: e.target.checked })} />
            <span className="text-sm">Auto-start</span>
          </label>
        </div>

        <div>
          <span className="block text-sm text-zinc-400 mb-2">Colour thresholds</span>
          <ThresholdsEditor
            value={values.thresholds}
            onChange={(t) => setValues({ ...values, thresholds: t })}
            durationSec={values.durationSec}
          />
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>
    </Sheet>
  );
}

function Field({ label, value, onChange, required = false, autoFocus = false }: { label: string; value: string; onChange: (s: string) => void; required?: boolean; autoFocus?: boolean }) {
  return (
    <label className="block">
      <span className="block text-sm text-zinc-400 mb-1">{label}</span>
      <input
        type="text" value={value} onChange={(e) => onChange(e.target.value)} required={required} autoFocus={autoFocus}
        className="w-full px-3 py-2 rounded bg-zinc-950/60 border border-white/10" />
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
