// Status de um item sob encomenda: as três primeiras etapas são do item (a
// loja muda em Vendas); envio e entrega vêm do status do pedido.

export type ProductionStatus = "awaiting_confirmation" | "in_production" | "ready_to_ship";
export type CustomOrderStage = ProductionStatus | "shipped" | "delivered" | "cancelled";

export const PRODUCTION_STEPS: ProductionStatus[] = ["awaiting_confirmation", "in_production", "ready_to_ship"];

export const STAGE_LABEL: Record<CustomOrderStage, string> = {
  awaiting_confirmation: "Aguardando confirmação da loja",
  in_production: "Em produção",
  ready_to_ship: "Pronto para envio",
  shipped: "Enviado",
  delivered: "Entregue",
  cancelled: "Cancelado",
};

/** Etapa exibida a partir do status do item e do pedido. */
export function customOrderStage(production: string | null | undefined, orderStatus: string | null | undefined): CustomOrderStage {
  if (orderStatus === "cancelled" || orderStatus === "refunded") return "cancelled";
  if (orderStatus === "delivered") return "delivered";
  if (orderStatus === "shipped" || orderStatus === "out_for_delivery" || orderStatus === "delivery_failed") return "shipped";
  if (production === "in_production" || production === "ready_to_ship") return production;
  return "awaiting_confirmation";
}

/** Próxima etapa que a loja pode marcar (null quando já está pronto). */
export function nextProductionStep(production: string | null | undefined): ProductionStatus | null {
  const index = PRODUCTION_STEPS.indexOf((production ?? "awaiting_confirmation") as ProductionStatus);
  return index >= 0 && index < PRODUCTION_STEPS.length - 1 ? PRODUCTION_STEPS[index + 1] : null;
}
