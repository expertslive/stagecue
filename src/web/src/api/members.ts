import { api } from "./client";

export type EventRoleName = "EventAdmin" | "RoomOperator" | "Viewer";
export const roleNumeric: Record<EventRoleName, number> = { EventAdmin: 1, RoomOperator: 2, Viewer: 3 };

export interface MemberDto {
  id: string; userId: string; email: string; displayName: string | null;
  role: EventRoleName; scopedRoomIds: string[];
}
export interface UpdateRoleBody { role: number; scopedRoomIds: string[] | null }

export const members = {
  list: (eventId: string) => api<MemberDto[]>(`/api/events/${eventId}/members`),
  updateRole: (eventId: string, membershipId: string, body: UpdateRoleBody) =>
    api<void>(`/api/events/${eventId}/members/${membershipId}`, { method: "PUT", body: JSON.stringify(body) }),
  remove: (eventId: string, membershipId: string) =>
    api<void>(`/api/events/${eventId}/members/${membershipId}`, { method: "DELETE" }),
};
