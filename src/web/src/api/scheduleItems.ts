import { api } from "./client";
import type { ScheduleItemDto } from "./types";

export interface CreateScheduleItemBody {
  title: string;
  speakerName?: string | null;
  scheduledStartUtc: string;
  durationSec: number;
  preRollSec: number;
  autoStart: boolean;
  thresholdsJson?: string | null;
  /** Optional binding to a ProgrammeSlot. Server overwrites start/duration with the slot's authoritative values. */
  programmeSlotId?: string | null;
}

export const scheduleItems = {
  list: (roomId: string) => api<ScheduleItemDto[]>(`/api/rooms/${roomId}/schedule`),
  create: (roomId: string, body: CreateScheduleItemBody) =>
    api<ScheduleItemDto>(`/api/rooms/${roomId}/schedule`, { method: "POST", body: JSON.stringify(body) }),
  update: (roomId: string, itemId: string, body: CreateScheduleItemBody) =>
    api<void>(`/api/rooms/${roomId}/schedule/${itemId}`, { method: "PUT", body: JSON.stringify(body) }),
  reorder: (roomId: string, itemIds: string[]) =>
    api<void>(`/api/rooms/${roomId}/schedule/reorder`, { method: "POST", body: JSON.stringify({ itemIdsInOrder: itemIds }) }),
  remove: (roomId: string, itemId: string) =>
    api<void>(`/api/rooms/${roomId}/schedule/${itemId}`, { method: "DELETE" }),
};
