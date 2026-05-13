import { api } from "./client";

export interface RoomInfo {
  roomId: string;
  roomName: string;
  eventId: string;
  eventName: string;
  /** Opaque JSON; parse with parseDoorConfig() from lib/doorDisplayConfig. */
  doorDisplayConfigJson: string;
}
export interface LobbyScheduleItem {
  id: string;
  title: string;
  speakerName: string | null;
  scheduledStartUtc: string;
  durationSec: number;
}
export interface LobbyRoom {
  id: string;
  name: string;
  scheduleItems: LobbyScheduleItem[];
}
export interface LobbyInfo {
  eventId: string;
  eventName: string;
  startsAtUtc: string;
  endsAtUtc: string;
  timeZone: string;
  rooms: LobbyRoom[];
}

export const publicInfo = {
  room: (code: string) => api<RoomInfo>(`/r/${code}/info`),
  lobby: (code: string) => api<LobbyInfo>(`/e/${code}/info`),
};
