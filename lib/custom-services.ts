// Opções sob encomenda (serviços de orçamento das lojas): tipos e o filtro que
// as coloca na mesma listagem das peças. Puro, para testar sem navegador.

export type CustomService = {
  id: string;
  artisan_id: string;
  store_name?: string | null;
  title: string;
  description: string | null;
  image_url: string | null;
  starting_price: number | null;
  min_production_days: number;
  max_production_days: number;
  category_id?: string | null;
  category_name?: string | null;
};

export type ServiceFilters = {
  query: string;
  categoryId: string | null;
  min: number | null;
  max: number | null;
  readyOnly: boolean;
  madeToOrderOnly: boolean;
};

export function productionLabel(service: Pick<CustomService, "min_production_days" | "max_production_days">) {
  const { min_production_days: min, max_production_days: max } = service;
  return min === max ? `${max} ${max === 1 ? "dia" : "dias"}` : `${min} a ${max} dias`;
}

const fold = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("pt-BR");

/**
 * Mesmas regras da listagem de peças: "Só pronta entrega" esconde as opções
 * (são feitas depois do pedido); categoria, faixa de preço (pelo "a partir de")
 * e busca valem para elas também.
 */
export function filterServices(services: CustomService[], filters: ServiceFilters) {
  if (filters.readyOnly) return [];
  const term = fold(filters.query.trim());
  return services.filter((service) => {
    if (filters.categoryId && service.category_id !== filters.categoryId) return false;
    const price = service.starting_price === null || service.starting_price === undefined ? null : Number(service.starting_price);
    if (filters.min !== null && (price === null || price < filters.min)) return false;
    if (filters.max !== null && (price === null || price > filters.max)) return false;
    if (term && !fold(`${service.title} ${service.description ?? ""} ${service.store_name ?? ""} ${service.category_name ?? ""}`).includes(term)) return false;
    return true;
  });
}

export type CatalogEntry<P> = { kind: "product"; item: P } | { kind: "service"; item: CustomService };

/**
 * Junta peças e opções sob encomenda na ordem escolhida no filtro.
 * Preço: as duas entram na mesma ordem (a opção usa o "a partir de"; sem preço,
 * vai para o fim). Enquanto houver mais peças para carregar, só entram as
 * opções que já cabem antes da última peça carregada (as outras aparecem
 * quando as próximas peças chegarem), para a ordem nunca ficar errada.
 * Mais recentes: opções primeiro (a lista delas já vem da mais nova).
 * Mais bem avaliados: opções depois das peças (ainda não têm avaliação).
 */
export function mergeCatalog<P extends { price: number | string }>(
  products: P[], services: CustomService[], sort: string, hasMore: boolean,
): CatalogEntry<P>[] {
  const productEntries = products.map((item) => ({ kind: "product" as const, item }));
  const serviceEntries = services.map((item) => ({ kind: "service" as const, item }));
  if (sort !== "price_asc" && sort !== "price_desc") {
    return sort === "rating" ? [...productEntries, ...serviceEntries] : [...serviceEntries, ...productEntries];
  }
  const ascending = sort === "price_asc";
  const priceOf = (entry: CatalogEntry<P>) => {
    const raw = entry.kind === "product" ? entry.item.price : entry.item.starting_price;
    const value = raw === null || raw === undefined || raw === "" ? NaN : Number(raw);
    return Number.isFinite(value) ? value : null;
  };
  const lastPrice = productEntries.length ? priceOf(productEntries[productEntries.length - 1]) : null;
  const eligible = serviceEntries.filter((entry) => {
    if (!hasMore) return true;
    const price = priceOf(entry);
    if (price === null || lastPrice === null) return false;
    return ascending ? price <= lastPrice : price >= lastPrice;
  });
  return [...productEntries, ...eligible].sort((a, b) => {
    const pa = priceOf(a);
    const pb = priceOf(b);
    if (pa === null && pb === null) return 0;
    if (pa === null) return 1;
    if (pb === null) return -1;
    return ascending ? pa - pb : pb - pa;
  });
}
