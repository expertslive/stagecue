import { api } from "./client";

export interface PublicBrandingDto { themeJson: string; defaultThresholdsJson: string; logoUrl: string | null; eventName: string }
export interface BrandingDto { themeJson: string; defaultThresholdsJson: string; logoUrl: string | null }
export interface UpdateThemeBody { themeJson: string; defaultThresholdsJson: string }

export const branding = {
  getPublic: (code: string, scope: "r" | "e") => api<PublicBrandingDto>(`/${scope}/${code}/branding`),
  getEvent: (eventId: string) => api<BrandingDto>(`/api/events/${eventId}/branding`),
  updateEvent: (eventId: string, body: UpdateThemeBody) =>
    api<void>(`/api/events/${eventId}/branding`, { method: "PUT", body: JSON.stringify(body) }),
  removeLogo: (eventId: string) => api<void>(`/api/events/${eventId}/branding/logo`, { method: "DELETE" }),
};
