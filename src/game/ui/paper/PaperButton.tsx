"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "accent" | "close";

const base =
  "paper-pixelated inline-flex items-center justify-center rounded-sm border-2 px-2.5 py-1 text-center text-[11px] font-semibold leading-tight transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1b6b52] disabled:opacity-50";

const variants: Record<Variant, string> = {
  primary:
    "border-[#1b6b52] bg-[#ede6d4] text-[#1a3228] shadow-sm hover:bg-[#e2d8c4] active:bg-[#d8ccb8]",
  accent:
    "border-[#1b6b52] bg-[#c9e8dc] text-[#143228] shadow-sm hover:bg-[#b5dcc8] active:bg-[#a3d0bc]",
  close:
    "max-w-[min(100%,11rem)] border-[#5a5346] bg-[#f0e8d8]/95 text-[#3d362c] hover:bg-[#e8dcc8] active:bg-[#dfd0b8]",
};

export function PaperButton({
  variant = "primary",
  className = "",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`${base} ${variants[variant]} ${className}`.trim()}
      {...rest}
    >
      {children}
    </button>
  );
}
