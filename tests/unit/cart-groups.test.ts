import { test } from "node:test";
import assert from "node:assert/strict";
import { groupCartByStore, toCents, type CartItem, type ShippingGroup } from "../../lib/cart-groups.ts";

const item = (overrides: Partial<CartItem>): CartItem => ({
  item_id: "i", product_id: "p", product_name: "Peça", store_name: "Loja A", unit_price: 10,
  quantity: 1, stock: null, product_active: true, added_at: "2026-10-01T00:00:00Z", ...overrides,
});

test("soma em centavos sem erro de ponto flutuante", () => {
  assert.equal(toCents(0.1) + toCents(0.2), 30);
  assert.equal(toCents(189.9) * 3, 56970);
});

test("agrupa itens por loja e calcula o subtotal de cada uma", () => {
  const groups = groupCartByStore([
    item({ item_id: "1", store_name: "Ateliê", unit_price: 19.9, quantity: 3 }),
    item({ item_id: "2", store_name: "Linha", unit_price: 220 }),
    item({ item_id: "3", store_name: "Ateliê", unit_price: 0.1, quantity: 2 }),
  ], []);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups.map((group) => group.storeName), ["Ateliê", "Linha"]);
  assert.equal(groups[0].productsCents, 5970 + 20);
  assert.equal(groups[0].items.length, 2);
  assert.equal(groups[1].shipping, null);
});

test("associa o frete pela loja (artisan_id quando disponível, senão pelo nome)", () => {
  const shipping: ShippingGroup[] = [
    { artisanId: "b", storeName: "Linha", options: [] },
    { artisanId: "a", storeName: "Ateliê", options: [] },
  ];
  const byId = groupCartByStore([item({ artisan_id: "a", store_name: "Nome antigo" })], shipping);
  assert.equal(byId[0].shipping?.artisanId, "a");
  const byName = groupCartByStore([item({ store_name: "Linha" })], shipping);
  assert.equal(byName[0].shipping?.artisanId, "b");
});
