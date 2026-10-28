import { test } from "node:test";
import assert from "node:assert/strict";
import { change, orderTone, slugify } from "../../lib/admin.ts";

test("variação: sem base no período anterior não inventa porcentagem", () => {
  assert.equal(change(10, 0), null);
  assert.equal(change(15, 10), 50);
  assert.equal(change(5, 10), -50);
});

test("endereço da categoria a partir do nome", () => {
  assert.equal(slugify("Crochê e Tricô"), "croche-e-trico");
  assert.equal(slugify("Velas, Aromas & Sabonetes"), "velas-aromas-e-sabonetes");
  assert.equal(slugify("  Joias  "), "joias");
});

test("tom do status do pedido", () => {
  assert.equal(orderTone("delivered"), "ok");
  assert.equal(orderTone("delivery_failed"), "alert");
  assert.equal(orderTone("refunded"), "muted");
  assert.equal(orderTone("preparing"), "wait");
});
