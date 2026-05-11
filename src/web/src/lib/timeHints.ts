export function relativeStartHint(iso: string, now: number = Date.now()): string {
  const target = new Date(iso).getTime();
  const diff = target - now;
  const absSec = Math.abs(Math.round(diff / 1000));

  if (absSec < 60) return diff >= 0 ? `in ${absSec} sec` : `${absSec} sec ago`;
  const min = Math.round(absSec / 60);
  if (min < 60) return diff >= 0 ? `in ${min} min` : `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 12) return diff >= 0 ? `in ${hr} h` : `${hr} h ago`;

  const d = new Date(target);
  const today = new Date(now);
  const sameDay = d.toDateString() === today.toDateString();
  const tomorrow = new Date(now + 24 * 3600 * 1000);
  const isTomorrow = d.toDateString() === tomorrow.toDateString();
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (sameDay) return `today at ${time}`;
  if (isTomorrow) return `tomorrow at ${time}`;
  return d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
