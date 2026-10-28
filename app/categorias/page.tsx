import { createClient } from "@supabase/supabase-js";
import { CategoriesBrowser, PAGE_SIZE, type CategoriesInitial } from "@/components/categories-browser";

// Primeira página do catálogo (sem filtros) vem pronta do servidor e é
// regenerada a cada minuto. Com filtros na URL, o navegador busca como antes.
export const revalidate = 60;

async function loadInitial(): Promise<CategoriesInitial | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  try {
    const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const [categories, products] = await Promise.all([
      supabase.rpc("list_storefront_categories_with_products"),
      supabase.rpc("browse_storefront_products", {
        p_query: null, p_category_id: null, p_min_price: null, p_max_price: null,
        p_ready_only: false, p_sort: "newest", p_limit: PAGE_SIZE, p_offset: 0,
      }),
    ]);
    if (categories.error || products.error) return null;
    return { categories: categories.data ?? [], products: products.data ?? [] } as CategoriesInitial;
  } catch {
    return null;
  }
}

export default async function Page() {
  return <CategoriesBrowser initial={await loadInitial()} />;
}
