import type { Snapshot, TimerPhase } from "@/api/types";

/**
 * Per-room queue of operator commands issued while the SignalR connection was down.
 * Persisted to localStorage so it survives page refresh and tab navigation. Validated
 * against the fresh server snapshot on reconnect and best-effort flushed.
 *
 * Only safe / non-destructive commands are eligible for queueing — see
 * EligibleCommandKind. Destructive actions (Stop/Skip/Reset/StartItem/StartAuto) and
 * commands that need a server-assigned id (creating a schedule item via Quick timer)
 * are disabled in the UI while offline.
 */
export type EligibleCommandKind = "pause" | "resume" | "adjustTime" | "setMessage" | "clearMessage";

export interface QueuedCommand {
  /** Stable identifier so the UI can render queue depth and act on individual entries. */
  id: string;
  /** Wall-clock time the operator clicked. Used only for telemetry / audit context. */
  ts: number;
  roomId: string;
  kind: EligibleCommandKind;
  /** Payload-bearing commands stash their args here. */
  payload?: { deltaSec?: number; message?: string | null };
}

const STORAGE_KEY = "stagecue.offlineQueue.v1";

function safeReadAll(): QueuedCommand[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValid);
  } catch {
    return [];
  }
}

function safeWriteAll(entries: QueuedCommand[]) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Storage full or unavailable; ignore. The user will lose offline buffering but
    // the UI can continue.
  }
}

function isValid(x: unknown): x is QueuedCommand {
  if (!x || typeof x !== "object") return false;
  const o = x as Partial<QueuedCommand>;
  return typeof o.id === "string" && typeof o.ts === "number" && typeof o.roomId === "string" && typeof o.kind === "string";
}

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Add a command to the persistent queue. Returns the new queue length. */
export function enqueue(cmd: Omit<QueuedCommand, "id" | "ts">): QueuedCommand {
  const entry: QueuedCommand = { id: newId(), ts: Date.now(), ...cmd };
  const all = safeReadAll();
  all.push(entry);
  safeWriteAll(all);
  return entry;
}

/** Read all queued commands for any room. */
export function readAll(): QueuedCommand[] {
  return safeReadAll();
}

/** Read all queued commands for a single room (in order). */
export function readForRoom(roomId: string): QueuedCommand[] {
  return safeReadAll().filter((c) => c.roomId === roomId);
}

/** Number of queued commands for a single room. */
export function countForRoom(roomId: string): number {
  return readForRoom(roomId).length;
}

/** Remove a queued command by id. */
export function removeById(id: string) {
  const all = safeReadAll();
  const next = all.filter((c) => c.id !== id);
  if (next.length !== all.length) safeWriteAll(next);
}

/** Clear all queued commands for a single room (used after a successful drain). */
export function clearForRoom(roomId: string) {
  const all = safeReadAll();
  const next = all.filter((c) => c.roomId !== roomId);
  if (next.length !== all.length) safeWriteAll(next);
}

/** Clear the entire queue across all rooms. Mostly for tests. */
export function clearAll() {
  safeWriteAll([]);
}

/**
 * Decide whether a queued command should still be applied given the latest server snapshot.
 * "Best-effort silent flush" — commands that no longer make sense (e.g. Pause when phase
 * is now Idle because another operator already stopped) are skipped, not failed.
 */
export function isApplicable(cmd: QueuedCommand, snapshot: Snapshot): boolean {
  const phase: TimerPhase = snapshot.phase;
  switch (cmd.kind) {
    case "pause":
      return phase === "Running";
    case "resume":
      return phase === "Paused";
    case "adjustTime":
      return phase === "Running" || phase === "Paused";
    case "setMessage":
    case "clearMessage":
      // Last-write-wins by design (spec §4.5, §6.4) — always applicable.
      return true;
  }
}

/**
 * Apply a queued command's intent to the in-memory snapshot so the operator sees their
 * offline action take effect immediately. NOT a replacement for server reconciliation —
 * the server will return a fresh snapshot when the command is flushed on reconnect.
 */
export function applyOptimistic(cmd: QueuedCommand, snapshot: Snapshot): Snapshot {
  switch (cmd.kind) {
    case "pause":
      if (snapshot.phase !== "Running") return snapshot;
      return { ...snapshot, phase: "Paused", pauseStartedAtUtc: new Date().toISOString() };
    case "resume":
      if (snapshot.phase !== "Paused") return snapshot;
      return { ...snapshot, phase: "Running", pauseStartedAtUtc: null };
    case "adjustTime": {
      const delta = cmd.payload?.deltaSec ?? 0;
      return { ...snapshot, adjustmentSec: snapshot.adjustmentSec + delta };
    }
    case "setMessage":
      return { ...snapshot, currentMessage: cmd.payload?.message ?? null };
    case "clearMessage":
      return { ...snapshot, currentMessage: null };
  }
}
