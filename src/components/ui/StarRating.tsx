// src/components/ui/StarRating.tsx
"use client";

import { useState } from "react";
import { Star } from "lucide-react";

type DisplayProps = {
  mode: "display";
  /** Average rating 0.0–5.0 (already rounded to 1 decimal by the server) */
  value: number;
  /** Total review count; if < 3, caller should render a fallback instead */
  count?: number;
  size?: "sm" | "md" | "lg";
  className?: string;
};

type InteractiveProps = {
  mode: "interactive";
  value: number;
  onChange: (v: number) => void;
  size?: "sm" | "md" | "lg";
  className?: string;
  /** Accessible label — e.g. "Note donnée au conducteur" */
  ariaLabel?: string;
};

export type StarRatingProps = DisplayProps | InteractiveProps;

const sizePx = { sm: 14, md: 18, lg: 24 } as const;
const gapClass = { sm: "gap-0.5", md: "gap-1", lg: "gap-1.5" } as const;

export function StarRating(props: StarRatingProps) {
  const size = props.size ?? "md";
  const px = sizePx[size];

  if (props.mode === "display") {
    const full = Math.floor(props.value);
    const hasHalf = props.value - full >= 0.5;
    return (
      <span className={`inline-flex items-center ${gapClass[size]} ${props.className ?? ""}`}>
        {Array.from({ length: 5 }).map((_, i) => {
          const isFull = i < full;
          const isHalf = !isFull && i === full && hasHalf;
          return (
            <Star
              key={i}
              size={px}
              className={
                isFull
                  ? "fill-amber-400 text-amber-400"
                  : isHalf
                    ? "fill-amber-400 text-amber-400 opacity-60"
                    : "text-stone-300"
              }
              aria-hidden="true"
            />
          );
        })}
        <span className="ml-1.5 text-xs font-medium text-stone-600 tabular-nums">
          {props.value.toFixed(1)}
          {typeof props.count === "number" && (
            <span className="text-stone-400 font-normal"> ({props.count})</span>
          )}
        </span>
      </span>
    );
  }

  return <InteractiveStars {...props} />;
}

function InteractiveStars({ value, onChange, size = "md", className = "", ariaLabel }: InteractiveProps) {
  const [hover, setHover] = useState<number | null>(null);
  const px = sizePx[size];
  const displayValue = hover ?? value;

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel ?? "Note"}
      className={`inline-flex items-center ${gapClass[size]} ${className}`}
      onMouseLeave={() => setHover(null)}
    >
      {[1, 2, 3, 4, 5].map((n) => {
        const isActive = n <= displayValue;
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} étoile${n > 1 ? "s" : ""}`}
            onMouseEnter={() => setHover(n)}
            onFocus={() => setHover(n)}
            onBlur={() => setHover(null)}
            onClick={() => onChange(n)}
            className="p-1 rounded-md cursor-pointer focus-visible:outline-2 focus-visible:outline-red-800 focus-visible:outline-offset-2 transition-colors"
          >
            <Star
              size={px}
              className={
                isActive
                  ? "fill-amber-400 text-amber-400"
                  : "text-stone-300 hover:text-amber-300"
              }
              aria-hidden="true"
            />
          </button>
        );
      })}
    </div>
  );
}
