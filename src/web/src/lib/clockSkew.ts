/**
 * Returns the number of milliseconds to ADD to local Date.now() to get the server's UtcNow.
 * Computed from a snapshot's serverNowUtc, taking the moment we received it as our local
 * reference. Tiny network latency is ignored (~5–50ms is fine for a 1-second timer).
 */
export function measureSkew(serverNowUtcIso: string, localNowMs: number = Date.now()): number {
  return new Date(serverNowUtcIso).getTime() - localNowMs;
}

export function serverNow(skewMs: number): number {
  return Date.now() + skewMs;
}
