"use client";

// Fotos e variações das peças na vitrine, com cache por peça. Os cards
// perguntam em lote (uma chamada para a grade inteira) se a peça tem opções,
// para "Comprar" e o carrinho abrirem o detalhe e pedirem a escolha.
import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import type { ProductOptions } from "@/lib/product-variations";

export type OptionsFlag = { variationNames: string[]; minPrice: number; maxPrice: number };

const optionsCache = new Map<string, Promise<ProductOptions | null>>();
const flagCache = new Map<string, OptionsFlag | null>();
const flagListeners = new Set<() => void>();
let queue = new Set<string>();
let timer: ReturnType<typeof setTimeout> | null = null;

/** Fotos e opções de uma peça publicada (null sem a migração ou se indisponível). */
export function fetchProductOptions(productId: string, fresh = false): Promise<ProductOptions | null> {
  if (fresh) optionsCache.delete(productId);
  let pending = optionsCache.get(productId);
  if (!pending) {
    pending = Promise.resolve(getSupabase().rpc("get_product_options", { p_product_id: productId })).then(({ data, error }) => {
      if (error || !data) return null;
      const options = data as ProductOptions;
      return {
        images: options.images ?? [],
        variation_names: options.variation_names ?? [],
        variants: (options.variants ?? []).map((variant) => ({ ...variant, price: Number(variant.price), stock: Number(variant.stock) })),
      };
    }).catch(() => null);
    optionsCache.set(productId, pending);
    // Estoque muda: não guarda por muito tempo.
    setTimeout(() => { if (optionsCache.get(productId) === pending) optionsCache.delete(productId); }, 60_000);
  }
  return pending;
}

function flush() {
  timer = null;
  const ids = Array.from(queue).filter((id) => !flagCache.has(id));
  queue = new Set();
  if (!ids.length) return;
  for (const id of ids) flagCache.set(id, null);
  void Promise.resolve(getSupabase().rpc("list_products_with_options", { p_ids: ids.slice(0, 200) })).then(({ data, error }) => {
    if (error || !Array.isArray(data)) return;
    for (const row of data as Array<{ product_id: string; variation_names: string[]; min_price: number; max_price: number }>) {
      flagCache.set(row.product_id, { variationNames: row.variation_names ?? [], minPrice: Number(row.min_price), maxPrice: Number(row.max_price) });
    }
    flagListeners.forEach((listener) => listener());
  }).catch(() => null);
}

/** A peça tem variações? (null enquanto não se sabe ou quando não tem). */
export function useProductOptionsFlag(productId: string): OptionsFlag | null {
  const [, setVersion] = useState(0);
  useEffect(() => {
    const listener = () => setVersion((value) => value + 1);
    flagListeners.add(listener);
    if (!flagCache.has(productId)) {
      queue.add(productId);
      if (!timer) timer = setTimeout(flush, 30);
    }
    return () => { flagListeners.delete(listener); };
  }, [productId]);
  return flagCache.get(productId) ?? null;
}
