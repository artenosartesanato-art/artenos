import type { Metadata } from "next";
import { cache } from "react";
import { createClient } from "@supabase/supabase-js";
import type { MarketplaceProduct } from "@/components/marketplace-product-card";
import { PublicStorePage, type PublicStore, type PublicStoreInitial } from "@/components/public-store";

type Props = { searchParams: Promise<{ id?: string | string[] }> };

// A loja chega pronta do servidor (capa e peças no HTML). Se o Supabase não
// responder, o navegador busca como antes.
// cache(): título (generateMetadata) e página usam a mesma busca.
const loadStore = cache(async (id: string): Promise<PublicStoreInitial | null> => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  try {
    const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const [storeResponse, productResponse] = await Promise.all([
      supabase.rpc("get_public_artisan_store", { p_artisan_id: id }),
      supabase.rpc("list_public_artisan_products", { p_artisan_id: id, p_limit: 48, p_offset: 0 }),
    ]);
    if (storeResponse.error || productResponse.error) return null;
    const store = (Array.isArray(storeResponse.data) ? storeResponse.data[0] : storeResponse.data) as PublicStore | undefined;
    if (!store) return null;
    return { id, store, products: (productResponse.data ?? []) as MarketplaceProduct[] };
  } catch {
    return null;
  }
});

const idFrom = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? "";

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const initial = await loadStore(idFrom((await searchParams).id));
  if (!initial?.store) return { title: "Loja | Artenós" };
  return {
    title: `${initial.store.store_name} | Artenós`,
    description: initial.store.specialty ?? "Loja artesanal na Artenós.",
  };
}

export default async function Page({ searchParams }: Props) {
  return <PublicStorePage initial={await loadStore(idFrom((await searchParams).id))} />;
}
