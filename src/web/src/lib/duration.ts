export function formatMmss(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const mm = Math.floor(safe / 60);
  const ss = safe % 60;
  return `${mm}:${ss.toString().padStart(2, "0")}`;
}

/** Parse "MM:SS" or a raw integer (interpreted as seconds). Returns null on invalid input. */
export function parseDuration(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  const colon = trimmed.match(/^(\d{1,3}):(\d{1,2})$/);
  if (colon) {
    const m = parseInt(colon[1], 10);
    const s = parseInt(colon[2], 10);
    if (s >= 60) return null;
    return m * 60 + s;
  }
  if (/^\d+$/.test(trimmed)) {
    const raw = parseInt(trimmed, 10);
    if (Number.isFinite(raw)) return raw;
  }
  return null;
}
