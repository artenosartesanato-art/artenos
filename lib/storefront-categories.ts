"use client";

import { useEffect, useSyncExternalStore } from "react";
import { getSupabase } from "@/lib/supabase";

// Categorias da vitrine (com contagem de peças): uma única fonte, buscada uma
// vez por visita e compartilhada pelo menu do cabeçalho e pela listagem.
import type { StorefrontCategory } from "@/lib/category-utils";
export type { StorefrontCategory } from "@/lib/category-utils";

let cache: StorefrontCategory[] | null = null;
let pending: Promise<StorefrontCategory[]> | null = null;
let failed = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

/** Categorias que já vieram do servidor (ex.: app/categorias/page.tsx). */
export function primeStorefrontCategories(list: StorefrontCategory[]) {
  // Chamado durante a renderização: só guarda (quem assinar depois já lê o valor).
  if (cache || !list.length) return;
  cache = list;
}

export function loadStorefrontCategories(): Promise<StorefrontCategory[]> {
  if (cache) return Promise.resolve(cache);
  pending ??= Promise.resolve(getSupabase().rpc("list_storefront_categories_with_products"))
    .then(({ data, error }) => {
      if (error) throw error;
      cache = (data ?? []) as StorefrontCategory[];
      failed = false;
      emit();
      return cache;
    })
    .catch((error) => {
      failed = true;
      pending = null;
      emit();
      throw error;
    });
  return pending;
}

const snapshot = () => cache;
export function useStorefrontCategories(autoLoad = true) {
  useEffect(() => { if (autoLoad && !cache) void loadStorefrontCategories().catch(() => null); }, [autoLoad]);
  const categories = useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    snapshot, () => null,
  );
  return { categories, failed: failed && !categories, retry: () => void loadStorefrontCategories().catch(() => null) };
}

export { categoryHref, findCategory, isCategoryRef, topCategories } from "@/lib/category-utils";
