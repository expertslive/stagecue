import { api } from "./client";

export interface InvitationDto {
  id: string; email: string; role: string; scopedRoomIds: string[];
  expiresAt: string; acceptedAt: string | null; emailSendFailed: boolean; acceptUrl: string;
}

export const invitations = {
  list: (eventId: string) => api<InvitationDto[]>(`/api/events/${eventId}/invitations`),
  create: (eventId: string, body: { email: string; role: number; scopedRoomIds?: string[] }) =>
    api<InvitationDto>(`/api/events/${eventId}/invitations`, { method: "POST", body: JSON.stringify(body) }),
  revoke: (eventId: string, invitationId: string) =>
    api<void>(`/api/events/${eventId}/invitations/${invitationId}`, { method: "DELETE" }),
  info: (token: string) => api<{ eventName: string; role: string }>(`/api/invitations/${token}/info`),
  accept: (token: string) => api<{ eventId: string }>(`/api/invitations/${token}/accept`, { method: "POST" }),
};
