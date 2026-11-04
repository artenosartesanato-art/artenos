import { test } from "node:test";
import assert from "node:assert/strict";
import { estimatePackage } from "../../lib/shipping-estimate.ts";

test("o caso do CUBO: 20 caixas de 40 cm para 40 g", () => {
  const result = estimatePackage({ weightGrams: 40, lengthCm: 40, widthCm: 40, heightCm: 40, boxes: 20 });
  assert.ok(result);
  assert.equal(result.cubicKgPerBox, 10.7);
  assert.equal(result.billedKg, 213.3);
  assert.equal(result.oversized, true);
  assert.equal(result.multipleBoxes, true);
});

test("caixa do tamanho certo não gera alerta", () => {
  const result = estimatePackage({ weightGrams: 300, lengthCm: 12, widthCm: 12, heightCm: 10, boxes: 1 });
  assert.ok(result);
  assert.equal(result.billedKg, 0.3);
  assert.equal(result.oversized, false);
  assert.equal(result.multipleBoxes, false);
});

test("peça leve em caixa média ainda é aceitável; dados incompletos voltam null", () => {
  assert.equal(estimatePackage({ weightGrams: 500, lengthCm: 20, widthCm: 20, heightCm: 15, boxes: 1 })?.oversized, false);
  assert.equal(estimatePackage({ weightGrams: 0, lengthCm: 20, widthCm: 20, heightCm: 15, boxes: 1 }), null);
});
