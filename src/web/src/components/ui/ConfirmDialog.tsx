import type { ReactNode } from "react";
import Sheet from "./Sheet";

interface Props {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  open, title, message, confirmLabel, cancelLabel = "Cancel",
  tone = "default", onConfirm, onCancel,
}: Props) {
  const confirmClass =
    tone === "danger"
      ? "bg-red-600 hover:bg-red-500"
      : "bg-[var(--cta)] hover:bg-[var(--cta-hover)]";

  return (
    <Sheet open={open} onClose={onCancel} onConfirm={onConfirm} maxWidth="28rem">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="mt-2 text-sm text-zinc-300">{message}</div>
      <div className="mt-6 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded bg-zinc-800 px-3 py-2 text-sm hover:bg-zinc-700"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className={`rounded px-3 py-2 text-sm font-medium text-white ${confirmClass}`}
        >
          {confirmLabel}
        </button>
      </div>
    </Sheet>
  );
}
