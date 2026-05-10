import { api } from "./client";

export interface RoomInfo { roomId: string; roomName: string; eventId: string; eventName: string }
export interface LobbyInfo { eventId: string; eventName: string; rooms: { id: string; name: string }[] }

export const publicInfo = {
  room: (code: string) => api<RoomInfo>(`/r/${code}/info`),
  lobby: (code: string) => api<LobbyInfo>(`/e/${code}/info`),
};
