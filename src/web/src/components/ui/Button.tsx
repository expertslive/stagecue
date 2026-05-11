import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
}

const variantClass: Record<ButtonVariant, string> = {
  primary: "bg-[var(--cta)] hover:bg-[var(--cta-hover)] text-white",
  secondary: "bg-zinc-800 hover:bg-zinc-700 text-zinc-100",
  danger: "bg-red-600 hover:bg-red-500 text-white",
  ghost: "bg-transparent hover:bg-zinc-800 text-zinc-300",
};

const sizeClass: Record<ButtonSize, string> = {
  sm: "px-2 py-1 text-xs gap-1",
  md: "px-3 py-2 text-sm gap-2",
  lg: "px-5 py-3 text-base gap-2",
};

export default function Button({
  variant = "primary", size = "md",
  leadingIcon, trailingIcon, className = "",
  children, ...rest
}: Props) {
  return (
    <button
      {...rest}
      className={`inline-flex items-center justify-center rounded-lg font-medium transition-all duration-200 ease-[var(--ease-out)] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 ${variantClass[variant]} ${sizeClass[size]} ${className}`}
    >
      {leadingIcon}
      {children}
      {trailingIcon}
    </button>
  );
}
