import { useEffect, useRef, type ReactNode } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** When true, Cmd/Ctrl-Enter inside the sheet triggers `onConfirm`. */
  onConfirm?: () => void;
  /** Max width of the sheet panel. Default: 32rem. */
  maxWidth?: string;
}

export default function Sheet({ open, onClose, onConfirm, children, maxWidth = "32rem" }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Autofocus the first focusable element on open.
  useEffect(() => {
    if (!open || !panelRef.current) return;
    const focusable = panelRef.current.querySelector<HTMLElement>(
      'input, button, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    focusable?.focus();
  }, [open]);

  // Esc → close. Cmd/Ctrl-Enter → confirm (if provided).
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
      if (onConfirm && (e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        onConfirm();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose, onConfirm]);

  if (!open) return null;

  return (
    <div
      data-testid="sheet-backdrop"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-6 sheet-backdrop-enter"
    >
      <div
        ref={panelRef}
        data-testid="sheet-panel"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth }}
        className="w-full max-h-[90vh] overflow-y-auto rounded-2xl border border-white/10 bg-zinc-900/90 p-6 shadow-2xl backdrop-blur-xl sheet-panel-enter"
      >
        {children}
      </div>
    </div>
  );
}
