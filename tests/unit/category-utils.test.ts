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
