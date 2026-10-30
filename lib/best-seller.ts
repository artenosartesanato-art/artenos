import type { SupabaseClient } from "@supabase/supabase-js";
import type { MarketplaceProduct } from "@/components/marketplace-product-card";

export type BestSeller = MarketplaceProduct & { units_sold?: number | null };

/**
 * Mais vendida de cada categoria (carrossel do topo). É um extra: sem vendas
 * ou sem a função no banco, volta vazio e o topo usa as fotos de sempre.
 * Se só a função antiga existir, usa a mais vendida geral.
 */
export async function loadBestSellers(supabase: SupabaseClient): Promise<BestSeller[]> {
  try {
    const { data, error } = await supabase.rpc("list_storefront_best_sellers_by_category", { p_limit: 8 });
    if (!error) return ((data ?? []) as BestSeller[]).filter((product) => product.image_url);
    const single = await supabase.rpc("get_storefront_best_seller");
    if (single.error) return [];
    const row = (Array.isArray(single.data) ? single.data[0] : single.data) as BestSeller | undefined;
    return row?.image_url ? [row] : [];
  } catch {
    return [];
  }
}
