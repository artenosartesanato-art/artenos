import type { SupabaseClient } from "@supabase/supabase-js";
import type { MarketplaceProduct } from "@/components/marketplace-product-card";

/** Peça mais vendida (destaque do topo). É um extra: sem vendas ou sem a função no banco, fica null. */
export async function loadBestSeller(supabase: SupabaseClient): Promise<MarketplaceProduct | null> {
  try {
    const { data, error } = await supabase.rpc("get_storefront_best_seller");
    if (error) return null;
    return ((Array.isArray(data) ? data[0] : data) as MarketplaceProduct | undefined) ?? null;
  } catch {
    return null;
  }
}
