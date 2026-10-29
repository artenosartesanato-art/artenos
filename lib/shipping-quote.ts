import { getSupabase } from "@/lib/supabase";
import type { ShippingGroup } from "@/lib/cart-groups";

/**
 * Chama a Edge Function calculate-shipping. mode "buy_now" cota só a peça do
 * "Comprar agora"; "cart", o carrinho inteiro. Lança Error com mensagem pronta.
 */
export async function requestShippingQuotes(destinationCep: string, mode: "cart" | "buy_now" = "cart"): Promise<ShippingGroup[]> {
  try {
    const body = mode === "buy_now" ? { destinationCep, mode } : { destinationCep };
    const { data: result, error } = await getSupabase().functions.invoke("calculate-shipping", { body });
    const payload = (result ?? {}) as { groups?: ShippingGroup[]; error?: string };
    if (error || payload.error) {
      let message = payload.error || error?.message;
      if (error && "context" in error && error.context instanceof Response) {
        const details = (await error.context.clone().json().catch(() => null)) as { error?: string } | null;
        message = details?.error || message;
      }
      throw new Error(message || "Não foi possível calcular o frete.");
    }
    return payload.groups ?? [];
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    throw new Error(/fetch|network|edge function|non-2xx/i.test(message) || !message
      ? "Não foi possível consultar as transportadoras agora."
      : message);
  }
}
