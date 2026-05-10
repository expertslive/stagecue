import { api } from "./client";
import type { ScheduleItemDto } from "./types";

export const rooms = {
  schedule: (roomId: string) => api<ScheduleItemDto[]>(`/api/rooms/${roomId}/schedule`),
};
