import { test } from "node:test";
import assert from "node:assert/strict";
import { availabilityFor, computeAvailability, maxQuantityFor, productionLabel } from "../../lib/availability.ts";

test("estoque > 0 é pronta entrega", () => {
  assert.equal(computeAvailability(19, true), "ready");
  assert.equal(computeAvailability(1, false), "ready");
});

test("estoque 0 com encomenda aceita é sob encomenda", () => {
  assert.equal(computeAvailability(0, true), "made_to_order");
  assert.equal(computeAvailability(null, true), "made_to_order");
});

test("estoque 0 sem encomenda é esgotado", () => {
  assert.equal(computeAvailability(0, false), "sold_out");
  assert.equal(computeAvailability(undefined, false), "sold_out");
});

test("compra que zera o estoque muda o estado", () => {
  const stock = 2 - 2;
  assert.equal(computeAvailability(stock, true), "made_to_order");
  assert.equal(computeAvailability(stock, false), "sold_out");
});

test("a coluna do banco prevalece; sem ela, deduz pelo estoque", () => {
  assert.equal(availabilityFor({ availability: "sold_out", stock: 0 }), "sold_out");
  assert.equal(availabilityFor({ stock: 19, ready_to_ship: false }), "ready");
  assert.equal(availabilityFor({ stock: null, ready_to_ship: true }), "made_to_order");
});

test("quantidade máxima segue o estado", () => {
  assert.equal(maxQuantityFor({ availability: "ready", stock: 3 }), 3);
  assert.equal(maxQuantityFor({ availability: "made_to_order", stock: 0 }), 99);
  assert.equal(maxQuantityFor({ availability: "sold_out", stock: 0 }), 0);
});

test("sob encomenda mostra o prazo de produção, não unidades", () => {
  assert.match(productionLabel("made_to_order", 2) ?? "", /2 dias/);
  assert.equal(productionLabel("ready", 2), "Pronta para postagem");
  assert.equal(productionLabel("sold_out", 2), null);
});
