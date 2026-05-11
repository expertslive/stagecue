import { describe, expect, it } from "vitest";
import { evaluatePreflight } from "./preflight";
import type { EventDto, RoomDto, ScheduleItemDto } from "@/api/types";
import type { DisplayPresence } from "@/hub/timerHub";

const event: EventDto = {
  id: "event-1",
  name: "Launch",
  timeZone: "Europe/Amsterdam",
  startsAtUtc: "2026-05-11T10:00:00Z",
  endsAtUtc: "2026-05-11T18:00:00Z",
  lobbyAccessCode: "ABCDEFGH",
};

const room: RoomDto = {
  id: "room-1",
  eventId: "event-1",
  name: "Main",
  accessCode: "HGFEDCBA",
  defaultPreRollSec: 30,
};

const item: ScheduleItemDto = {
  id: "item-1",
  position: 1,
  title: "Opening",
  speakerName: "Alex",
  scheduledStartUtc: "2026-05-11T10:15:00Z",
  durationSec: 900,
  preRollSec: 30,
  autoStart: true,
  thresholdsJson: null,
};

describe("evaluatePreflight", () => {
  it("marks a configured event with connected displays as ready", () => {
    const presence: DisplayPresence = { lobby: 1, rooms: { "room-1": { speaker: 1, door: 1, other: 0 } } };
    const result = evaluatePreflight(event, [room], { "room-1": [item] }, presence);
    expect(result.ready).toBe(true);
    expect(result.items.every((x) => x.ok)).toBe(true);
  });

  it("reports missing schedules and displays", () => {
    const presence: DisplayPresence = { lobby: 0, rooms: {} };
    const result = evaluatePreflight(event, [room], { "room-1": [] }, presence);
    expect(result.ready).toBe(false);
    expect(result.items.filter((x) => !x.ok).map((x) => x.id)).toEqual(["room-schedules", "speaker-displays", "lobby-display"]);
  });
});
