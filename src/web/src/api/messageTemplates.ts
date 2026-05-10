import { api } from "./client";

export interface TemplateDto { id: string; text: string; sortOrder: number }

export const templates = {
  list: (eventId: string) => api<TemplateDto[]>(`/api/events/${eventId}/templates`),
  create: (eventId: string, text: string, sortOrder: number) =>
    api<TemplateDto>(`/api/events/${eventId}/templates`, { method: "POST", body: JSON.stringify({ text, sortOrder }) }),
  update: (eventId: string, templateId: string, text: string, sortOrder: number) =>
    api<void>(`/api/events/${eventId}/templates/${templateId}`, { method: "PUT", body: JSON.stringify({ text, sortOrder }) }),
  remove: (eventId: string, templateId: string) =>
    api<void>(`/api/events/${eventId}/templates/${templateId}`, { method: "DELETE" }),
};
