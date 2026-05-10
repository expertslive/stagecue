import { useState } from "react";
import type { Threshold } from "@/api/types";
import { X } from "lucide-react";

interface Props { value: Threshold[]; onChange: (next: Threshold[]) => void }

const tokenOptions = ["warning", "danger", "final", "primary", "accent"];

export default function ThresholdsEditor({ value, onChange }: Props) {
  const [seconds, setSeconds] = useState("");
  const [token, setToken] = useState("warning");

  function add() {
    const s = parseInt(seconds, 10);
    if (!Number.isFinite(s) || s <= 0) return;
    const next = [...value, { secondsRemaining: s, colorToken: token }]
      .sort((a, b) => b.secondsRemaining - a.secondsRemaining);
    onChange(next);
    setSeconds("");
  }

  return (
    <div className="space-y-2">
      <ul className="space-y-1">
        {value.map((t, i) => (
          <li key={i} className="flex items-center justify-between rounded bg-zinc-900 px-3 py-1.5 text-sm">
            <span className="font-mono">≤ {t.secondsRemaining}s</span>
            <span className="text-zinc-400">{t.colorToken}</span>
            <button onClick={() => onChange(value.filter((_, j) => j !== i))} className="text-zinc-500 hover:text-zinc-300">
              <X className="size-4" />
            </button>
          </li>
        ))}
        {value.length === 0 && <li className="text-xs text-zinc-500">No thresholds. Display will use the primary color throughout.</li>}
      </ul>
      <div className="flex gap-2 items-center">
        <input
          type="number" min={1} placeholder="seconds" value={seconds}
          onChange={(e) => setSeconds(e.target.value)}
          className="w-24 px-2 py-1 rounded bg-zinc-900 border border-zinc-800 text-sm font-mono" />
        <select value={token} onChange={(e) => setToken(e.target.value)}
          className="px-2 py-1 rounded bg-zinc-900 border border-zinc-800 text-sm">
          {tokenOptions.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <button type="button" onClick={add} className="px-3 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-sm">Add</button>
      </div>
    </div>
  );
}
