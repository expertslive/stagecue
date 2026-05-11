import { useState } from "react";
import type { Threshold } from "@/api/types";
import { X } from "lucide-react";
import DurationInput from "@/components/ui/DurationInput";

interface Tone {
  token: string;
  label: string;
  hint: string;
  cssVar: string;
}

const tones: Tone[] = [
  { token: "warning", label: "Heads-up", hint: "Gentle attention — first colour change", cssVar: "var(--warning)" },
  { token: "danger", label: "Wrap up", hint: "Time to land", cssVar: "var(--danger)" },
  { token: "final", label: "Final stretch", hint: "Last seconds", cssVar: "var(--final)" },
];

interface Props {
  value: Threshold[];
  onChange: (next: Threshold[]) => void;
  /** Duration of the session in seconds — used to scale the preview. Defaults to 1800 (30 min). */
  durationSec?: number;
}

export default function ThresholdsEditor({ value, onChange, durationSec = 1800 }: Props) {
  const [secs, setSecs] = useState(60);
  const [tone, setTone] = useState<string>(() =>
    // Default to a tone that isn't already in use.
    tones.find((t) => !value.some((v) => v.colorToken === t.token))?.token ?? tones[0].token,
  );

  function add() {
    if (secs <= 0) return;
    if (value.some((t) => t.colorToken === tone)) return;
    const next = [...value, { secondsRemaining: secs, colorToken: tone }]
      .sort((a, b) => b.secondsRemaining - a.secondsRemaining);
    onChange(next);
    // Auto-advance to the next unused tone.
    const nextTone = tones.find((t) => !next.some((v) => v.colorToken === t.token));
    if (nextTone) setTone(nextTone.token);
  }

  function remove(index: number) {
    onChange(value.filter((_, j) => j !== index));
  }

  const allUsed = tones.every((t) => value.some((v) => v.colorToken === t.token));

  return (
    <div className="space-y-3">
      <TimelinePreview thresholds={value} durationSec={durationSec} />

      <ul className="space-y-1">
        {value.map((t, i) => {
          const semantic = tones.find((x) => x.token === t.colorToken);
          const swatchColor = semantic?.cssVar ?? `var(--${t.colorToken})`;
          const label = semantic?.label ?? t.colorToken;
          return (
            <li key={i} className="flex items-center gap-3 rounded bg-zinc-900 px-3 py-1.5 text-sm">
              <span aria-hidden="true" className="size-3 rounded-full ring-1 ring-zinc-700" style={{ background: swatchColor }} />
              <span className="font-mono text-zinc-300">{formatPrettyDuration(t.secondsRemaining)} left</span>
              <span className="text-zinc-400">→ {label}</span>
              <button
                type="button"
                onClick={() => remove(i)}
                className="ml-auto text-zinc-500 hover:text-zinc-300"
                aria-label={`Remove ${label} threshold`}
              >
                <X className="size-4" />
              </button>
            </li>
          );
        })}
        {value.length === 0 && (
          <li className="text-xs text-zinc-500">
            No thresholds yet. The countdown will stay the brand colour the whole way.
          </li>
        )}
      </ul>

      {!allUsed && (
        <div className="flex flex-wrap items-center gap-2">
          <DurationInput value={secs} onChange={setSecs} min={1} max={durationSec} className="w-24" aria-label="Seconds remaining when this threshold kicks in" />
          <div className="flex gap-1">
            {tones.map((t) => {
              const taken = value.some((v) => v.colorToken === t.token);
              const active = tone === t.token;
              return (
                <button
                  key={t.token}
                  type="button"
                  disabled={taken}
                  onClick={() => setTone(t.token)}
                  aria-pressed={active}
                  title={taken ? `${t.label} already in use` : t.hint}
                  className={`inline-flex items-center gap-2 rounded border px-2 py-1 text-sm transition-colors ${
                    active
                      ? "border-zinc-400 text-zinc-100 bg-zinc-800"
                      : "border-white/10 text-zinc-300 hover:bg-zinc-800"
                  } disabled:cursor-not-allowed disabled:opacity-40`}
                >
                  <span aria-hidden="true" className="size-2.5 rounded-full" style={{ background: t.cssVar }} />
                  {t.label}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={add}
            className="rounded bg-zinc-800 px-3 py-1.5 text-sm hover:bg-zinc-700 disabled:opacity-40"
            disabled={value.some((v) => v.colorToken === tone)}
          >
            Add
          </button>
        </div>
      )}
    </div>
  );
}

function formatPrettyDuration(sec: number): string {
  if (sec >= 60) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    if (s === 0) return `${m} min`;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }
  return `${sec} s`;
}

function TimelinePreview({ thresholds, durationSec }: { thresholds: Threshold[]; durationSec: number }) {
  // Build segments left-to-right as time elapses. Leftmost segment is "above all thresholds"
  // (primary). Each threshold kicks in at elapsed = durationSec - secondsRemaining.
  const sorted = [...thresholds].sort((a, b) => b.secondsRemaining - a.secondsRemaining);
  const segments: Array<{ leftPct: number; widthPct: number; color: string }> = [];

  let prevElapsedPct = 0;
  let currentColor = "var(--primary)";
  for (const t of sorted) {
    const elapsedSec = Math.max(0, durationSec - t.secondsRemaining);
    const elapsedPct = Math.min(100, (elapsedSec / durationSec) * 100);
    if (elapsedPct > prevElapsedPct) {
      segments.push({ leftPct: prevElapsedPct, widthPct: elapsedPct - prevElapsedPct, color: currentColor });
    }
    currentColor = `var(--${t.colorToken})`;
    prevElapsedPct = elapsedPct;
  }
  if (prevElapsedPct < 100) {
    segments.push({ leftPct: prevElapsedPct, widthPct: 100 - prevElapsedPct, color: currentColor });
  }

  return (
    <div className="space-y-1">
      <div
        className="relative h-2.5 w-full overflow-hidden rounded-full bg-white/5"
        role="img"
        aria-label="Preview of when colour thresholds kick in across the session"
      >
        {segments.map((s, i) => (
          <span
            key={i}
            aria-hidden="true"
            className="absolute inset-y-0"
            style={{ left: `${s.leftPct}%`, width: `${s.widthPct}%`, background: s.color }}
          />
        ))}
      </div>
      <div className="flex justify-between text-[10px] uppercase tracking-widest text-zinc-500">
        <span>Start</span>
        <span>0:00</span>
      </div>
    </div>
  );
}
