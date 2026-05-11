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
  primary: "bg-blue-600 hover:bg-blue-500 text-white focus-visible:ring-blue-400",
  secondary: "bg-zinc-800 hover:bg-zinc-700 text-zinc-100 focus-visible:ring-zinc-500",
  danger: "bg-red-600 hover:bg-red-500 text-white focus-visible:ring-red-400",
  ghost: "bg-transparent hover:bg-zinc-800 text-zinc-300 focus-visible:ring-zinc-500",
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
      className={`inline-flex items-center justify-center rounded font-medium transition-all duration-150 ease-out active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900 ${variantClass[variant]} ${sizeClass[size]} ${className}`}
    >
      {leadingIcon}
      {children}
      {trailingIcon}
    </button>
  );
}
