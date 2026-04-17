// src/components/ui/Button.tsx
"use client";

import { type ButtonHTMLAttributes, forwardRef } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "whatsapp";
  size?: "sm" | "md" | "lg";
  isLoading?: boolean;
}

const variants = {
  primary:
    "bg-red-800 text-white hover:bg-red-900 active:bg-red-950 disabled:opacity-60",
  secondary:
    "bg-white text-stone-800 border border-stone-300 hover:bg-stone-50 active:bg-stone-100 disabled:opacity-60",
  ghost:
    "bg-transparent text-stone-600 hover:bg-stone-100 active:bg-stone-200 disabled:opacity-60",
  whatsapp:
    "bg-green-600 text-white hover:bg-green-700 active:bg-green-800 disabled:opacity-60",
};

const sizes = {
  sm: "h-10 px-4 text-sm",
  md: "h-12 px-5 text-base",
  lg: "h-14 px-6 text-lg",
};

const Spinner = () => (
  <svg
    className="animate-spin h-4 w-4"
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <circle
      className="opacity-25"
      cx="12"
      cy="12"
      r="10"
      stroke="currentColor"
      strokeWidth="4"
    />
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
    />
  </svg>
);

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      isLoading = false,
      disabled,
      children,
      className = "",
      ...props
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={[
          "inline-flex items-center justify-center gap-2 rounded-xl font-semibold",
          "transition-colors duration-150 cursor-pointer",
          "focus-visible:outline-2 focus-visible:outline-red-800 focus-visible:outline-offset-2",
          "disabled:cursor-not-allowed select-none",
          variants[variant],
          sizes[size],
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        {...props}
      >
        {isLoading && <Spinner />}
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";
