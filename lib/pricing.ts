// Conta da calculadora de precificação (a mesma do banco: pricing_compute).
// Sem dependências de React (testável no Node).

export type PaymentMethod = "card" | "pix";

export type PaymentFees = { pix: number; card: number };

/** Valores de referência do Mercado Pago para vendas online (a administração ajusta na tela Tarifa). */
export const DEFAULT_PAYMENT_FEES: PaymentFees = { pix: 0.99, card: 4.98 };

/** Tarifa fixa por item vendido (a administração ajusta na tela Tarifa; este é o valor de referência). */
export const DEFAULT_ITEM_FEE = 4;

/** Lê a resposta de get_item_fee_settings (null = banco sem a migração da tarifa por item). */
export function itemFeeFrom(response: { data: unknown; error: unknown }): number | null {
  const row = (Array.isArray(response.data) ? response.data[0] : response.data) as { amount?: number | string | null } | null;
  const amount = Number(row?.amount);
  if (response.error || !row || !Number.isFinite(amount) || amount < 0) return null;
  return roundMoney(amount);
}

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = { card: "Cartão de crédito", pix: "Pix" };

export function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Preço que cobre custo + lucro depois de sair a tarifa da Artenós e a taxa do
 * Mercado Pago (as duas são porcentagens do preço final). A tarifa fixa por
 * item já vem somada em `base`.
 */
export function suggestedPrice(base: number, platformPercent: number, paymentPercent: number) {
  const total = platformPercent + paymentPercent;
  if (!(base > 0) || total < 0 || total >= 100) return 0;
  return roundMoney(base / (1 - total / 100));
}

/**
 * Quanto sai de cada tarifa num preço e quanto sobra para a loja (por unidade).
 * A tarifa por item nunca passa do que sobra do preço depois da porcentagem
 * (a mesma trava do banco ao fechar a venda).
 */
export function feeBreakdown(price: number, platformPercent: number, paymentPercent: number, itemFee = 0) {
  const platform = roundMoney(price * platformPercent / 100);
  const item = roundMoney(Math.max(0, Math.min(itemFee, price - platform)));
  const payment = roundMoney(price * paymentPercent / 100);
  return { platform, item, payment, net: roundMoney(price - platform - item - payment) };
}

export type PricingInputs = {
  materialCost: number;
  hoursSpent: number;
  hourlyRate: number;
  extraCost: number;
  operationalCost: number;
  marginPercent: number;
};

/** Converte o texto digitado (aceita vírgula); vazio ou negativo vira 0. */
export function parsePricingNumber(value: string) {
  const parsed = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

/**
 * Conta completa da calculadora (página Precificação e painel do produto).
 * feePercent null = tarifa ainda não carregada (preço sugerido 0).
 * paymentFees null = banco sem taxas do Mercado Pago (só a tarifa da Artenós).
 * itemFee = tarifa fixa da Artenós por item vendido (como a %, sai do repasse):
 * entra depois do lucro e antes das taxas, só quando há custo de produção.
 */
export function computePricing(inputs: PricingInputs, feePercent: number | null, paymentFees: PaymentFees | null, method: PaymentMethod, itemFee = 0) {
  const laborCost = roundMoney(inputs.hoursSpent * inputs.hourlyRate);
  const productionCost = roundMoney(inputs.materialCost + laborCost + inputs.extraCost + inputs.operationalCost);
  const desiredProfit = roundMoney(productionCost * (inputs.marginPercent / 100));
  const validFee = feePercent !== null && feePercent >= 0 && feePercent < 100;
  const paymentPercent = paymentFees ? paymentFees[method] : 0;
  const itemFeeAmount = productionCost > 0 && itemFee > 0 ? roundMoney(itemFee) : 0;
  const price = validFee ? suggestedPrice(productionCost + desiredProfit + itemFeeAmount, feePercent, paymentPercent) : 0;
  const breakdown = feeBreakdown(price, validFee ? feePercent : 0, paymentPercent, itemFeeAmount);
  const byMethod = paymentFees && validFee
    ? (["pix", "card"] as const).map((item) => ({ method: item, percent: paymentFees[item], ...feeBreakdown(price, feePercent, paymentFees[item], itemFeeAmount) }))
    : [];
  return {
    ...inputs,
    laborCost,
    productionCost,
    desiredProfit,
    itemFeeAmount: breakdown.item,
    platformFeeAmount: breakdown.platform,
    paymentPercent,
    paymentFeeAmount: breakdown.payment,
    byMethod,
    suggestedPrice: price,
  };
}
