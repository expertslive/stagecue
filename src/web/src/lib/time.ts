/**
 * Formats a remaining millisecond value as MM:SS for ≤59:59,
 * H:MM:SS for ≥1 hour, or +MM:SS / +H:MM:SS when negative (overrun count-up).
 */
export function formatRemaining(remainingMs: number): string {
  const overrun = remainingMs < 0;
  const totalSec = Math.floor(Math.abs(remainingMs) / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  const body = h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  return overrun ? `+${body}` : body;
}
