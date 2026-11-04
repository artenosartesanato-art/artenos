"use client";

import { useEffect, useSyncExternalStore } from "react";
import { getSupabase } from "@/lib/supabase";
import { customOrderStage, STAGE_LABEL } from "@/lib/production-status";

// Encomendas em andamento de quem está logado, carregadas uma vez por conta e
// compartilhadas por todos os cards (selo de status no lugar de "Sob encomenda").
type Entry = { production_status: string | null; order_status: string };
let loadedFor: string | null = null;
let byProduct = new Map<string, Entry>();
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

async function load(userId: string) {
  loadedFor = userId;
  try {
    const { data, error } = await getSupabase().rpc("list_my_open_custom_orders");
    if (error || loadedFor !== userId) return;
    byProduct = new Map(((data ?? []) as (Entry & { product_id: string })[]).map((row) => [row.product_id, row]));
    emit();
  } catch {
    // Sem a migração 20261029_status_encomenda o card mantém o selo normal.
  }
}

export function useMyCustomOrderLabel(productId: string, userId: string | null): string | null {
  useEffect(() => {
    if (!userId) {
      if (loadedFor !== null) { loadedFor = null; byProduct = new Map(); emit(); }
      return;
    }
    if (loadedFor !== userId) void load(userId);
  }, [userId]);
  const entry = useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    () => byProduct.get(productId),
    () => undefined,
  );
  return entry ? `Sua encomenda: ${STAGE_LABEL[customOrderStage(entry.production_status, entry.order_status)]}` : null;
}
