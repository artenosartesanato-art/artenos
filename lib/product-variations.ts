// Variações de uma peça (cor, tamanho...): lógica pura usada pelo formulário do
// catálogo e pela vitrine. As MESMAS regras são conferidas no banco
// (save_my_product_options, 20261113 e 20261116_variacoes_padronizadas.sql).

import { canonicalType, checkOption, isVariationType } from "./variation-catalog.ts";

export const MAX_PRODUCT_PHOTOS = 3;
export const MAX_VARIATION_GROUPS = 2;
export const MAX_OPTIONS_PER_GROUP = 20;
export const MAX_VARIANTS = 50;
export const VARIATION_NAME_MAX = 20;
export const VARIATION_OPTION_MAX = 40;

export type VariationGroup = { name: string; options: string[] };

export type VariantValues = { price: string; stock: string };

export type VariantRow = VariantValues & { key: string; option1: string; option2: string | null };

export type SavedVariant = { option1: string; option2: string | null; price: number; stock: number; image_url?: string | null };

export const cleanText = (value: string) => value.replace(/\s+/g, " ").trim();

export function variantKey(option1: string, option2: string | null) {
  return `${option1.toLowerCase()}\u0001${(option2 ?? "").toLowerCase()}`;
}

/** Combinações (produto cartesiano) na ordem em que as opções foram criadas. */
export function buildCombinations(groups: readonly VariationGroup[]): Array<{ key: string; option1: string; option2: string | null }> {
  const [first, second] = groups;
  if (!first || !first.options.length) return [];
  const seconds = second?.options.length ? second.options : [null];
  if (second && !second.options.length) return [];
  return first.options.flatMap((option1) => seconds.map((option2) => ({ key: variantKey(option1, option2), option1, option2 })));
}

/** Linhas da tabela, preservando preço/estoque já digitados por combinação. */
export function buildRows(groups: readonly VariationGroup[], values: Readonly<Record<string, VariantValues>>): VariantRow[] {
  return buildCombinations(groups).map((combo) => ({ ...combo, ...(values[combo.key] ?? { price: "", stock: "0" }) }));
}

/**
 * Confere uma opção nova para o grupo (tipo da lista + regra do tipo). Devolve
 * a opção no formato oficial ou a mensagem de erro.
 */
export function optionError(group: VariationGroup, raw: string): { option: string; error: null } | { option: null; error: string } {
  const checked = checkOption(cleanText(group.name), raw);
  if (!checked.ok) return { option: null, error: checked.message };
  const option = checked.value;
  if (option.length > VARIATION_OPTION_MAX) return { option: null, error: `Use até ${VARIATION_OPTION_MAX} caracteres.` };
  if (group.options.some((existing) => existing.toLowerCase() === option.toLowerCase())) return { option: null, error: "Essa opção já existe." };
  if (group.options.length >= MAX_OPTIONS_PER_GROUP) return { option: null, error: `Use até ${MAX_OPTIONS_PER_GROUP} opções por variação.` };
  return { option, error: null };
}

/** Valida os grupos e a tabela; devolve a primeira mensagem de erro ou null. */
export function variationsError(groups: readonly VariationGroup[], rows: readonly VariantRow[]): string | null {
  if (!groups.length) return null;
  const names = groups.map((group) => cleanText(group.name));
  if (names.some((name) => !name)) return "Escolha o tipo de cada variação (ex.: Cor, Tamanho).";
  const unknown = names.find((name) => !isVariationType(name));
  if (unknown) return `O tipo “${unknown}” não é mais aceito. Escolha um tipo da lista.`;
  if (names.some((name) => name.length > VARIATION_NAME_MAX)) return `O nome da variação deve ter até ${VARIATION_NAME_MAX} caracteres.`;
  if (new Set(names.map((name) => name.toLowerCase())).size !== names.length) return "As variações precisam ter tipos diferentes.";
  const empty = groups.find((group) => !group.options.length);
  if (empty) return `Adicione pelo menos uma opção em “${cleanText(empty.name) || "variação"}”.`;
  for (const group of groups) {
    for (const option of group.options) {
      const checked = checkOption(cleanText(group.name), option);
      if (!checked.ok) return `${cleanText(group.name)}: ${checked.message} Remova a opção e escolha de novo.`;
    }
  }
  if (rows.length > MAX_VARIANTS) return `Use no máximo ${MAX_VARIANTS} combinações (hoje são ${rows.length}).`;
  for (const row of rows) {
    const label = [row.option1, row.option2].filter(Boolean).join(" / ");
    const price = Number(row.price);
    const stock = Number(row.stock);
    if (row.price.trim() === "" || !Number.isFinite(price) || price < 0.01 || price > 99999999.99) return `Informe o preço de ${label}.`;
    if (row.stock.trim() === "" || !Number.isInteger(stock) || stock < 0 || stock > 999999) return `Informe um estoque válido (0 ou mais) para ${label}.`;
  }
  return null;
}

