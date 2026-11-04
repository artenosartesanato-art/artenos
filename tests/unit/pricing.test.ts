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
