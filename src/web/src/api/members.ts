import { api } from "./client";

export type EventRoleName = "EventAdmin" | "RoomOperator" | "Viewer";
export const roleNumeric: Record<EventRoleName, number> = { EventAdmin: 1, RoomOperator: 2, Viewer: 3 };

export interface MemberDto {
  id: string;
  userId: string;
  email: string;
  displayName: string | null;
  role: EventRoleName;
  scopedRoomIds: string[];
  isLocked: boolean;
  lockoutEndUtc: string | null;
}
export interface UpdateRoleBody { role: number; scopedRoomIds: string[] | null }
export interface UpdateProfileBody { displayName: string | null; email: string | null }

export const members = {
  list: (eventId: string) => api<MemberDto[]>(`/api/events/${eventId}/members`),
  updateRole: (eventId: string, membershipId: string, body: UpdateRoleBody) =>
    api<void>(`/api/events/${eventId}/members/${membershipId}`, { method: "PUT", body: JSON.stringify(body) }),
  remove: (eventId: string, membershipId: string) =>
    api<void>(`/api/events/${eventId}/members/${membershipId}`, { method: "DELETE" }),

  /** Email-the-link reset path. Admin doesn't see the password. */
  sendResetLink: (eventId: string, membershipId: string) =>
    api<{ emailSent: boolean }>(`/api/events/${eventId}/members/${membershipId}/reset-link`, { method: "POST" }),
  /** Admin force-sets a temp password and communicates it out-of-band. */
  setTempPassword: (eventId: string, membershipId: string, newPassword: string) =>
    api<void>(`/api/events/${eventId}/members/${membershipId}/temp-password`, {
      method: "POST", body: JSON.stringify({ newPassword }),
    }),
  updateProfile: (eventId: string, membershipId: string, body: UpdateProfileBody) =>
    api<void>(`/api/events/${eventId}/members/${membershipId}/profile`, {
      method: "PUT", body: JSON.stringify(body),
    }),
  lock: (eventId: string, membershipId: string, until: string | null = null) =>
    api<void>(`/api/events/${eventId}/members/${membershipId}/lock`, {
      method: "POST", body: JSON.stringify({ until }),
    }),
  unlock: (eventId: string, membershipId: string) =>
    api<void>(`/api/events/${eventId}/members/${membershipId}/unlock`, { method: "POST" }),
};

export const passwordReset = {
  apply: (userId: string, token: string, newPassword: string) =>
    api<void>(`/api/auth/password/reset`, {
      method: "POST", body: JSON.stringify({ userId, token, newPassword }),
    }),
};
