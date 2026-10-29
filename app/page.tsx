import { createClient } from "@supabase/supabase-js";
import { StorefrontHome, type HomeData } from "@/components/storefront-home";
import { loadBestSeller } from "@/lib/best-seller";
import { loadBudgets } from "@/lib/budgets";

// A vitrine é pública: o servidor busca os dados e entrega a página pronta
// (as fotos aparecem no HTML, sem esperar o JavaScript). Regenerada a cada
// minuto; se o Supabase não responder, o navegador busca como antes.
export const revalidate = 60;

async function loadHome(): Promise<HomeData | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  try {
    const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const [responses, budgets, bestSeller] = await Promise.all([Promise.all([
      supabase.from("storefront_categories").select("id,name,slug,image_url").order("sort_order"),
      supabase.from("storefront_collections").select("id,title,description,image_url").order("sort_order"),
      supabase.from("storefront_banners").select("id,title,subtitle,image_url,collection_id").order("sort_order"),
      supabase.rpc("list_storefront_shops", { p_limit: 8 }),
      supabase.rpc("search_storefront_products", { p_section: "featured", p_limit: 8 }),
      supabase.rpc("search_storefront_products", { p_section: "ready", p_limit: 8 }),
      supabase.rpc("search_storefront_products", { p_section: "new", p_limit: 8 }),
    ]), loadBudgets(supabase), loadBestSeller(supabase)]);
    if (responses.some((response) => response.error)) return null;
    const [categories, collections, banners, shops, featured, ready, latest] = responses.map((response) => response.data ?? []);
    return { categories, collections, banners, shops, featured, ready, latest, budgets, bestSeller } as HomeData;
  } catch {
    return null;
  }
}

export default async function Page() {
  return <StorefrontHome initial={await loadHome()} />;
}
