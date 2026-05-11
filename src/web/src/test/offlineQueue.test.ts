import { describe, it, expect, beforeEach } from "vitest";
import {
  enqueue,
  readAll,
  readForRoom,
  countForRoom,
  removeById,
  clearForRoom,
  clearAll,
  isApplicable,
  applyOptimistic,
  type QueuedCommand,
} from "@/lib/offlineQueue";
import type { Snapshot } from "@/api/types";

function makeSnapshot(overrides: Partial<Snapshot> = {}): Snapshot {
  return {
    roomId: "room-a",
    currentItem: null,
    currentRunId: null,
    nextItem: null,
    phase: "Idle",
    startedAtUtc: null,
    preRollEndsAtUtc: null,
    pauseStartedAtUtc: null,
    pausedAccumSec: 0,
    adjustmentSec: 0,
    pauseRemainingMs: null,
    currentMessage: null,
    serverNowUtc: new Date().toISOString(),
    version: 1,
    ...overrides,
  };
}

describe("offlineQueue", () => {
  beforeEach(() => {
    clearAll();
  });

  describe("enqueue + read", () => {
    it("persists a command and returns it with id + ts", () => {
      const entry = enqueue({ roomId: "room-a", kind: "pause" });
      expect(entry.id).toMatch(/[a-z0-9-]+/);
      expect(entry.ts).toBeGreaterThan(0);
      expect(readAll()).toHaveLength(1);
    });

    it("maintains FIFO order across rooms", () => {
      enqueue({ roomId: "room-a", kind: "pause" });
      enqueue({ roomId: "room-b", kind: "resume" });
      enqueue({ roomId: "room-a", kind: "adjustTime", payload: { deltaSec: 60 } });
      const all = readAll();
      expect(all.map((c) => c.kind)).toEqual(["pause", "resume", "adjustTime"]);
    });

    it("readForRoom filters by roomId", () => {
      enqueue({ roomId: "room-a", kind: "pause" });
      enqueue({ roomId: "room-b", kind: "resume" });
      enqueue({ roomId: "room-a", kind: "clearMessage" });
      expect(readForRoom("room-a")).toHaveLength(2);
      expect(readForRoom("room-b")).toHaveLength(1);
    });

    it("countForRoom counts by roomId", () => {
      enqueue({ roomId: "room-a", kind: "pause" });
      enqueue({ roomId: "room-a", kind: "resume" });
      enqueue({ roomId: "room-b", kind: "pause" });
      expect(countForRoom("room-a")).toBe(2);
      expect(countForRoom("room-b")).toBe(1);
      expect(countForRoom("room-x")).toBe(0);
    });
  });

  describe("removeById + clearForRoom", () => {
    it("removeById removes only that entry", () => {
      const a = enqueue({ roomId: "room-a", kind: "pause" });
      enqueue({ roomId: "room-a", kind: "resume" });
      removeById(a.id);
      expect(readAll()).toHaveLength(1);
      expect(readAll()[0].kind).toBe("resume");
    });

    it("clearForRoom removes only that room's entries", () => {
      enqueue({ roomId: "room-a", kind: "pause" });
      enqueue({ roomId: "room-b", kind: "pause" });
      clearForRoom("room-a");
      expect(readAll()).toHaveLength(1);
      expect(readAll()[0].roomId).toBe("room-b");
    });
  });

  describe("isApplicable", () => {
    const cmd = (kind: QueuedCommand["kind"]): QueuedCommand => ({ id: "x", ts: 0, roomId: "r", kind });

    it("pause applies only when Running", () => {
      expect(isApplicable(cmd("pause"), makeSnapshot({ phase: "Running" }))).toBe(true);
      expect(isApplicable(cmd("pause"), makeSnapshot({ phase: "Paused" }))).toBe(false);
      expect(isApplicable(cmd("pause"), makeSnapshot({ phase: "Idle" }))).toBe(false);
    });

    it("resume applies only when Paused", () => {
      expect(isApplicable(cmd("resume"), makeSnapshot({ phase: "Paused" }))).toBe(true);
      expect(isApplicable(cmd("resume"), makeSnapshot({ phase: "Running" }))).toBe(false);
    });

    it("adjustTime applies in Running OR Paused", () => {
      expect(isApplicable(cmd("adjustTime"), makeSnapshot({ phase: "Running" }))).toBe(true);
      expect(isApplicable(cmd("adjustTime"), makeSnapshot({ phase: "Paused" }))).toBe(true);
      expect(isApplicable(cmd("adjustTime"), makeSnapshot({ phase: "Idle" }))).toBe(false);
      expect(isApplicable(cmd("adjustTime"), makeSnapshot({ phase: "Ended" }))).toBe(false);
    });

    it("setMessage / clearMessage always apply (last-write-wins)", () => {
      for (const phase of ["Idle", "PreRoll", "Running", "Paused", "Ended"] as const) {
        expect(isApplicable(cmd("setMessage"), makeSnapshot({ phase }))).toBe(true);
        expect(isApplicable(cmd("clearMessage"), makeSnapshot({ phase }))).toBe(true);
      }
    });
  });

  describe("applyOptimistic", () => {
    it("pause flips Running → Paused", () => {
      const next = applyOptimistic(
        { id: "x", ts: 0, roomId: "r", kind: "pause" },
        makeSnapshot({ phase: "Running" }),
      );
      expect(next.phase).toBe("Paused");
      expect(next.pauseStartedAtUtc).not.toBeNull();
    });

    it("pause is a no-op outside Running", () => {
      const s = makeSnapshot({ phase: "Idle" });
      expect(applyOptimistic({ id: "x", ts: 0, roomId: "r", kind: "pause" }, s)).toEqual(s);
    });

    it("resume flips Paused → Running and clears pauseStartedAtUtc", () => {
      const next = applyOptimistic(
        { id: "x", ts: 0, roomId: "r", kind: "resume" },
        makeSnapshot({ phase: "Paused", pauseStartedAtUtc: "2026-05-11T10:00:00Z" }),
      );
      expect(next.phase).toBe("Running");
      expect(next.pauseStartedAtUtc).toBeNull();
    });

    it("adjustTime accumulates onto adjustmentSec", () => {
      const next = applyOptimistic(
        { id: "x", ts: 0, roomId: "r", kind: "adjustTime", payload: { deltaSec: 60 } },
        makeSnapshot({ phase: "Running", adjustmentSec: 30 }),
      );
      expect(next.adjustmentSec).toBe(90);
    });

    it("setMessage / clearMessage update currentMessage", () => {
      const setNext = applyOptimistic(
        { id: "x", ts: 0, roomId: "r", kind: "setMessage", payload: { message: "Wrap up" } },
        makeSnapshot(),
      );
      expect(setNext.currentMessage).toBe("Wrap up");
      const clearNext = applyOptimistic(
        { id: "y", ts: 0, roomId: "r", kind: "clearMessage" },
        makeSnapshot({ currentMessage: "x" }),
      );
      expect(clearNext.currentMessage).toBeNull();
    });
  });
});
