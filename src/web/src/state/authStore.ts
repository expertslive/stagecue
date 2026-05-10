import { create } from "zustand";

interface AuthState {
  signedInEmail: string | null;
  setSignedIn: (email: string) => void;
  signOut: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  signedInEmail: null,
  setSignedIn: (email) => set({ signedInEmail: email }),
  signOut: () => set({ signedInEmail: null }),
}));
