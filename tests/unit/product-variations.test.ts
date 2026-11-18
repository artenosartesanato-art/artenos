import test from "node:test";
import assert from "node:assert/strict";
import {
  buildRows, findVariant, groupsFromSaved, optionError, optionSoldOut, uniqueOptions, variantKey, variantLabel,
  variationTotals, variationsError, type PublicVariant,
} from "../../lib/product-variations.ts";

const cor = { name: "Cor", options: ["Azul", "Verde"] };
const tamanho = { name: "Tamanho", options: ["40 × 50 cm", "50 × 60 cm"] };

test("combina duas variações e preserva preço e estoque digitados", () => {
  const values = { [variantKey("Azul", "40 × 50 cm")]: { price: "120", stock: "2" } };
  const rows = buildRows([cor, tamanho], values);
  assert.equal(rows.length, 4);
  assert.deepEqual(rows.map((row) => [row.option1, row.option2]), [
    ["Azul", "40 × 50 cm"], ["Azul", "50 × 60 cm"], ["Verde", "40 × 50 cm"], ["Verde", "50 × 60 cm"]]);
  assert.equal(rows[0].price, "120");
  assert.equal(rows[1].price, "");
  assert.equal(buildRows([cor], {}).length, 2);
  assert.equal(buildRows([cor, { name: "Tamanho", options: [] }], {}).length, 0);
});

test("valida nomes, opções, preços e estoques", () => {
  assert.match(variationsError([{ name: "", options: ["A"] }], buildRows([{ name: "", options: ["A"] }], {})) ?? "", /tipo de cada/);
  assert.match(variationsError([cor, { name: "Cor", options: ["Rosa"] }], []) ?? "", /tipos diferentes/);
  assert.match(variationsError([{ name: "Sabor", options: ["Uva"] }], []) ?? "", /não é mais aceito/);
  assert.match(variationsError([{ name: "Cor", options: ["Azulão"] }], []) ?? "", /paleta/);
  assert.match(variationsError([cor], buildRows([cor], {})) ?? "", /preço de Azul/);
  const ok = buildRows([cor], { [variantKey("Azul", null)]: { price: "10", stock: "0" }, [variantKey("Verde", null)]: { price: "12.5", stock: "3" } });
  assert.equal(variationsError([cor], ok), null);
  assert.deepEqual(variationTotals(ok), { minPrice: 10, maxPrice: 12.5, totalStock: 3 });
  assert.equal(optionError(cor, " azul ").error, "Essa opção já existe.");
  assert.deepEqual(optionError(cor, "rosa"), { option: "Rosa", error: null });
  assert.match(optionError(cor, "Cor feia").error ?? "", /paleta/);
});

test("reconstrói o formulário a partir do banco", () => {
  // Tipo antigo digitado ("Kit") vira o da lista; desconhecido fica como está (o formulário pede para trocar).
  assert.deepEqual(groupsFromSaved(["Kit"], [{ option1: "4 unidades", option2: null, price: 1, stock: 1 }]).groups,
    [{ name: "Quantidade", options: ["4 unidades"] }]);
  assert.equal(groupsFromSaved(["Sabor"], [{ option1: "Uva", option2: null, price: 1, stock: 1 }]).groups[0].name, "Sabor");
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

test("lista fechada: cada tipo só aceita o seu formato", async () => {
  const { checkOption, canonicalType, quantityOption, lengthOption, measureOption, measureFrom, quantityFrom } =
    await import("../../lib/variation-catalog.ts");
  const ok = (type: string, raw: string) => { const r = checkOption(type, raw); return r.ok ? r.value : null; };
  assert.equal(ok("Cor", "azul-marinho"), "Azul-marinho");
  assert.equal(ok("Cor", "Lilas"), "Lilás");
  assert.equal(ok("Cor", "Furta-cor"), null);
  assert.equal(ok("Material", "algodao"), "Algodão");
  assert.equal(ok("Material", "Plástico ruim"), null);
  assert.equal(ok("Tamanho", "gg"), "GG");
  assert.equal(ok("Tamanho", "38"), "38");
  assert.equal(ok("Tamanho", "30x40 cm"), "30 × 40 cm");
  assert.equal(ok("Tamanho", "Enorme"), null);
  assert.equal(ok("Comprimento", "45 cm"), "45 cm");
  assert.equal(ok("Comprimento", "45,5 cm"), "45,5 cm");
  assert.equal(ok("Comprimento", "longo"), null);
  assert.equal(ok("Quantidade", "4 unidades"), "4 unidades");
  assert.equal(ok("Quantidade", "1 unidades"), "1 unidade");
  assert.equal(ok("Quantidade", "muitas"), null);
  assert.equal(ok("Estampa", "Floral"), "Floral");
  assert.equal(ok("Estampa", "Um nome comprido demais aqui"), null);
  assert.equal(ok("Aroma", "<script>"), null);
  assert.equal(ok("Sabor", "Uva"), null);
  assert.equal(canonicalType(" Fragrância "), "Aroma");
  assert.equal(canonicalType("Estilo"), "Modelo");
  assert.equal(canonicalType("Sabor"), null);
  assert.equal(quantityOption(1), "1 unidade");
  assert.equal(lengthOption(45.5), "45,5 cm");
  assert.equal(measureOption(30, 40), "30 × 40 cm");
  assert.equal(measureFrom("12,5"), 12.5);
  assert.equal(measureFrom("0"), null);
  assert.equal(measureFrom("12,55"), null);
  assert.equal(quantityFrom("2.5"), null);
});

test("seletor de cor associa a cor escolhida ao nome da paleta", async () => {
  const { nearestColor } = await import("../../lib/variation-catalog.ts");
  assert.equal(nearestColor("#1e2d57")?.name, "Azul-marinho");
  assert.equal(nearestColor("#fefefe")?.name, "Branco");
  assert.equal(nearestColor("#c0392b")?.name, "Vermelho");
  assert.equal(nearestColor("#5a6a3a")?.name, "Verde-musgo");
  assert.equal(nearestColor("#e48fa5")?.name, "Rosa");
  assert.equal(nearestColor("azul"), null);
});
