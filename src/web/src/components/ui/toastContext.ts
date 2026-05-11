import { createContext, useContext } from "react";

export interface ToastAction { label: string; onClick: () => void }
export interface ToastSpec {
  message: string;
  tone?: "default" | "error";
  action?: ToastAction;
  /** Auto-dismiss timeout in ms. Default 4000. Pass 0 to disable. */
  timeoutMs?: number;
}

export interface ToastApi {
  show: (spec: ToastSpec) => void;
}

export const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
