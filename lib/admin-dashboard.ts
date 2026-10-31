// Números da visão geral do painel. A função do banco devolve um objeto; se
// vier em lista, com campos faltando (versão antiga da função) ou vazio, a tela
// não pode quebrar: os campos ausentes viram zero / lista vazia.
// Sem dependências (testável no Node).

export type Dashboard = {
  period_days: number;
  since: string;
  sales: { orders: number; gmv: number; products_amount: number; shipping_amount: number; platform_fee: number; buyers: number; sellers: number };
  sales_previous: { orders: number; gmv: number; platform_fee: number };
  cancelled: number;
  orders_by_status: { status: string; total: number }[];
  daily: { day: string; orders: number; gmv: number }[];
  top_sellers: { artisan_id: string; store_name: string; orders: number; gmv: number }[];
  top_categories: { name: string; units: number; amount: number }[];
  sellers: { active: number; in_review: number; new: number };
  applications: { waiting: number; suspended: number };
  clients: { total: number; new: number };
  products: { active: number; out_of_stock: number; new: number; shops_with_products: number };
  payouts: { pending_amount: number; pending_count: number; failed_count: number; paid_amount: number };
  to_ship: number;
  delivery_problems: number;
  messages: number;
  custom_orders: number;
};

type Raw = Record<string, unknown>;
const obj = (value: unknown): Raw => (value && typeof value === "object" && !Array.isArray(value) ? value as Raw : {});
const num = (value: unknown) => { const n = Number(value); return Number.isFinite(n) ? n : 0; };
const list = <T,>(value: unknown): T[] => (Array.isArray(value) ? value as T[] : []);
const numbers = <K extends string>(value: unknown, keys: readonly K[]) => {
  const source = obj(value);
  return Object.fromEntries(keys.map((key) => [key, num(source[key])])) as Record<K, number>;
};

/** null quando não há nada aproveitável (a tela mostra o aviso com "Tentar novamente"). */
export function normalizeDashboard(raw: unknown): Dashboard | null {
  const data = obj(Array.isArray(raw) ? raw[0] : raw);
  if (!Object.keys(data).length) return null;
  return {
    period_days: num(data.period_days),
    since: typeof data.since === "string" ? data.since : "",
    sales: numbers(data.sales, ["orders", "gmv", "products_amount", "shipping_amount", "platform_fee", "buyers", "sellers"] as const),
    sales_previous: numbers(data.sales_previous, ["orders", "gmv", "platform_fee"] as const),
    cancelled: num(data.cancelled),
    orders_by_status: list(data.orders_by_status),
    daily: list(data.daily),
    top_sellers: list(data.top_sellers),
    top_categories: list(data.top_categories),
    sellers: numbers(data.sellers, ["active", "in_review", "new"] as const),
    applications: numbers(data.applications, ["waiting", "suspended"] as const),
    clients: numbers(data.clients, ["total", "new"] as const),
    products: numbers(data.products, ["active", "out_of_stock", "new", "shops_with_products"] as const),
    payouts: numbers(data.payouts, ["pending_amount", "pending_count", "failed_count", "paid_amount"] as const),
    to_ship: num(data.to_ship),
    delivery_problems: num(data.delivery_problems),
    messages: num(data.messages),
    custom_orders: num(data.custom_orders),
  };
}