/** Resumo que vai para a peça: menor preço ("a partir de") e estoque total. */
export function variationTotals(rows: readonly VariantRow[]) {
  const prices = rows.map((row) => Number(row.price)).filter((price) => Number.isFinite(price) && price > 0);
  return {
    minPrice: prices.length ? Math.min(...prices) : 0,
    maxPrice: prices.length ? Math.max(...prices) : 0,
    totalStock: rows.reduce((sum, row) => sum + (Number.isInteger(Number(row.stock)) ? Math.max(0, Number(row.stock)) : 0), 0),
  };
}

/** Opção válida, mas escrita de outro jeito ("azul", "30×40 cm"), vira o formato oficial. */
export function normalizeOption(type: string, option: string) {
  const checked = checkOption(cleanText(type), option);
  return checked.ok ? checked.value : option;
}

/** Reconstrói o formulário a partir do que está salvo no banco. */
export function groupsFromSaved(names: readonly string[], variants: readonly SavedVariant[]) {
  // Tipo antigo (digitado antes da lista fechada) vira o equivalente da lista, quando há um.
  const groups: VariationGroup[] = names.slice(0, MAX_VARIATION_GROUPS)
    .map((name) => ({ name: isVariationType(name) ? name : canonicalType(name) ?? name, options: [] }));
  const values: Record<string, VariantValues> = {};
  const normalize = (group: VariationGroup | undefined, option: string) => (group ? normalizeOption(group.name, option) : option);
  for (const variant of variants) {
    const option1 = normalize(groups[0], variant.option1);
    const option2 = variant.option2 ? normalize(groups[1], variant.option2) : null;
    if (groups[0] && !groups[0].options.includes(option1)) groups[0].options.push(option1);
    if (groups[1] && option2 && !groups[1].options.includes(option2)) groups[1].options.push(option2);
    values[variantKey(option1, groups[1] ? option2 : null)] = { price: String(variant.price), stock: String(variant.stock) };
  }
  return { groups, values };
}

export function variantLabel(names: readonly string[], option1: string, option2: string | null) {
  return [
    names[0] ? `${names[0]}: ${option1}` : option1,
    option2 ? (names[1] ? `${names[1]}: ${option2}` : option2) : "",
  ].filter(Boolean).join(" · ");
}

// ---------- Vitrine ----------

export type PublicVariant = {
  id: string;
  option1: string;
  option2: string | null;
  price: number;
  stock: number;
  image_url: string | null;
  availability: "ready" | "made_to_order" | "sold_out";
  max_quantity: number;
};

export type ProductOptions = { images: string[]; variation_names: string[]; variants: PublicVariant[] };

/** Opções da 2ª variação disponíveis para a 1ª escolhida (e vice-versa). */
export function findVariant(variants: readonly PublicVariant[], option1: string | null, option2: string | null, needsSecond: boolean) {
  if (!option1 || (needsSecond && !option2)) return null;
  return variants.find((variant) => variant.option1 === option1 && (needsSecond ? variant.option2 === option2 : true)) ?? null;
}

/** Uma opção está esgotada em todas as combinações com a outra variação escolhida? */
export function optionSoldOut(variants: readonly PublicVariant[], level: 1 | 2, value: string, other: string | null) {
  const matches = variants.filter((variant) => (level === 1 ? variant.option1 === value && (!other || variant.option2 === other)
    : variant.option2 === value && (!other || variant.option1 === other)));
  return matches.length > 0 && matches.every((variant) => variant.availability === "sold_out");
}

export function uniqueOptions(variants: readonly PublicVariant[], level: 1 | 2) {
  return Array.from(new Set(variants.map((variant) => (level === 1 ? variant.option1 : variant.option2)).filter((value): value is string => Boolean(value))));
}
