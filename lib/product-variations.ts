// Variações de uma peça (cor, tamanho...): lógica pura usada pelo formulário do
// catálogo e pela vitrine. As MESMAS regras são conferidas no banco
// (save_my_product_options, 20261113_fotos_variacoes_produto.sql).

export const MAX_PRODUCT_PHOTOS = 3;
export const MAX_VARIATION_GROUPS = 2;
export const MAX_OPTIONS_PER_GROUP = 20;
export const MAX_VARIANTS = 50;
export const VARIATION_NAME_MAX = 20;
export const VARIATION_OPTION_MAX = 40;

/** Tipos sugeridos (mesma lista dos grandes marketplaces); o artesão pode criar outro. */
export const VARIATION_PRESETS = ["Cor", "Tamanho", "Estilo", "Comprimento", "Material", "Estampa"] as const;

/** Sugestões rápidas de opções por tipo. */
export const OPTION_SUGGESTIONS: Record<string, string[]> = {
  Cor: ["Branco", "Preto", "Azul", "Verde", "Vermelho", "Amarelo", "Rosa", "Natural"],
  Tamanho: ["P", "M", "G", "GG", "30×40 cm", "40×50 cm", "50×60 cm"],
  Comprimento: ["40 cm", "45 cm", "50 cm", "60 cm"],
  Material: ["Algodão", "Linho", "Madeira", "Cerâmica", "Couro"],
};

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

/** Adiciona uma opção ao grupo; devolve a mensagem de erro, se houver. */
export function optionError(group: VariationGroup, raw: string): string | null {
  const option = cleanText(raw);
  if (!option) return "Digite a opção.";
  if (option.length > VARIATION_OPTION_MAX) return `Use até ${VARIATION_OPTION_MAX} caracteres.`;
  if (group.options.some((existing) => existing.toLowerCase() === option.toLowerCase())) return "Essa opção já existe.";
  if (group.options.length >= MAX_OPTIONS_PER_GROUP) return `Use até ${MAX_OPTIONS_PER_GROUP} opções por variação.`;
  return null;
}

/** Valida os grupos e a tabela; devolve a primeira mensagem de erro ou null. */
export function variationsError(groups: readonly VariationGroup[], rows: readonly VariantRow[]): string | null {
  if (!groups.length) return null;
  const names = groups.map((group) => cleanText(group.name));
  if (names.some((name) => !name)) return "Dê um nome para cada variação (ex.: Cor, Tamanho).";
  if (names.some((name) => name.length > VARIATION_NAME_MAX)) return `O nome da variação deve ter até ${VARIATION_NAME_MAX} caracteres.`;
  if (new Set(names.map((name) => name.toLowerCase())).size !== names.length) return "As variações precisam ter nomes diferentes.";
  const empty = groups.find((group) => !group.options.length);
  if (empty) return `Adicione pelo menos uma opção em “${cleanText(empty.name) || "variação"}”.`;
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

/** Reconstrói o formulário a partir do que está salvo no banco. */
export function groupsFromSaved(names: readonly string[], variants: readonly SavedVariant[]) {
  const groups: VariationGroup[] = names.slice(0, MAX_VARIATION_GROUPS).map((name) => ({ name, options: [] }));
  const values: Record<string, VariantValues> = {};
  for (const variant of variants) {
    if (groups[0] && !groups[0].options.includes(variant.option1)) groups[0].options.push(variant.option1);
    if (groups[1] && variant.option2 && !groups[1].options.includes(variant.option2)) groups[1].options.push(variant.option2);
    values[variantKey(variant.option1, groups[1] ? variant.option2 : null)] = { price: String(variant.price), stock: String(variant.stock) };
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
