// Rótulos e formatos do painel administrativo (sem React; testável no Node).

export type AdminRole = "owner" | "reviewer";
export const ADMIN_ROLE_LABEL: Record<AdminRole, string> = { owner: "Proprietária", reviewer: "Revisora" };

export type SellerStatus = "active" | "suspended" | "in_review" | "rejected";
export const SELLER_STATUS_LABEL: Record<SellerStatus, string> = {
  active: "Ativa",
  suspended: "Suspensa",
  in_review: "Em análise",
  rejected: "Recusada",
};

export const ORDER_STATUS_LABEL: Record<string, string> = {
  payment_confirmed: "Pagamento confirmado",
  preparing: "Em preparação",
  shipped: "A caminho",
  out_for_delivery: "Saiu para entrega",
  delivered: "Entregue",
  delivery_failed: "Problema na entrega",
  cancelled: "Cancelado",
  refunded: "Reembolsado",
};

/** Tom do selo de status (cores de estado + texto; nunca só a cor). */
export function orderTone(status: string): "ok" | "wait" | "alert" | "muted" {
  if (status === "delivered") return "ok";
  if (status === "delivery_failed") return "alert";
  if (status === "cancelled" || status === "refunded") return "muted";
  return "wait";
}

const brlFormat = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const brlShortFormat = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
export const brl = (value: number | string | null | undefined) => brlFormat.format(Number(value ?? 0));
export const brlShort = (value: number | string | null | undefined) => brlShortFormat.format(Number(value ?? 0));

const dateTime = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const dateOnly = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
export function formatDate(value: string | null | undefined, withTime = false) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : (withTime ? dateTime : dateOnly).format(date);
}

/**
 * Variação em relação ao período anterior. null quando não há base (período
 * anterior zerado): mostrar "+100%" ali seria enganoso.
 */
export function change(current: number, previous: number) {
  if (!previous) return null;
  return Math.round(((current - previous) / previous) * 100);
}

/** Endereço de categoria a partir do nome: "Crochê e Tricô" → "croche-e-trico". */
export function slugify(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/&/g, " e ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

export const PAGE_SIZE = 20;
