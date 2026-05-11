import type { EventDto, RoomDto, ScheduleItemDto } from "@/api/types";
import type { DisplayPresence } from "@/hub/timerHub";

export interface PreflightItem {
  id: "event-window" | "rooms" | "room-schedules" | "speaker-displays" | "lobby-display";
  label: string;
  detail: string;
  ok: boolean;
}

export interface PreflightResult {
  ready: boolean;
  items: PreflightItem[];
}

export function evaluatePreflight(
  event: EventDto,
  rooms: RoomDto[],
  schedules: Record<string, ScheduleItemDto[]>,
  presence: DisplayPresence,
): PreflightResult {
  const starts = new Date(event.startsAtUtc).getTime();
  const ends = new Date(event.endsAtUtc).getTime();
  const roomsWithSchedule = rooms.filter((room) => (schedules[room.id] ?? []).length > 0).length;
  const roomsWithSpeaker = rooms.filter((room) => (presence.rooms[room.id]?.speaker ?? 0) > 0).length;

  const items: PreflightItem[] = [
    {
      id: "event-window",
      label: "Event window",
      detail: Number.isFinite(starts) && Number.isFinite(ends) && ends > starts
        ? "Start and end time are valid"
        : "Check the event start and end time",
      ok: Number.isFinite(starts) && Number.isFinite(ends) && ends > starts,
    },
    {
      id: "rooms",
      label: "Rooms",
      detail: rooms.length === 1 ? "1 room configured" : `${rooms.length} rooms configured`,
      ok: rooms.length > 0,
    },
    {
      id: "room-schedules",
      label: "Schedules",
      detail: rooms.length === 0 ? "No rooms to schedule" : `${roomsWithSchedule}/${rooms.length} rooms have items`,
      ok: rooms.length > 0 && roomsWithSchedule === rooms.length,
    },
    {
      id: "speaker-displays",
      label: "Speaker displays",
      detail: rooms.length === 0 ? "No rooms to connect" : `${roomsWithSpeaker}/${rooms.length} rooms have a speaker screen`,
      ok: rooms.length > 0 && roomsWithSpeaker === rooms.length,
    },
    {
      id: "lobby-display",
      label: "Lobby display",
      detail: presence.lobby > 0 ? `${presence.lobby} connected` : "No lobby display connected",
      ok: presence.lobby > 0,
    },
  ];

  return { ready: items.every((item) => item.ok), items };
}
