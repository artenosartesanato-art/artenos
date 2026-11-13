// Conta da calculadora de precificação (a mesma do banco: pricing_compute).
// Sem dependências de React (testável no Node).

export type PaymentMethod = "card" | "pix";

export type PaymentFees = { pix: number; card: number };

/** Valores de referência do Mercado Pago para vendas online (a administração ajusta na tela Tarifa). */
export const DEFAULT_PAYMENT_FEES: PaymentFees = { pix: 0.99, card: 4.98 };

/** Custo fixo por item (a administração guarda o valor; este é o de referência). */
export const DEFAULT_ITEM_COST = 4;

export type ItemCostSettings = {
  /** Valor fixo por item, em reais. */
  amount: number;
  /** A administração liberou somar o custo ao preço no cadastro da peça? */
  catalogEnabled: boolean;
};

/** Lê a resposta de get_item_cost_settings (null = banco sem a migração do custo por item). */
export function itemCostSettingsFrom(response: { data: unknown; error: unknown }): ItemCostSettings | null {
  const row = (Array.isArray(response.data) ? response.data[0] : response.data) as
    { amount?: number | string | null; catalog_enabled?: boolean | null } | null;
  const amount = Number(row?.amount);
  if (response.error || !row || !Number.isFinite(amount) || amount <= 0) return null;
  return { amount: roundMoney(amount), catalogEnabled: row.catalog_enabled === true };
}

/** Preço da vitrine = preço da loja + custo por item (quando a peça tem o custo). */
export function withItemCost(price: number, itemCost: number) {
  return itemCost > 0 && price > 0 ? roundMoney(price + itemCost) : price;
}

/** Preço da loja sem o custo por item (nunca abaixo de 1 centavo). */
export function withoutItemCost(price: number, itemCost: number) {
  return itemCost > 0 && price > 0 ? Math.max(0.01, roundMoney(price - itemCost)) : price;
}

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
 * itemCostAmount = custo fixo por item escolhido na calculadora (0 = sem ele):
 * entra depois do lucro e antes das taxas, só quando há custo de produção.
 */
export function computePricing(inputs: PricingInputs, feePercent: number | null, paymentFees: PaymentFees | null, method: PaymentMethod, itemCostAmount = 0) {
  const laborCost = roundMoney(inputs.hoursSpent * inputs.hourlyRate);
  const productionCost = roundMoney(inputs.materialCost + laborCost + inputs.extraCost + inputs.operationalCost);
  const desiredProfit = roundMoney(productionCost * (inputs.marginPercent / 100));
  const validFee = feePercent !== null && feePercent >= 0 && feePercent < 100;
  const paymentPercent = paymentFees ? paymentFees[method] : 0;
  const itemCost = productionCost > 0 && itemCostAmount > 0 ? roundMoney(itemCostAmount) : 0;
  const price = validFee ? suggestedPrice(productionCost + desiredProfit + itemCost, feePercent, paymentPercent) : 0;
  const breakdown = feeBreakdown(price, validFee ? feePercent : 0, paymentPercent);
  const byMethod = paymentFees && validFee
    ? (["pix", "card"] as const).map((item) => ({ method: item, percent: paymentFees[item], ...feeBreakdown(price, feePercent, paymentFees[item]) }))
    : [];
  return {
    ...inputs,
    laborCost,
    productionCost,
    desiredProfit,
    itemCost,
    platformFeeAmount: breakdown.platform,
    paymentPercent,
    paymentFeeAmount: breakdown.payment,
    byMethod,
    suggestedPrice: price,
  };
}
