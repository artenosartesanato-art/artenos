import { test } from "node:test";
import assert from "node:assert/strict";
import { categoryLook, PATTERN_COUNT } from "../../lib/category-looks.ts";

test("acha o visual pela técnica, com ou sem acento", () => {
  assert.equal(categoryLook({ name: "Cerâmica e Barro", slug: "ceramica-e-barro" }).icon, "cup-hot");
  assert.equal(categoryLook({ name: "Crochê e Tricô" }).icon, "globe2");
  assert.equal(categoryLook({ name: "Velas, Aromas e Sabonetes" }).icon, "fire");
  assert.equal(categoryLook({ name: "Brinquedos e Amigurumis" }).icon, "puzzle");
  // "artesanal" não é "arte": cada uma tem o seu visual.
  assert.equal(categoryLook({ name: "Arte e Pintura", slug: "arte-e-pintura" }).icon, "palette");
  assert.equal(categoryLook({ name: "Decoração Artesanal", slug: "decoracao-artesanal" }).icon, "house-heart");
  assert.equal(categoryLook({ name: "Moda Artesanal", slug: "moda-artesanal" }).icon, "handbag");
});

test("categoria desconhecida ganha um padrão pela posição", () => {
  const look = categoryLook({ name: "Vitrais" }, PATTERN_COUNT + 2);
  assert.equal(look.icon, "stars");
  assert.equal(look.pattern, 3);
});
