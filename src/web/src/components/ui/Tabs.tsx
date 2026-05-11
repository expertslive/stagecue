import { useId, type ReactNode } from "react";

export interface TabSpec {
  id: string;
  label: ReactNode;
  /** Optional small badge or icon after the label. */
  trailing?: ReactNode;
  disabled?: boolean;
}

interface Props {
  tabs: TabSpec[];
  activeId: string;
  onChange: (id: string) => void;
  /** Optional className for the tab strip. */
  className?: string;
  /** Optional aria-label for the tablist. */
  ariaLabel?: string;
}

/**
 * Minimal accessible Tabs. The caller is responsible for rendering the active
 * panel below — Tabs only owns the tab strip + selection state.
 */
export default function Tabs({ tabs, activeId, onChange, className = "", ariaLabel }: Props) {
  const groupId = useId();
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`flex items-center gap-0.5 rounded-lg bg-zinc-950/40 p-1 ${className}`}
    >
      {tabs.map((t) => {
        const active = t.id === activeId;
        return (
          <button
            key={t.id}
            id={`${groupId}-tab-${t.id}`}
            role="tab"
            type="button"
            aria-selected={active}
            aria-controls={`${groupId}-panel-${t.id}`}
            disabled={t.disabled}
            onClick={() => onChange(t.id)}
            className={`relative inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-150 ease-[var(--ease-out)] ${
              active
                ? "bg-zinc-800 text-zinc-100"
                : "text-zinc-400 hover:text-zinc-200 disabled:opacity-40"
            }`}
          >
            {t.label}
            {t.trailing}
          </button>
        );
      })}
    </div>
  );
}

