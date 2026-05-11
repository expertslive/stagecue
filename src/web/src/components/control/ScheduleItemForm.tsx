import { type FormEvent, useRef, useState } from "react";
import type { ScheduleItemDto, Threshold } from "@/api/types";
import type { ProgrammeSlotDto } from "@/api/programmes";
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
  /** When set, the server overrides scheduledStart/duration with the slot's values. */
  programmeSlotId: string | null;
}

interface Props {
  initial?: ScheduleItemDto;
  open: boolean;
  /** When supplied, render a "Time slot" picker — caller passes the room's programme slots. */
  programmeSlots?: ProgrammeSlotDto[];
  onSubmit: (values: ScheduleItemFormValues) => Promise<void>;
  onCancel: () => void;
}

export default function ScheduleItemForm({ initial, open, programmeSlots, onSubmit, onCancel }: Props) {
  const [values, setValues] = useState<ScheduleItemFormValues>(() => initialValuesFrom(initial));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const slotBound = values.programmeSlotId !== null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try { await onSubmit(values); }
    catch (err) { setError(String((err as Error).message ?? err)); }
    finally { setSubmitting(false); }
  }

  function pickSlot(slotId: string | null) {
    if (!slotId || !programmeSlots) {
      setValues((v) => ({ ...v, programmeSlotId: null }));
      return;
    }
    const slot = programmeSlots.find((s) => s.id === slotId);
    if (!slot) return;
    setValues((v) => ({
      ...v,
      programmeSlotId: slot.id,
      scheduledStartLocal: toLocalDateTime(new Date(slot.startUtc)),
      durationSec: slot.durationSec,
    }));
  }

  return (
    <Sheet open={open} onClose={onCancel} onConfirm={() => formRef.current?.requestSubmit()} maxWidth="36rem">
      <h2 className="text-lg font-semibold">{initial ? "Edit item" : "New schedule item"}</h2>
      <form ref={formRef} onSubmit={handleSubmit} className="mt-4 space-y-4">
        <Field label="Title" value={values.title} onChange={(v) => setValues({ ...values, title: v })} required autoFocus />
        <Field label="Speaker" value={values.speakerName} onChange={(v) => setValues({ ...values, speakerName: v })} />

        {programmeSlots && (
          <label className="block">
            <span className="block text-sm text-zinc-400 mb-1">Time slot (optional)</span>
            <select
              value={values.programmeSlotId ?? ""}
              onChange={(e) => pickSlot(e.target.value || null)}
              className="w-full px-3 py-2 rounded bg-zinc-950/60 border border-white/10 text-zinc-100"
            >
              <option value="">— No slot (plan a custom time) —</option>
              {programmeSlots.map((s) => (
                <option key={s.id} value={s.id}>
                  {new Date(s.startUtc).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · {s.label} · {Math.round(s.durationSec / 60)} min
                </option>
              ))}
            </select>
            {slotBound && (
              <p className="mt-1 text-xs text-zinc-500">
                Start and duration are linked to the slot. Changing the slot's timing later (or detaching it) updates this session.
              </p>
            )}
          </label>
        )}

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="block text-sm text-zinc-400 mb-1">Scheduled start</span>
            <input
              type="datetime-local" value={values.scheduledStartLocal}
              onChange={(e) => setValues({ ...values, scheduledStartLocal: e.target.value })}
              disabled={slotBound}
              className="w-full px-3 py-2 rounded bg-zinc-950/60 border border-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
              required />
          </label>
          <label className="block">
            <span className="block text-sm text-zinc-400 mb-1">Duration</span>
            <DurationInput
              value={values.durationSec}
              onChange={(s) => setValues({ ...values, durationSec: s })}
              min={1}
              required
              disabled={slotBound}
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
      programmeSlotId: null,
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
    programmeSlotId: item.programmeSlotId,
  };
}

function toLocalDateTime(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
