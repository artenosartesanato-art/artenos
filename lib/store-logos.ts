import { getSupabase } from "@/lib/supabase";

// Foto de perfil das lojas. Vários avatares na mesma tela viram UMA chamada
// (as pedidas no mesmo instante são juntadas) e o resultado fica em memória.

export const STORE_ASSETS_BUCKET = "artenos-store-assets";

const cache = new Map<string, string | null>();
const waiting = new Map<string, ((url: string | null) => void)[]>();
let scheduled = false;

export function storeAssetUrl(path: string | null | undefined) {
  if (!path) return null;
  return getSupabase().storage.from(STORE_ASSETS_BUCKET).getPublicUrl(path).data.publicUrl;
}

/** Já conhecida (ou null); undefined quando ainda não foi buscada. */
export function cachedStoreLogo(artisanId: string) {
  return cache.get(artisanId);
}

/** Atualiza a foto em memória (depois de trocar/remover na Minha loja). */
export function rememberStoreLogo(artisanId: string, path: string | null) {
  cache.set(artisanId, storeAssetUrl(path));
}

async function flush() {
  scheduled = false;
  const ids = [...waiting.keys()];
  const callbacks = new Map(waiting);
  waiting.clear();
  const found = new Map<string, string | null>();
  for (let start = 0; start < ids.length; start += 100) {
    const chunk = ids.slice(start, start + 100);
    try {
      const { data, error } = await getSupabase().rpc("list_store_logos", { p_artisan_ids: chunk });
      // Sem a função no banco (migração não rodada): fica com as iniciais.
      if (!error) for (const row of (data ?? []) as { artisan_id: string; logo_path: string | null }[])
        found.set(row.artisan_id, storeAssetUrl(row.logo_path));
    } catch { /* fica com as iniciais */ }
  }
  for (const id of ids) {
    const url = found.get(id) ?? null;
    cache.set(id, url);
    for (const resolve of callbacks.get(id) ?? []) resolve(url);
  }
}

export function loadStoreLogo(artisanId: string): Promise<string | null> {
  if (cache.has(artisanId)) return Promise.resolve(cache.get(artisanId) ?? null);
  return new Promise((resolve) => {
    waiting.set(artisanId, [...(waiting.get(artisanId) ?? []), resolve]);
    if (!scheduled) {
      scheduled = true;
      setTimeout(() => void flush(), 0);
    }
  });
}
