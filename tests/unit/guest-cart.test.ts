import { test } from "node:test";
import assert from "node:assert/strict";
import { guestCartAdd, guestCartTotals, type GuestProduct } from "../../lib/guest-cart.ts";

const vaso: GuestProduct = { id: "a", name: "Vaso", price: 19.9, stock: 4 };
const colar: GuestProduct = { id: "b", name: "Colar", price: 0.1, stock: null };

test("soma quantidades da mesma peça e calcula o total em centavos", () => {
  let cart = guestCartAdd([], vaso, 1);
  cart = guestCartAdd(cart, vaso, 2);
  cart = guestCartAdd(cart, colar, 3);
  assert.equal(cart.length, 2);
  assert.equal(cart[0].quantity, 3);
  assert.deepEqual(guestCartTotals(cart), { count: 6, subtotalCents: 1990 * 3 + 10 * 3 });
});

test("respeita o estoque com a mesma mensagem do servidor", () => {
  const cart = guestCartAdd([], vaso, 4);
  assert.throws(() => guestCartAdd(cart, vaso, 1), /Estoque insuficiente/);
  assert.throws(() => guestCartAdd([], vaso, 5), /Estoque insuficiente/);
  assert.throws(() => guestCartAdd([], { ...vaso, stock: 0, availability: "sold_out" }, 1), /esgotada/);
});

test("sob encomenda não fica preso ao estoque", () => {
  const cart = guestCartAdd([], { ...vaso, stock: 0, availability: "made_to_order" }, 10);
  assert.equal(cart[0].quantity, 10);
});

test("quantidade inválida é recusada", () => {
  assert.throws(() => guestCartAdd([], colar, 0), /quantidade/);
  assert.throws(() => guestCartAdd([], colar, Number.NaN), /quantidade/);
});

test("a mesma peça em opções diferentes vira linhas diferentes", () => {
  const azul: GuestProduct = { ...vaso, price: 25, stock: 2, variant_id: "v1", variant_label: "Cor: Azul" };
  const verde: GuestProduct = { ...vaso, price: 30, stock: 1, variant_id: "v2", variant_label: "Cor: Verde" };
  let cart = guestCartAdd([], azul, 1);
  cart = guestCartAdd(cart, verde, 1);
  cart = guestCartAdd(cart, azul, 1);
  assert.equal(cart.length, 2);
  assert.equal(cart[0].quantity, 2);
  assert.throws(() => guestCartAdd(cart, verde, 1), /Estoque insuficiente/);
  assert.equal(guestCartTotals(cart).subtotalCents, 2 * 2500 + 3000);
});
