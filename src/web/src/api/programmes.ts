import { api } from "./client";

export interface ProgrammeSlotDto {
  id: string;
  programmeId: string;
  position: number;
  label: string;
  startUtc: string;
  durationSec: number;
  /** How many ScheduleItems are bound to this slot. Surfaced so the UI can show usage and warn on cascading edits. */
  linkedItemCount: number;
}

export interface ProgrammeDto {
  id: string;
  eventId: string;
  name: string;
  slots: ProgrammeSlotDto[];
}

export interface CreateSlotBody {
  label: string;
  startUtc: string;
  durationSec: number;
}

export interface UpdateSlotBody extends CreateSlotBody {
  /** "update" (default) pushes new timing to every linked session. "detach" leaves each
   *  session's existing time intact and clears its slot reference. */
  cascade?: "update" | "detach";
}

export const programmes = {
  list: (eventId: string) => api<ProgrammeDto[]>(`/api/events/${eventId}/programmes`),
  create: (eventId: string, name: string) =>
    api<ProgrammeDto>(`/api/events/${eventId}/programmes`, {
      method: "POST", body: JSON.stringify({ name }),
    }),
  rename: (eventId: string, programmeId: string, name: string) =>
    api<void>(`/api/events/${eventId}/programmes/${programmeId}`, {
      method: "PUT", body: JSON.stringify({ name }),
    }),
  remove: (eventId: string, programmeId: string) =>
    api<void>(`/api/events/${eventId}/programmes/${programmeId}`, { method: "DELETE" }),

  createSlot: (eventId: string, programmeId: string, body: CreateSlotBody) =>
    api<ProgrammeSlotDto>(`/api/events/${eventId}/programmes/${programmeId}/slots`, {
      method: "POST", body: JSON.stringify(body),
    }),
  updateSlot: (eventId: string, programmeId: string, slotId: string, body: UpdateSlotBody) =>
    api<void>(`/api/events/${eventId}/programmes/${programmeId}/slots/${slotId}`, {
      method: "PUT", body: JSON.stringify(body),
    }),
  removeSlot: (eventId: string, programmeId: string, slotId: string) =>
    api<void>(`/api/events/${eventId}/programmes/${programmeId}/slots/${slotId}`, { method: "DELETE" }),
  reorderSlots: (eventId: string, programmeId: string, slotIds: string[]) =>
    api<void>(`/api/events/${eventId}/programmes/${programmeId}/slots/reorder`, {
      method: "POST", body: JSON.stringify({ slotIdsInOrder: slotIds }),
    }),
};
