import { useCallback, useEffect, useRef, useState } from "react";
import type { Snapshot } from "@/api/types";
import type { TimerHub, ConnectionState } from "./timerHub";
import {
  enqueue,
  readForRoom,
  countForRoom,
  removeById,
  isApplicable,
  applyOptimistic,
  type QueuedCommand,
  type EligibleCommandKind,
} from "@/lib/offlineQueue";

export interface UseOfflineCommandsResult {
  /** Live snapshot, possibly with locally-applied optimistic updates while offline. */
  snapshot: Snapshot | null;
  /** True when the hub is healthy enough to fire commands directly. */
  online: boolean;
  /** Number of queued commands for this room waiting to be flushed. */
  queuedCount: number;
  /** Issue a pause. Online → server. Offline → queue + optimistic apply. */
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  adjustTime: (deltaSec: number) => Promise<void>;
  setMessage: (text: string | null) => Promise<void>;
  clearMessage: () => Promise<void>;
}

interface Options {
  hub: TimerHub | null;
  serverSnapshot: Snapshot | null;
  connectionState: ConnectionState;
  /** Notified once after a reconnect flush: `(synced, skipped)`. */
  onReconcile?: (synced: number, skipped: number) => void;
  /** Notified when a command fires (online) for telemetry / toast purposes. */
  onError?: (err: Error) => void;
}

/**
 * Wraps a single-room TimerHub with offline-queue semantics:
 * - When connected: forward commands to the hub.
 * - When disconnected/reconnecting: enqueue the command + apply it optimistically to a
 *   local mirror of the snapshot so the operator sees the result immediately.
 * - On reconnect to "connected": drain the queue in order, validate each entry against
 *   the fresh server snapshot, apply or skip silently, then report back via onReconcile.
 *
 * The local mirror is reset to the server snapshot every time a fresh snapshot arrives
 * AND every time the queue is fully drained.
 */
export function useOfflineCommands({ hub, serverSnapshot, connectionState, onReconcile, onError }: Options): UseOfflineCommandsResult {
  const roomId = serverSnapshot?.roomId ?? null;

  // Local mirror = serverSnapshot + any unflushed optimistic operations.
  const [optimistic, setOptimistic] = useState<Snapshot | null>(serverSnapshot);
  const [queuedCount, setQueuedCount] = useState(0);

  // Track previous connection state so we can detect reconnect transitions.
  const prevStateRef = useRef<ConnectionState>(connectionState);

  // Recompute optimistic mirror whenever the server snapshot changes or roomId switches.
  useEffect(() => {
    if (!roomId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOptimistic(serverSnapshot);
      return;
    }
    let snap = serverSnapshot;
    if (snap) {
      const pending = readForRoom(roomId);
      for (const cmd of pending) {
        if (isApplicable(cmd, snap)) snap = applyOptimistic(cmd, snap);
      }
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOptimistic(snap);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setQueuedCount(roomId ? countForRoom(roomId) : 0);
  }, [serverSnapshot, roomId]);

  // Drain the queue on reconnect.
  useEffect(() => {
    const prev = prevStateRef.current;
    prevStateRef.current = connectionState;
    if (!hub || !roomId) return;
    const justReconnected = connectionState === "connected" && prev !== "connected";
    if (!justReconnected) return;

    let cancelled = false;
    (async () => {
      // Always resync first so we have an authoritative version + state before replaying.
      let fresh: Snapshot | null = null;
      try {
        fresh = await hub.resync(roomId);
      } catch {
        return; // Will retry next reconnect.
      }
      if (cancelled || !fresh) return;

      const pending = readForRoom(roomId);
      if (pending.length === 0) return;

      let synced = 0;
      let skipped = 0;
      let cursor: Snapshot = fresh;

      for (const cmd of pending) {
        if (!isApplicable(cmd, cursor)) {
          removeById(cmd.id);
          skipped += 1;
          continue;
        }
        try {
          const next = await flushCommand(hub, cmd, cursor.version);
          if (next) cursor = next;
          removeById(cmd.id);
          synced += 1;
        } catch {
          // Stop draining on first hard failure so order is preserved. The next reconnect
          // (or operator retry) can pick up where we left off.
          break;
        }
      }
      if (cancelled) return;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setQueuedCount(countForRoom(roomId));
      onReconcile?.(synced, skipped);
    })();

    return () => { cancelled = true; };
  }, [connectionState, hub, roomId, onReconcile]);

  // Helper: send-online-or-queue.
  const send = useCallback(
    async (kind: EligibleCommandKind, payload?: QueuedCommand["payload"]) => {
      if (!roomId) return;
      const online = connectionState === "connected" && hub?.isConnected();
      if (online && hub && optimistic) {
        try {
          await invokeOnline(hub, kind, roomId, optimistic.version, payload);
          // The hub will broadcast a fresh snapshot via its onSnapshot listener; nothing
          // else to do here.
        } catch (e) {
          onError?.(e as Error);
        }
        return;
      }
      // Offline / reconnecting: enqueue + optimistic.
      const entry = enqueue({ roomId, kind, payload });
      setQueuedCount(countForRoom(roomId));
      setOptimistic((prev) => (prev ? applyOptimistic(entry, prev) : prev));
    },
    [connectionState, hub, optimistic, roomId, onError],
  );

  const pause = useCallback(() => send("pause"), [send]);
  const resume = useCallback(() => send("resume"), [send]);
  const adjustTime = useCallback((deltaSec: number) => send("adjustTime", { deltaSec }), [send]);
  const setMessage = useCallback((text: string | null) => send("setMessage", { message: text }), [send]);
  const clearMessage = useCallback(() => send("clearMessage"), [send]);

  return {
    snapshot: optimistic,
    online: connectionState === "connected",
    queuedCount,
    pause,
    resume,
    adjustTime,
    setMessage,
    clearMessage,
  };
}

function invokeOnline(hub: TimerHub, kind: EligibleCommandKind, roomId: string, version: number, payload: QueuedCommand["payload"]) {
  switch (kind) {
    case "pause": return hub.pause(roomId, version);
    case "resume": return hub.resume(roomId, version);
    case "adjustTime": return hub.adjustTime(roomId, payload?.deltaSec ?? 0, version);
    case "setMessage": return hub.setMessage(roomId, payload?.message ?? null);
    case "clearMessage": return hub.clearMessage(roomId);
  }
}

function flushCommand(hub: TimerHub, cmd: QueuedCommand, version: number) {
  return invokeOnline(hub, cmd.kind, cmd.roomId, version, cmd.payload);
}
