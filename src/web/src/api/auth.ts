import { api } from "./client";

export interface SetupStatus { initialized: boolean }

export const auth = {
  setupStatus: () => api<SetupStatus>("/api/setup/status"),
  setupInitialize: (body: {
    tenantName: string;
    tenantSlug: string;
    ownerEmail: string;
    ownerPassword: string;
    ownerDisplayName: string;
  }) => api<{ tenantId: string; userId: string }>("/api/setup/initialize", {
    method: "POST",
    body: JSON.stringify(body),
  }),
  signIn: (email: string, password: string) =>
    api<{ signedIn: true }>("/api/auth/password/signin", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  signOut: () => api<void>("/api/auth/password/signout", { method: "POST" }),
};
