import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePendingBuyNow, serializePendingBuyNow } from "../../lib/buy-now-intent.ts";

const id = "00000000-0000-0000-0000-000000000001";

test("guarda e retoma a compra iniciada sem login", () => {
  const raw = serializePendingBuyNow(id, 2, 1_000);
  assert.deepEqual(parsePendingBuyNow(raw, 2_000), { productId: id, quantity: 2, at: 1_000 });
});

test("descarta intenção velha, inválida ou adulterada", () => {
  assert.equal(parsePendingBuyNow(serializePendingBuyNow(id, 1, 0), 31 * 60_000), null);
  assert.equal(parsePendingBuyNow('{"productId":"x","quantity":1,"at":0}', 1), null);
  assert.equal(parsePendingBuyNow("lixo"), null);
  assert.equal(parsePendingBuyNow(null), null);
});

test("quantidade fica entre 1 e 99", () => {
  assert.equal(parsePendingBuyNow(serializePendingBuyNow(id, 500, 0), 1)?.quantity, 99);
});
