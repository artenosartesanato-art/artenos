// Formatação das avaliações (estrelas de 1 a 5).
export const REVIEW_MAX_LENGTH = 1000;
export const REVIEW_EDIT_DAYS = 30;

const decimal = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function formatRating(value: number | string | null | undefined) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? decimal.format(number) : "";
}

export function ratingLabel(avg: number | string | null | undefined, count: number | null | undefined) {
  const total = Number(count ?? 0);
  if (!total) return "Ainda sem avaliações";
  return `${formatRating(avg)} de 5, ${total} ${total === 1 ? "avaliação" : "avaliações"}`;
}

/** Estrelas cheias, meia e vazias para uma média (arredonda para 0,5). */
export function starParts(avg: number | string | null | undefined) {
  const rounded = Math.round(Math.min(5, Math.max(0, Number(avg) || 0)) * 2) / 2;
  const full = Math.floor(rounded);
  const half = rounded - full === 0.5 ? 1 : 0;
  return { full, half, empty: 5 - full - half };
}

export function canEditReview(createdAt: string | null | undefined, now = Date.now()) {
  if (!createdAt) return true;
  return now - new Date(createdAt).getTime() < REVIEW_EDIT_DAYS * 24 * 60 * 60 * 1000;
}
