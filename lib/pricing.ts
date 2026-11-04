// Conta da calculadora de precificação (a mesma do banco: pricing_compute).
// Sem dependências de React (testável no Node).

export type PaymentMethod = "card" | "pix";

export type PaymentFees = { pix: number; card: number };

/** Valores de referência do Mercado Pago para vendas online (a administração ajusta na tela Tarifa). */
export const DEFAULT_PAYMENT_FEES: PaymentFees = { pix: 0.99, card: 4.98 };

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = { card: "Cartão de crédito", pix: "Pix" };

export function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Preço que cobre custo + lucro depois de sair a tarifa da Artenós e a taxa do
 * Mercado Pago (as duas são porcentagens do preço final).
 */
export function suggestedPrice(base: number, platformPercent: number, paymentPercent: number) {
  const total = platformPercent + paymentPercent;
  if (!(base > 0) || total < 0 || total >= 100) return 0;
  return roundMoney(base / (1 - total / 100));
}

/** Quanto sai de cada taxa num preço e quanto sobra para a loja. */
export function feeBreakdown(price: number, platformPercent: number, paymentPercent: number) {
  const platform = roundMoney(price * platformPercent / 100);
  const payment = roundMoney(price * paymentPercent / 100);
  return { platform, payment, net: roundMoney(price - platform - payment) };
}
