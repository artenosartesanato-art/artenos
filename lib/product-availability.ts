import type { SupabaseClient } from "@supabase/supabase-js";
import type { Availability } from "@/lib/availability";

type WithId = {
  id: string; availability?: Availability | null; stock?: number | null;
  rating_avg?: number | string | null; rating_count?: number | null;
};

/**
 * Completa availability nas listas que vêm de funções do banco sem essa
 * coluna (ex.: favoritos). Se a migração ainda não rodou, devolve a lista
 * como está e o front deduz pelo estoque.
 */
export async function withAvailability<T extends WithId>(supabase: SupabaseClient, products: T[]): Promise<T[]> {
  const missing = products.filter((product) => !product.availability || product.rating_count === undefined).map((product) => product.id);
  if (!missing.length) return products;
  try {
    const { data, error } = await supabase.rpc("get_products_availability", { p_ids: missing.slice(0, 200) });
    if (error || !Array.isArray(data)) return products;
    type Row = { id: string; availability: Availability; stock: number; rating_avg?: number | null; rating_count?: number | null };
    const byId = new Map((data as Row[]).map((row) => [row.id, row]));
    return products.map((product) => {
      const row = byId.get(product.id);
      return row ? {
        ...product, availability: row.availability, stock: row.stock,
        rating_avg: product.rating_avg ?? row.rating_avg ?? null, rating_count: product.rating_count ?? row.rating_count ?? 0,
      } : product;
    });
  } catch {
    return products;
  }
}
