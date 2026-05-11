import { api } from "./client";
import type { RoomDto, ScheduleItemDto } from "./types";

export interface CreateRoomBody { name: string; defaultPreRollSec: number; programmeId?: string | null }
export interface UpdateRoomBody { name: string; defaultPreRollSec: number; programmeId: string | null }

export const rooms = {
  schedule: (roomId: string) => api<ScheduleItemDto[]>(`/api/rooms/${roomId}/schedule`),
  create: (eventId: string, body: CreateRoomBody) =>
    api<RoomDto>(`/api/events/${eventId}/rooms`, { method: "POST", body: JSON.stringify(body) }),
  update: (eventId: string, roomId: string, body: UpdateRoomBody) =>
    api<void>(`/api/events/${eventId}/rooms/${roomId}`, { method: "PUT", body: JSON.stringify(body) }),
  remove: (eventId: string, roomId: string) =>
    api<void>(`/api/events/${eventId}/rooms/${roomId}`, { method: "DELETE" }),
  regenerateAccessCode: (eventId: string, roomId: string) =>
    api<RoomDto>(`/api/events/${eventId}/rooms/${roomId}/regenerate-access-code`, { method: "POST" }),
  updateDoorConfig: (eventId: string, roomId: string, doorDisplayConfigJson: string) =>
    api<void>(`/api/events/${eventId}/rooms/${roomId}/door-config`, {
      method: "PUT", body: JSON.stringify({ doorDisplayConfigJson }),
    }),
};
