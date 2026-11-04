// Pronta entrega × sob encomenda × esgotado. A regra vale no banco
// (public.compute_product_availability, migração 20261029_disponibilidade_estoque);
// aqui ela só é espelhada para exibir o estado e limitar a quantidade.

export type Availability = "ready" | "made_to_order" | "sold_out";
export const MAX_ORDER_QUANTITY = 99;

export type AvailabilitySource = {
  availability?: Availability | string | null;
  stock?: number | null;
  ready_to_ship?: boolean | null;
};

export function computeAvailability(stock: number | null | undefined, acceptsCustomOrders: boolean): Availability {
  if ((stock ?? 0) > 0) return "ready";
  return acceptsCustomOrders ? "made_to_order" : "sold_out";
}

const isAvailability = (value: unknown): value is Availability =>
  value === "ready" || value === "made_to_order" || value === "sold_out";

/**
 * Estado de uma peça vinda de qualquer função do banco. Sem a coluna
 * availability (funções antigas), deduz pelo estoque: com unidades é pronta
 * entrega; sem unidades, sob encomenda (é o padrão das lojas).
 */
export function availabilityFor(product: AvailabilitySource): Availability {
  if (isAvailability(product.availability)) return product.availability;
  if ((product.stock ?? 0) > 0) return "ready";
  return "made_to_order";
}

export function maxQuantityFor(product: AvailabilitySource): number {
  const availability = availabilityFor(product);
  if (availability === "ready") return Math.max(0, Math.min(MAX_ORDER_QUANTITY, product.stock ?? 0));
  return availability === "made_to_order" ? MAX_ORDER_QUANTITY : 0;
}

export const AVAILABILITY_LABEL: Record<Availability, string> = {
  ready: "Pronta entrega",
  made_to_order: "Sob encomenda",
  sold_out: "Esgotado",
};

export function productionLabel(availability: Availability, days: number | null | undefined) {
  if (availability === "ready") return "Pronta para postagem";
  if (availability === "sold_out") return null;
  if (days == null) return "Produzida depois do pedido";
  if (days === 0) return "Produzida e postada em até 1 dia útil";
  return `Produzida em até ${days} ${days === 1 ? "dia útil" : "dias"} antes da postagem`;
}
