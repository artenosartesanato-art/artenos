// Atalhos "Escolha pelo orçamento": faixas fixas, contagem sempre real
// (browse_storefront_products devolve o total em cada linha).
import type { SupabaseClient } from "@supabase/supabase-js";

export type Budget = { key: string; label: string; hint: string; min: number | null; max: number | null; count: number };

export const BUDGETS: Omit<Budget, "count">[] = [
  { key: "ate-50", label: "Até R$ 50", hint: "Lembranças e mimos", min: null, max: 50 },
  { key: "50-100", label: "R$ 50 a R$ 100", hint: "Presentes do dia a dia", min: 50, max: 100 },
  { key: "100-200", label: "R$ 100 a R$ 200", hint: "Peças para marcar a data", min: 100, max: 200 },
  { key: "200", label: "Acima de R$ 200", hint: "Trabalhos de fôlego", min: 200, max: null },
];

export function budgetHref({ min, max }: { min: number | null; max: number | null }) {
  const params = new URLSearchParams();
  if (min !== null) params.set("min", String(min));
  if (max !== null) params.set("max", String(max));
  return `/categorias?${params}`;
}

/** null se alguma consulta falhar (a seção simplesmente não aparece). */
export async function loadBudgets(supabase: SupabaseClient): Promise<Budget[] | null> {
  const responses = await Promise.all(BUDGETS.map((budget) => supabase.rpc("browse_storefront_products", {
    p_query: null, p_category_id: null, p_min_price: budget.min, p_max_price: budget.max,
    p_ready_only: false, p_sort: "newest", p_limit: 1, p_offset: 0,
  })));
  if (responses.some((response) => response.error)) return null;
  return BUDGETS.map((budget, index) => ({
    ...budget,
    count: Number((responses[index].data as { total_count?: number }[] | null)?.[0]?.total_count ?? 0),
  }));
}
