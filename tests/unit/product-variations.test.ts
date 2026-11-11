import test from "node:test";
import assert from "node:assert/strict";
import {
  buildRows, findVariant, groupsFromSaved, optionError, optionSoldOut, uniqueOptions, variantKey, variantLabel,
  variationTotals, variationsError, type PublicVariant,
} from "../../lib/product-variations.ts";

const cor = { name: "Cor", options: ["Azul", "Verde"] };
const tamanho = { name: "Tamanho", options: ["40×50 cm", "50×60 cm"] };

test("combina duas variações e preserva preço e estoque digitados", () => {
  const values = { [variantKey("Azul", "40×50 cm")]: { price: "120", stock: "2" } };
  const rows = buildRows([cor, tamanho], values);
  assert.equal(rows.length, 4);
  assert.deepEqual(rows.map((row) => [row.option1, row.option2]), [
    ["Azul", "40×50 cm"], ["Azul", "50×60 cm"], ["Verde", "40×50 cm"], ["Verde", "50×60 cm"]]);
  assert.equal(rows[0].price, "120");
  assert.equal(rows[1].price, "");
  assert.equal(buildRows([cor], {}).length, 2);
  assert.equal(buildRows([cor, { name: "Tamanho", options: [] }], {}).length, 0);
});

test("valida nomes, opções, preços e estoques", () => {
  assert.match(variationsError([{ name: "", options: ["A"] }], buildRows([{ name: "", options: ["A"] }], {})) ?? "", /nome/);
  assert.match(variationsError([cor, { name: "cor", options: ["P"] }], []) ?? "", /nomes diferentes/);
  assert.match(variationsError([cor], buildRows([cor], {})) ?? "", /preço de Azul/);
  const ok = buildRows([cor], { [variantKey("Azul", null)]: { price: "10", stock: "0" }, [variantKey("Verde", null)]: { price: "12.5", stock: "3" } });
  assert.equal(variationsError([cor], ok), null);
  assert.deepEqual(variationTotals(ok), { minPrice: 10, maxPrice: 12.5, totalStock: 3 });
  assert.equal(optionError(cor, " azul "), "Essa opção já existe.");
  assert.equal(optionError(cor, "Rosa"), null);
});

test("reconstrói o formulário a partir do banco", () => {
  const { groups, values } = groupsFromSaved(["Cor", "Tamanho"], [
    { option1: "Azul", option2: "P", price: 10, stock: 1 },
    { option1: "Azul", option2: "M", price: 11, stock: 0 },
    { option1: "Rosa", option2: "P", price: 12, stock: 4 },
  ]);
  assert.deepEqual(groups, [{ name: "Cor", options: ["Azul", "Rosa"] }, { name: "Tamanho", options: ["P", "M"] }]);
  assert.deepEqual(values[variantKey("Rosa", "P")], { price: "12", stock: "4" });
  assert.equal(variantLabel(["Cor", "Tamanho"], "Azul", "P"), "Cor: Azul · Tamanho: P");
});

test("vitrine encontra a opção escolhida e marca as esgotadas", () => {
  const variant = (id: string, option1: string, option2: string | null, availability: PublicVariant["availability"]): PublicVariant =>
    ({ id, option1, option2, price: 10, stock: availability === "ready" ? 1 : 0, image_url: null, availability, max_quantity: availability === "sold_out" ? 0 : 1 });
  const variants = [variant("1", "Azul", "P", "ready"), variant("2", "Azul", "M", "sold_out"), variant("3", "Verde", "M", "sold_out")];
  assert.equal(findVariant(variants, "Azul", null, true), null);
  assert.equal(findVariant(variants, "Azul", "P", true)?.id, "1");
  assert.deepEqual(uniqueOptions(variants, 2), ["P", "M"]);
  assert.equal(optionSoldOut(variants, 1, "Verde", null), true);
  assert.equal(optionSoldOut(variants, 2, "M", "Azul"), true);
  assert.equal(optionSoldOut(variants, 1, "Azul", null), false);
});
