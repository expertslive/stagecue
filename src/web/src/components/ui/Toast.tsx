import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ToastContext, type ToastSpec } from "./toastContext";

interface InternalToast extends ToastSpec { id: number }

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<InternalToast[]>([]);
  const idRef = useRef(0);
  const timerRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    // Clear the timeout for this toast if it exists
    const timer = timerRef.current.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      timerRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback((spec: ToastSpec) => {
    const id = ++idRef.current;
    const next: InternalToast = { ...spec, id };
    setToasts((prev) => [...prev, next]);
    const timeout = spec.timeoutMs ?? 4000;
    if (timeout > 0) {
      const timerId = setTimeout(() => dismiss(id), timeout);
      timerRef.current.set(id, timerId);
    }
  }, [dismiss]);

  // Clean up all pending timers on unmount
  useEffect(() => {
    const timers = timerRef.current;
    return () => {
      timers.forEach((timerId) => clearTimeout(timerId));
      timers.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div className="pointer-events-none fixed bottom-6 left-1/2 z-[100] flex -translate-x-1/2 flex-col items-center gap-2">
        {toasts.map((t) => (
          <ToastView key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastView({ toast, onDismiss }: { toast: InternalToast; onDismiss: () => void }) {
  const bg = toast.tone === "error" ? "bg-red-700" : "bg-zinc-800";
  return (
    <div
      role={toast.tone === "error" ? "alert" : "status"}
      className={`toast-enter pointer-events-auto flex items-center gap-3 rounded-lg ${bg} px-4 py-2 shadow-lg`}
    >
      <span className="text-sm text-white">{toast.message}</span>
      {toast.action && (
        <button
          onClick={() => { toast.action!.onClick(); onDismiss(); }}
          className="rounded px-2 py-1 text-sm font-medium text-blue-300 hover:text-blue-200"
        >
          {toast.action.label}
        </button>
      )}
    </div>
  );
}
