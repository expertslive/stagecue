export interface RehearsalClockInput {
  enabled: boolean;
  speed: number;
  baseSkewMs: number;
  anchorNowMs: number;
  nowMs: number;
}

export function rehearsalSkew({ enabled, speed, baseSkewMs, anchorNowMs, nowMs }: RehearsalClockInput): number {
  if (!enabled) return baseSkewMs;
  const elapsed = Math.max(0, nowMs - anchorNowMs);
  return baseSkewMs + elapsed * Math.max(0, speed - 1);
}
