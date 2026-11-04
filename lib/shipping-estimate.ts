// Peso que a transportadora cobra (o maior entre o peso real e o "peso
// cúbico" da caixa: C × L × A ÷ 6000) e avisos para dados de envio que
// encarecem o frete sem necessidade. Sem dependências (testável no Node).

export const CUBIC_DIVISOR = 6000;

export type PackageInput = { weightGrams: number; lengthCm: number; widthCm: number; heightCm: number; boxes: number };

export type PackageEstimate = {
  realKg: number;
  cubicKgPerBox: number;
  /** Peso cobrado somando todas as caixas da peça. */
  billedKg: number;
  /** Caixa grande para o peso: o frete é cobrado pelo tamanho. */
  oversized: boolean;
  /** Mais de uma caixa por peça (raro em artesanato). */
  multipleBoxes: boolean;
};

const round = (value: number, places = 1) => Math.round(value * 10 ** places) / 10 ** places;

export function estimatePackage({ weightGrams, lengthCm, widthCm, heightCm, boxes }: PackageInput): PackageEstimate | null {
  const count = Math.max(1, Math.trunc(boxes) || 1);
  if (![weightGrams, lengthCm, widthCm, heightCm].every((n) => Number.isFinite(n) && n > 0)) return null;
  const realKg = weightGrams / 1000;
  const cubicKgPerBox = (lengthCm * widthCm * heightCm) / CUBIC_DIVISOR;
  const realPerBox = realKg / count;
  const billedKg = Math.max(realPerBox, cubicKgPerBox) * count;
  return {
    realKg: round(realKg, 2),
    cubicKgPerBox: round(cubicKgPerBox),
    billedKg: round(billedKg),
    // Mais de 2 kg cobrados e pelo menos 4× o peso real: medidas provavelmente exageradas.
    oversized: billedKg >= 2 && billedKg >= realKg * 4,
    multipleBoxes: count > 1,
  };
}
