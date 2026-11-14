import { test } from "node:test";
import assert from "node:assert/strict";
import { applicationFee, chargesByStore } from "../../lib/payment-split.ts";

test("comissão da Artenós só sobre as peças, arredondada ao centavo", () => {
  assert.equal(applicationFee(96.53, 8), 7.72);
  assert.equal(applicationFee(0.1, 8), 0.01);
  assert.equal(applicationFee(0, 8), 0);
  assert.equal(applicationFee(50, 0), 0);
});

test("uma cobrança por loja: peças, frete e comissão separados", () => {
  const charges = chargesByStore(
    [
      { artisan_id: "loja-a", unit_price: 30, quantity: 2 },
      { artisan_id: "loja-b", unit_price: 19.9, quantity: 1 },
      { artisan_id: "loja-a", unit_price: 10.1, quantity: 1 },
    ],
    [{ artisan_id: "loja-a", amount: 22.5 }, { artisan_id: "loja-b", amount: 15 }],
    8,
  );
  assert.deepEqual(charges, [
    { artisanId: "loja-a", products: 70.1, shipping: 22.5, total: 92.6, applicationFee: 5.61 },
    { artisanId: "loja-b", products: 19.9, shipping: 15, total: 34.9, applicationFee: 1.59 },
  ]);
});

test("tarifa por item entra na comissão, limitada ao valor das peças", () => {
  // 8% de 103 (8,24) + 3 itens × 4 = 20,24 — a mesma conta de finalize_checkout.
  assert.equal(applicationFee(103, 8, 12), 20.24);
  assert.equal(applicationFee(3, 8, 4), 3);
  const [charge] = chargesByStore(
    [{ artisan_id: "loja-a", unit_price: 50, quantity: 2 }, { artisan_id: "loja-a", unit_price: 3, quantity: 1 }],
    [{ artisan_id: "loja-a", amount: 15 }], 8, 4);
  assert.equal(charge.applicationFee, 20.24);
  assert.equal(charge.total, 118);
});
