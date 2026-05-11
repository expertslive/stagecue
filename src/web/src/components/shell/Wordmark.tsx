interface Props {
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeClass: Record<NonNullable<Props["size"]>, { wrap: string; dot: string; text: string }> = {
  sm: { wrap: "gap-1.5", dot: "size-1.5", text: "text-sm" },
  md: { wrap: "gap-2", dot: "size-2", text: "text-xl" },
  lg: { wrap: "gap-2.5", dot: "size-2.5", text: "text-3xl" },
};

/**
 * Brand wordmark used on first-impression surfaces (sign-in, setup, connecting).
 * A coloured dot + the product name, weighted and tight-tracked.
 */
export default function Wordmark({ size = "md", className = "" }: Props) {
  const s = sizeClass[size];
  return (
    <div className={`inline-flex items-baseline ${s.wrap} ${className}`}>
      <span
        aria-hidden="true"
        className={`${s.dot} rounded-full translate-y-[1px]`}
        style={{ background: "var(--cta)" }}
      />
      <span className={`${s.text} font-semibold tracking-tight text-zinc-100`}>Stagecue</span>
    </div>
  );
}
