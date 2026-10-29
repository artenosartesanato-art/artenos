"use client";

import { useId } from "react";
import { Star, StarEmpty, StarHalf } from "@/components/icons";
import { formatRating, ratingLabel, starParts } from "@/lib/reviews";

/** Média em estrelas (somente leitura). */
export function StarRating({ avg, count, size = 14, showCount = true, className = "" }: {
  avg: number | string | null | undefined; count?: number | null; size?: number; showCount?: boolean; className?: string;
}) {
  const { full, half, empty } = starParts(avg);
  return (
    <span className={`an-stars ${className}`.trim()} role="img" aria-label={ratingLabel(avg, count ?? 1)}>
      {Array.from({ length: full }, (_, index) => <Star key={`f${index}`} size={size} />)}
      {half ? <StarHalf size={size} /> : null}
      {Array.from({ length: empty }, (_, index) => <StarEmpty key={`e${index}`} size={size} />)}
      {showCount && count != null && (
        <span className="an-stars-text" aria-hidden="true">{formatRating(avg)} ({count})</span>
      )}
    </span>
  );
}

/** Escolha de 1 a 5 estrelas (grupo de rádio acessível). */
export function StarInput({ value, onChange, label, disabled = false }: {
  value: number; onChange: (value: number) => void; label: string; disabled?: boolean;
}) {
  const name = useId();
  return (
    <fieldset className="an-star-input" disabled={disabled}>
      <legend>{label}</legend>
      {[1, 2, 3, 4, 5].map((option) => (
        <label key={option} className={option <= value ? "is-on" : ""}>
          <input type="radio" name={name} value={option} checked={value === option} onChange={() => onChange(option)} />
          {option <= value ? <Star size={24} /> : <StarEmpty size={24} />}
          <span className="an-visually-hidden">{option} {option === 1 ? "estrela" : "estrelas"}</span>
        </label>
      ))}
    </fieldset>
  );
}
