export type TimerPhase = "Idle" | "PreRoll" | "Running" | "Paused" | "Ended";

export interface Threshold {
  secondsRemaining: number;
  colorToken: string;
  label?: string;
}

export interface SnapshotItem {
  id: string;
  title: string;
  speakerName?: string;
  scheduledStartUtc: string;
  durationSec: number;
  preRollSec: number;
  thresholds: Threshold[];
}

export interface SnapshotNextItem {
  id: string;
  title: string;
  scheduledStartUtc: string;
}

export interface Snapshot {
  roomId: string;
  currentItem: SnapshotItem | null;
  currentRunId: string | null;
  nextItem: SnapshotNextItem | null;
  phase: TimerPhase;
  startedAtUtc: string | null;
  preRollEndsAtUtc: string | null;
  pauseStartedAtUtc: string | null;
  pausedAccumSec: number;
  adjustmentSec: number;
  pauseRemainingMs: number | null;
  currentMessage: string | null;
  serverNowUtc: string;
  version: number;
}

export interface EventDto {
  id: string;
  name: string;
  timeZone: string;
  startsAtUtc: string;
  endsAtUtc: string;
  lobbyAccessCode: string;
}

export interface RoomDto {
  id: string;
  eventId: string;
  name: string;
  accessCode: string;
  defaultPreRollSec: number;
  /** Opaque JSON; parse with parseDoorConfig() from lib/doorDisplayConfig. */
  doorDisplayConfigJson: string;
  /** Bound programme (event-level high-level time schedule). Null when the room schedules freely. */
  programmeId: string | null;
}

export interface ScheduleItemDto {
  id: string;
  position: number;
  title: string;
  speakerName: string | null;
  scheduledStartUtc: string;
  durationSec: number;
  preRollSec: number;
  autoStart: boolean;
  thresholdsJson: string | null;
  /** When set, this item is bound to a ProgrammeSlot; its start/duration mirror the slot. */
  programmeSlotId: string | null;
}
