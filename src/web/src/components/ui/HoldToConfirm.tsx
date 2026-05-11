import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

interface Props {
  onConfirm: () => void;
  /** Hold duration in ms. Default 800. */
  durationMs?: number;
  variant?: "primary" | "secondary" | "danger";
  size?: "sm" | "md" | "lg";
  /** When true, renders as a full-width menu row instead of a button. */
  asMenuRow?: boolean;
  leadingIcon?: ReactNode;
  children: ReactNode;
  /** Label shown while the user is holding (defaults to `Hold to ${children}` when children is a string). */
  holdingLabel?: ReactNode;
  disabled?: boolean;
  className?: string;
  /** Accessible label override. */
  ariaLabel?: string;
}

const variantBase: Record<string, string> = {
  primary: "bg-blue-600 text-white",
  secondary: "bg-zinc-800 text-zinc-100",
  danger: "bg-red-600 text-white",
};

const variantFill: Record<string, string> = {
  primary: "bg-blue-400",
  secondary: "bg-zinc-500",
  danger: "bg-red-400",
};

const sizeClass: Record<string, string> = {
  sm: "px-2 py-1 text-xs gap-1",
  md: "px-3 py-2 text-sm gap-2",
  lg: "px-5 py-3 text-base gap-2",
};

export default function HoldToConfirm({
  onConfirm,
  durationMs = 800,
  variant = "secondary",
  size = "md",
  asMenuRow = false,
  leadingIcon,
  children,
  holdingLabel,
  disabled = false,
  className = "",
  ariaLabel,
}: Props) {
  const [progress, setProgress] = useState(0);
  const [active, setActive] = useState(false);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);
  const firedRef = useRef(false);

  const cancel = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    startRef.current = null;
    firedRef.current = false;
    setActive(false);
    setProgress(0);
  }, []);

  // Named function expression so the inner self-reference avoids the
  // outer `const tick = ...` TDZ that the linter flags.
  const tick = useCallback(
    function tickInner(t: number) {
      if (startRef.current == null) startRef.current = t;
      const elapsed = t - startRef.current;
      const p = Math.min(1, elapsed / durationMs);
      setProgress(p);
      if (p >= 1) {
        if (!firedRef.current) {
          firedRef.current = true;
          onConfirm();
        }
        cancel();
        return;
      }
      rafRef.current = requestAnimationFrame(tickInner);
    },
    [durationMs, onConfirm, cancel],
  );

  const start = useCallback(() => {
    if (disabled || active) return;
    setActive(true);
    setProgress(0);
    startRef.current = null;
    firedRef.current = false;
    rafRef.current = requestAnimationFrame(tick);
  }, [disabled, active, tick]);

  useEffect(() => () => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
  }, []);

  const stringChild = typeof children === "string" ? children : null;
  const resolvedAria =
    ariaLabel ?? (stringChild ? `${stringChild} (hold to confirm)` : undefined);
  const resolvedHolding =
    holdingLabel ?? (stringChild ? `Hold to ${stringChild.toLowerCase()}…` : "Hold…");

  if (asMenuRow) {
    return (
      <button
        type="button"
        onPointerDown={start}
        onPointerUp={cancel}
        onPointerLeave={cancel}
        onPointerCancel={cancel}
        onKeyDown={(e) => { if ((e.key === " " || e.key === "Enter") && !e.repeat) start(); }}
        onKeyUp={(e) => { if (e.key === " " || e.key === "Enter") cancel(); }}
        onBlur={cancel}
        disabled={disabled}
        aria-label={resolvedAria}
        data-testid="hold-to-confirm"
        data-holding={active ? "true" : "false"}
        className={`relative flex w-full items-center gap-2 overflow-hidden px-3 py-2 text-left text-sm text-zinc-100 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
      >
        <span
          aria-hidden="true"
          className={`absolute inset-y-0 left-0 ${variantFill[variant]} opacity-60`}
          style={{ width: `${progress * 100}%`, transition: active ? "none" : "width 150ms ease-out" }}
        />
        <span className="relative flex items-center gap-2">
          {leadingIcon}
          {active ? resolvedHolding : children}
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onKeyDown={(e) => { if ((e.key === " " || e.key === "Enter") && !e.repeat) start(); }}
      onKeyUp={(e) => { if (e.key === " " || e.key === "Enter") cancel(); }}
      onBlur={cancel}
      disabled={disabled}
      aria-label={resolvedAria}
      data-testid="hold-to-confirm"
      data-holding={active ? "true" : "false"}
      className={`relative inline-flex items-center justify-center overflow-hidden rounded font-medium transition-colors duration-150 ease-out disabled:cursor-not-allowed disabled:opacity-40 ${variantBase[variant]} ${sizeClass[size]} ${className}`}
    >
      <span
        aria-hidden="true"
        className={`absolute inset-y-0 left-0 ${variantFill[variant]}`}
        style={{ width: `${progress * 100}%`, transition: active ? "none" : "width 150ms ease-out" }}
      />
      <span className="relative flex items-center gap-2">
        {leadingIcon}
        {active ? resolvedHolding : children}
      </span>
    </button>
  );
}
