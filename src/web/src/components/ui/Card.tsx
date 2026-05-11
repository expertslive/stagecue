import type { HTMLAttributes, ReactNode } from "react";

type Density = "comfortable" | "compact" | "none";
type Tone = "default" | "muted" | "dashed";

interface Props extends HTMLAttributes<HTMLDivElement> {
  /** Inner padding preset. Default "comfortable" (p-5). */
  density?: Density;
  /** Surface treatment. "muted" is for sub-surfaces; "dashed" for empty states. */
  tone?: Tone;
  /** Add an interactive hover treatment (for clickable cards / list rows). */
  interactive?: boolean;
  children?: ReactNode;
}

const densityClass: Record<Density, string> = {
  comfortable: "p-5",
  compact: "p-3",
  none: "",
};

const toneClass: Record<Tone, string> = {
  default: "border border-white/5 bg-zinc-900/60 backdrop-blur-sm",
  muted: "border border-white/5 bg-zinc-900/30",
  dashed: "border border-dashed border-white/10 bg-transparent",
};

export default function Card({
  density = "comfortable",
  tone = "default",
  interactive = false,
  className = "",
  children,
  ...rest
}: Props) {
  const interactiveClass = interactive
    ? "transition-colors hover:bg-zinc-800/60 cursor-pointer"
    : "";
  return (
    <div
      {...rest}
      className={`rounded-xl ${toneClass[tone]} ${densityClass[density]} ${interactiveClass} ${className}`}
    >
      {children}
    </div>
  );
}
