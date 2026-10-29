import type { SupabaseClient } from "@supabase/supabase-js";

export type OrderItemDetails = {
  made_to_order?: boolean;
  customer_notes?: string | null;
  product_summary?: string | null;
  production_status?: string | null;
  order_status?: string | null;
};

type DetailRow = OrderItemDetails & { order_id: string; item_id: string; product_id: string | null };
type OrderLike<I> = { id: string; items: I[] };

/**
 * Completa os itens de list_my_orders com encomenda, resumo e observações
 * (list_order_item_details). Sem a migração, devolve os pedidos como estão.
 */
export async function withOrderItemDetails<I extends { id: string; product_id: string | null }, O extends OrderLike<I>>(
  supabase: SupabaseClient, orders: O[],
): Promise<O[]> {
  if (!orders.length) return orders;
  try {
    const { data, error } = await supabase.rpc("list_order_item_details", { p_order_ids: orders.map((order) => order.id).slice(0, 200) });
    if (error || !Array.isArray(data)) return orders;
    const rows = data as DetailRow[];
    return orders.map((order) => ({
      ...order,
      items: order.items.map((item) => {
        const row = rows.find((candidate) => candidate.order_id === order.id &&
          (candidate.item_id === item.id || (item.product_id && candidate.product_id === item.product_id)));
        return row ? {
          ...item, made_to_order: row.made_to_order, customer_notes: row.customer_notes, product_summary: row.product_summary,
          production_status: row.production_status ?? null, order_status: row.order_status ?? null,
        } : item;
      }),
    }));
  } catch {
    return orders;
  }
}
