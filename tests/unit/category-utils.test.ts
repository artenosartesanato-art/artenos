import { test } from "node:test";
import assert from "node:assert/strict";
import { categoryHref, findCategory, isCategoryRef, topCategories } from "../../lib/category-utils.ts";

const list = [
  { id: "00000000-0000-0000-0000-000000000001", name: "Crochê e Tricô", slug: "croche-e-trico", image_url: null, product_count: 3 },
  { id: "00000000-0000-0000-0000-000000000002", name: "Macramê", slug: "macrame", image_url: null, product_count: 0 },
  { id: "00000000-0000-0000-0000-000000000003", name: "Bordado e Renda", slug: "bordado-e-renda", image_url: null, product_count: 5 },
];

test("acha a categoria pelo nome na URL ou pelo id antigo", () => {
  assert.equal(findCategory(list, "croche-e-trico")?.name, "Crochê e Tricô");
  assert.equal(findCategory(list, "00000000-0000-0000-0000-000000000003")?.slug, "bordado-e-renda");
  assert.equal(findCategory(list, "nao-existe"), null);
  assert.equal(findCategory(null, "macrame"), null);
});

test("link usa o nome da categoria", () => {
  assert.equal(categoryHref(list[0]), "/categorias?categoria=croche-e-trico");
});

test("aceita só referências seguras", () => {
  assert.equal(isCategoryRef("croche-e-trico"), true);
  assert.equal(isCategoryRef("00000000-0000-0000-0000-000000000001"), true);
  assert.equal(isCategoryRef("<script>"), false);
  assert.equal(isCategoryRef(""), false);
});

test("destaques são as categorias com mais peças", () => {
  assert.deepEqual(topCategories(list, 2).map((category) => category.slug), ["bordado-e-renda", "croche-e-trico"]);
});

test("contador da categoria descreve peças e opções sob encomenda", async () => {
  const { categoryCountLabel } = await import("../../lib/category-utils.ts");
  const base = { id: "1", name: "Arte e Pintura", slug: "arte-e-pintura", image_url: null };
  assert.equal(categoryCountLabel({ ...base, product_count: 1, piece_count: 0, service_count: 1 }), "1 item: 1 opção sob encomenda");
  assert.equal(categoryCountLabel({ ...base, product_count: 3, piece_count: 2, service_count: 1 }), "3 itens: 2 peças e 1 opção sob encomenda");
  // Função antiga (só peças, sem os campos novos).
  assert.equal(categoryCountLabel({ ...base, product_count: 2 }), "2 peças");
});
