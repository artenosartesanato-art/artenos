import { test } from "node:test";
import assert from "node:assert/strict";
import { activeFilterCount, catalogHref, EMPTY_FILTERS, parseCatalogQuery, sameFilters } from "../../lib/catalog-filters.ts";

test("lê categoria pelo nome ou pelo id antigo, preço, disponibilidade e ordem", () => {
  const filters = parseCatalogQuery("?categoria=croche-e-trico&min=50&max=100&pronta=1&ordem=rating&busca=vaso");
  assert.deepEqual(filters, { query: "vaso", category: "croche-e-trico", min: 50, max: 100, readyOnly: true, madeToOrderOnly: false, sort: "rating" });
  assert.equal(parseCatalogQuery("?categoria=00000000-0000-0000-0000-000000000001").category, "00000000-0000-0000-0000-000000000001");
});

test("ignora valores inválidos", () => {
  const filters = parseCatalogQuery("?categoria=<x>&min=-3&max=abc&ordem=hack&pronta=1&encomenda=1");
  assert.equal(filters.category, null);
  assert.equal(filters.min, null);
  assert.equal(filters.max, null);
  assert.equal(filters.sort, "newest");
  assert.equal(filters.madeToOrderOnly, false, "pronta entrega e sob encomenda não valem juntos");
});

test("escreve o endereço com o nome da categoria", () => {
  const filters = { ...EMPTY_FILTERS, category: "00000000-0000-0000-0000-000000000001", min: 50, madeToOrderOnly: true };
  assert.equal(catalogHref(filters, "croche-e-trico"), "/categorias?categoria=croche-e-trico&min=50&encomenda=1");
  assert.equal(catalogHref(EMPTY_FILTERS), "/categorias");
});

test("ida e volta preservam os filtros", () => {
  const filters = { ...EMPTY_FILTERS, query: "manta", category: "croche-e-trico", max: 200, readyOnly: true, sort: "price_asc" as const };
  assert.ok(sameFilters(parseCatalogQuery(catalogHref(filters).split("?")[1]), filters));
});

test("conta os filtros do painel", () => {
  assert.equal(activeFilterCount({ ...EMPTY_FILTERS, min: 50, max: 100, readyOnly: true }), 2);
  assert.equal(activeFilterCount({ ...EMPTY_FILTERS, category: "macrame", query: "x" }), 0);
});
