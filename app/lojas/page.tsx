import { createClient } from "@supabase/supabase-js";
import { ShopsDirectory, type Shop } from "@/components/shops-directory";

// Lista pública de lojas pronta no servidor, regenerada a cada minuto.
export const revalidate = 60;

async function loadShops(): Promise<Shop[] | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  try {
    const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await supabase.rpc("list_storefront_shops", { p_limit: 100 });
    return error ? null : (data ?? []) as Shop[];
  } catch {
    return null;
  }
}

export default async function Page() {
  return <ShopsDirectory initial={await loadShops()} />;
}
