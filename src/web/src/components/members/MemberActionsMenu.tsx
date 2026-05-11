import { useEffect, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";

export type MemberAction = "edit" | "send-reset-link" | "set-temp-password" | "lock" | "unlock" | "remove";

interface Props {
  /** Whether the account is currently locked — toggles which lock-related entry appears. */
  isLocked: boolean;
  onSelect: (action: MemberAction) => void;
}

export default function MemberActionsMenu({ isLocked, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  function pick(action: MemberAction) {
    setOpen(false);
    onSelect(action);
  }

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        className="rounded-md p-1.5 text-zinc-400 hover:bg-white/5 hover:text-zinc-100"
        aria-label="Member actions"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <MoreHorizontal className="size-4" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-1 min-w-[220px] rounded-xl border border-white/10 bg-zinc-900/95 py-1 shadow-2xl backdrop-blur-md text-sm"
        >
          <MenuItem onClick={() => pick("edit")}>Edit profile…</MenuItem>
          <MenuItem onClick={() => pick("send-reset-link")}>Send password reset link</MenuItem>
          <MenuItem onClick={() => pick("set-temp-password")}>Set temporary password…</MenuItem>
          <Divider />
          {isLocked
            ? <MenuItem onClick={() => pick("unlock")}>Unlock account</MenuItem>
            : <MenuItem onClick={() => pick("lock")}>Lock account…</MenuItem>}
          <Divider />
          <MenuItem onClick={() => pick("remove")} danger>Remove from event…</MenuItem>
        </div>
      )}
    </div>
  );
}

function MenuItem({ onClick, children, danger }: { onClick: () => void; children: React.ReactNode; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`block w-full px-3 py-2 text-left ${danger ? "text-red-400 hover:bg-red-500/10" : "text-zinc-200 hover:bg-white/5"}`}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div aria-hidden="true" className="my-1 border-t border-white/5" />;
}
