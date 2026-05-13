import { describe, expect, it } from "vitest";
import { displayOptionsFromSearch, progressForSnapshot, speakerDisplayState } from "./speakerDisplay";
import type { Snapshot } from "@/api/types";

const baseSnapshot: Snapshot = {
  roomId: "room-1",
  currentItem: {
    id: "item-1",
    title: "Opening Keynote",
    speakerName: "Alex",
    scheduledStartUtc: "2026-05-12T10:00:00Z",
    durationSec: 600,
    preRollSec: 30,
    thresholds: [],
  },
  currentRunId: "run-1",
  nextItem: null,
  phase: "Running",
  startedAtUtc: "2026-05-12T10:00:00Z",
  preRollEndsAtUtc: null,
  pauseStartedAtUtc: null,
  pausedAccumSec: 0,
  adjustmentSec: 0,
  pauseRemainingMs: null,
  currentMessage: null,
  serverNowUtc: "2026-05-12T10:00:00Z",
  version: 1,
};

describe("displayOptionsFromSearch", () => {
  it("uses conservative defaults for confidence monitors", () => {
    expect(displayOptionsFromSearch("")).toEqual({
      scale: "standard",
      margin: "standard",
      contrast: "standard",
      chrome: "standard",
      progress: "line",
    });
  });

  it("parses display calibration options from the URL", () => {
    expect(displayOptionsFromSearch("?scale=large&margin=safe&contrast=high&chrome=minimal&progress=ring")).toEqual({
      scale: "large",
      margin: "safe",
      contrast: "high",
      chrome: "minimal",
      progress: "ring",
    });
  });
});

describe("speakerDisplayState", () => {
  it("labels overrun as over time", () => {
    const result = speakerDisplayState(baseSnapshot, -1);
    expect(result.label).toBe("Over time");
    expect(result.kind).toBe("overrun");
  });

  it("labels pre-roll as starts in", () => {
    const result = speakerDisplayState({ ...baseSnapshot, phase: "PreRoll", preRollEndsAtUtc: "2026-05-12T10:00:30Z", startedAtUtc: null }, 10_000);
    expect(result.label).toBe("Starts in");
    expect(result.kind).toBe("preRoll");
  });
});

describe("progressForSnapshot", () => {
  it("returns elapsed progress for a running item", () => {
    expect(progressForSnapshot(baseSnapshot, 300_000)).toBe(0.5);
  });

  it("caps overrun progress at full", () => {
    expect(progressForSnapshot(baseSnapshot, -10_000)).toBe(1);
  });
});
