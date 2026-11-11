import { test } from "node:test";
import assert from "node:assert/strict";
import { feeBreakdown, suggestedPrice } from "../../lib/pricing.ts";

test("preço sugerido cobre as duas taxas (mesma conta do banco)", () => {
  // Custo 60 + lucro 24 = 84; Artenós 8% + cartão 4,98%.
  assert.equal(suggestedPrice(84, 8, 4.98), 96.53);
  assert.equal(suggestedPrice(84, 8, 0.99), 92.3);
  assert.equal(suggestedPrice(0, 8, 4.98), 0);
  assert.equal(suggestedPrice(84, 60, 40), 0);
});

test("detalhe das taxas e valor que fica com a loja", () => {
  assert.deepEqual(feeBreakdown(96.53, 8, 4.98), { platform: 7.72, payment: 4.81, net: 84 });
  assert.deepEqual(feeBreakdown(96.53, 8, 0.99), { platform: 7.72, payment: 0.96, net: 87.85 });
});

test("computePricing: mesma conta da página e do painel do produto", async () => {
  const { computePricing, parsePricingNumber } = await import("../../lib/pricing.ts");
  const result = computePricing({ materialCost: 30, hoursSpent: 2, hourlyRate: 20, extraCost: 5, operationalCost: 5, marginPercent: 30 },
    8, { pix: 0.99, card: 4.98 }, "card");
  assert.equal(result.laborCost, 40);
  assert.equal(result.productionCost, 80);
  assert.equal(result.desiredProfit, 24);
  assert.equal(result.suggestedPrice, 119.51); // 104 / (1 - 12,98%)
  assert.equal(result.byMethod.length, 2);
  assert.equal(computePricing({ materialCost: 10, hoursSpent: 0, hourlyRate: 0, extraCost: 0, operationalCost: 0, marginPercent: 0 }, null, null, "pix").suggestedPrice, 0);
  assert.equal(parsePricingNumber("12,5"), 12.5);
  assert.equal(parsePricingNumber("-3"), 0);
});
