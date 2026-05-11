import { useEffect, useState } from "react";
import { formatMmss, parseDuration } from "@/lib/duration";

interface Props {
  /** Current value in seconds. */
  value: number;
  /** Called with the new value in seconds when the input commits (blur or Enter). */
  onChange: (seconds: number) => void;
  /** Minimum seconds. Default 0. */
  min?: number;
  /** Maximum seconds. Default 86400 (24h). */
  max?: number;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  id?: string;
  /** Optional aria-label when the surrounding label can't reach the input. */
  "aria-label"?: string;
}

export default function DurationInput({
  value, onChange, min = 0, max = 86400,
  required, disabled, className = "", placeholder = "MM:SS", id,
  "aria-label": ariaLabel,
}: Props) {
  const [text, setText] = useState(() => formatMmss(value));
  const [valid, setValid] = useState(true);

  // Resync the displayed text whenever the parent commits a new value (e.g. opening
  // a different schedule item in the same Sheet instance).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setText(formatMmss(value));
    setValid(true);
  }, [value]);

  function commit() {
    const parsed = parseDuration(text);
    if (parsed == null) {
      setValid(false);
      return;
    }
    const clamped = Math.min(Math.max(parsed, min), max);
    setValid(true);
    setText(formatMmss(clamped));
    if (clamped !== value) onChange(clamped);
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      id={id}
      required={required}
      disabled={disabled}
      placeholder={placeholder}
      value={text}
      aria-label={ariaLabel}
      aria-invalid={!valid || undefined}
      onChange={(e) => { setText(e.target.value); setValid(true); }}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } }}
      className={`px-3 py-2 rounded-lg bg-zinc-950/60 border font-mono text-zinc-100 ${valid ? "border-white/10 focus-visible:border-[var(--cta)]" : "border-red-500"} ${className}`}
    />
  );
}
