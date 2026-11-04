import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Categorias com o contador de itens da vitrine (peças + opções sob encomenda).
 * Usa list_storefront_categories_with_counts; se o script 20261103 ainda não
 * rodou no banco, cai na função antiga (só peças) para o site não quebrar.
 */
export async function fetchStorefrontCategories(supabase: SupabaseClient) {
  const counted = await supabase.rpc("list_storefront_categories_with_counts");
  if (!counted.error) return counted;
  return supabase.rpc("list_storefront_categories_with_products");
}
