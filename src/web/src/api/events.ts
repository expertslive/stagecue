import { api } from "./client";
import type { EventDto, RoomDto } from "./types";

export const events = {
  list: () => api<EventDto[]>("/api/events"),
  get: (eventId: string) => api<EventDto>(`/api/events/${eventId}`),
  create: (body: { name: string; timeZone: string; startsAtUtc: string; endsAtUtc: string }) =>
    api<EventDto>("/api/events", { method: "POST", body: JSON.stringify(body) }),
  rooms: (eventId: string) => api<RoomDto[]>(`/api/events/${eventId}/rooms`),
  regenerateLobbyAccessCode: (eventId: string) =>
    api<EventDto>(`/api/events/${eventId}/regenerate-lobby-access-code`, { method: "POST" }),
};
