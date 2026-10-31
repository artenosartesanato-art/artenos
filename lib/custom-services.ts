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
