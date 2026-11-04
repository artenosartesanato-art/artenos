import { test } from "node:test";
import assert from "node:assert/strict";
import { categoryLook, DEFAULT_CATEGORY_ICON, PATTERN_COUNT } from "../../lib/category-looks.ts";
import { readFileSync } from "node:fs";

test("acha o visual pela técnica, com ou sem acento", () => {
  assert.equal(categoryLook({ name: "Cerâmica e Barro", slug: "ceramica-e-barro" }).icon, "art-ceramica");
  assert.equal(categoryLook({ name: "Crochê e Tricô" }).icon, "art-croche");
  assert.equal(categoryLook({ name: "Velas, Aromas e Sabonetes" }).icon, "art-vela");
  assert.equal(categoryLook({ name: "Brinquedos e Amigurumis" }).icon, "art-brinquedo");
  // "artesanal" não é "arte": cada uma tem o seu visual.
  assert.equal(categoryLook({ name: "Arte e Pintura", slug: "arte-e-pintura" }).icon, "palette");
  assert.equal(categoryLook({ name: "Decoração Artesanal", slug: "decoracao-artesanal" }).icon, "art-decoracao");
  assert.equal(categoryLook({ name: "Moda Artesanal", slug: "moda-artesanal" }).icon, "art-moda");
});

test("categoria desconhecida ganha um padrão pela posição", () => {
  const look = categoryLook({ name: "Vitrais" }, PATTERN_COUNT + 2);
  assert.equal(look.icon, DEFAULT_CATEGORY_ICON);
  assert.equal(look.pattern, 3);
});

test("cada ícone próprio existe no arquivo de desenhos", () => {
  const sprite = readFileSync(new URL("../../public/icons/artenos-categorias.svg", import.meta.url), "utf8");
  const names = ["Cerâmica", "Crochê", "Bordado", "Tecelagem", "Macramê", "Fibras Naturais", "Madeira", "Costura", "Velas", "Decoração", "Brinquedos", "Moda"]
    .map((name) => categoryLook({ name }).icon);
  for (const icon of names) {
    assert.ok(icon.startsWith("art-"), `${icon} é desenho próprio`);
    assert.ok(sprite.includes(`id="${icon}"`), `${icon} está no SVG`);
  }
});
