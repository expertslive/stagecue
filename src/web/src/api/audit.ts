import { api } from "./client";

export interface AuditEntryDto {
  id: string; atUtc: string;
  userId: string | null; userEmail: string | null;
  roomId: string | null; roomName: string | null;
  action: string; detailsJson: string;
}

export const audit = {
  list: (eventId: string, take = 200) => api<AuditEntryDto[]>(`/api/events/${eventId}/audit?take=${take}`),
};
