import { api } from "./client";
import type { RoomDto, ScheduleItemDto } from "./types";

export const rooms = {
  schedule: (roomId: string) => api<ScheduleItemDto[]>(`/api/rooms/${roomId}/schedule`),
  regenerateAccessCode: (eventId: string, roomId: string) =>
    api<RoomDto>(`/api/events/${eventId}/rooms/${roomId}/regenerate-access-code`, { method: "POST" }),
};
