// Etapas visuais do pedido para o comprador. Pedidos cancelados ou
// reembolsados não têm barra de progresso: o selo de status basta.
export type OrderProgressStatus =
  | "payment_confirmed" | "preparing" | "shipped" | "out_for_delivery"
  | "delivered" | "delivery_failed" | "cancelled" | "refunded";

const STEPS = [{ label: "Pago" }, { label: "Em preparação" }, { label: "Enviado" }, { label: "Entregue" }];

const CURRENT: Partial<Record<OrderProgressStatus, number>> = {
  payment_confirmed: 0,
  preparing: 1,
  shipped: 2,
  out_for_delivery: 2,
  delivery_failed: 2,
  delivered: 3,
};

export function orderProgress(status: OrderProgressStatus) {
  const current = CURRENT[status];
  if (current === undefined) return { steps: [] as typeof STEPS, current: -1 };
  // Entregue: todas as etapas concluídas.
  return { steps: STEPS, current: status === "delivered" ? STEPS.length : current };
}
