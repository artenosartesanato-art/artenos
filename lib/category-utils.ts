// Regras puras das categorias (testáveis no Node).
export type StorefrontCategory = { id: string; name: string; slug: string; image_url: string | null; product_count: number };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Categoria pelo endereço: aceita o nome na URL (slug) e os links antigos com id. */
export function findCategory(list: readonly StorefrontCategory[] | null, ref: string | null | undefined) {
  if (!list || !ref) return null;
  return list.find((category) => category.slug === ref || category.id === ref) ?? null;
}

export function isCategoryRef(value: string | null | undefined) {
  return Boolean(value && (UUID.test(value) || /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)));
}

export function categoryHref(category: Pick<StorefrontCategory, "slug" | "id">) {
  return `/categorias?categoria=${encodeURIComponent(category.slug || category.id)}`;
}

/** Destaques do menu: as categorias com mais peças (só as que têm peças). */
export function topCategories(list: readonly StorefrontCategory[], limit = 4) {
  return [...list].filter((category) => category.product_count > 0)
    .sort((a, b) => b.product_count - a.product_count || a.name.localeCompare(b.name, "pt-BR"))
    .slice(0, limit);
}
