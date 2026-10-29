// Filtros da listagem de peças <-> endereço (query string). Puro e testável:
// o link pode ser compartilhado e o botão Voltar refaz a busca anterior.

export type CatalogSort = "newest" | "rating" | "price_asc" | "price_desc";
export type CatalogFilters = {
  query: string;
  /** Categoria como aparece no endereço: nome (slug) ou id antigo. */
  category: string | null;
  min: number | null;
  max: number | null;
  readyOnly: boolean;
  madeToOrderOnly: boolean;
  sort: CatalogSort;
};

export const EMPTY_FILTERS: CatalogFilters = {
  query: "", category: null, min: null, max: null, readyOnly: false, madeToOrderOnly: false, sort: "newest",
};

const SORTS: readonly CatalogSort[] = ["newest", "rating", "price_asc", "price_desc"];
const CATEGORY_REF = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[a-z0-9]+(?:-[a-z0-9]+)*)$/i;

function amount(value: string | null) {
  if (value === null || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function parseCatalogQuery(search: string): CatalogFilters {
  const params = new URLSearchParams(search);
  const category = (params.get("categoria") ?? "").trim().slice(0, 80);
  const sort = params.get("ordem") as CatalogSort | null;
  const readyOnly = params.get("pronta") === "1";
  return {
    query: (params.get("busca") ?? "").trim().slice(0, 100),
    category: CATEGORY_REF.test(category) ? category : null,
    min: amount(params.get("min")),
    max: amount(params.get("max")),
    readyOnly,
    madeToOrderOnly: !readyOnly && params.get("encomenda") === "1",
    sort: sort && SORTS.includes(sort) ? sort : "newest",
  };
}

/** Endereço da listagem. categorySlug troca o id antigo pelo nome, quando conhecido. */
export function catalogHref(filters: CatalogFilters, categorySlug?: string | null) {
  const params = new URLSearchParams();
  if (filters.query) params.set("busca", filters.query);
  if (filters.category) params.set("categoria", categorySlug || filters.category);
  if (filters.min !== null) params.set("min", String(filters.min));
  if (filters.max !== null) params.set("max", String(filters.max));
  if (filters.readyOnly) params.set("pronta", "1");
  if (filters.madeToOrderOnly) params.set("encomenda", "1");
  if (filters.sort !== "newest") params.set("ordem", filters.sort);
  const query = params.toString();
  return query ? `/categorias?${query}` : "/categorias";
}

export function sameFilters(a: CatalogFilters, b: CatalogFilters) {
  return a.query === b.query && a.category === b.category && a.min === b.min && a.max === b.max
    && a.readyOnly === b.readyOnly && a.madeToOrderOnly === b.madeToOrderOnly && a.sort === b.sort;
}

/** Quantos filtros do painel estão ligados (preço conta como um). Busca e categoria ficam fora. */
export function activeFilterCount(filters: CatalogFilters) {
  return Number(filters.min !== null || filters.max !== null) + Number(filters.readyOnly) + Number(filters.madeToOrderOnly);
}

/** Evento para a listagem reler o endereço quando ele muda sem trocar de página. */
export const CATALOG_URL_EVENT = "artenos:catalog-url";
