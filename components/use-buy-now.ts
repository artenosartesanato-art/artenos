"use client";

import { playUiSound } from "@/lib/ui-sound";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { useMarketplace } from "@/components/marketplace-state";
import { getCartErrorMessage } from "@/lib/cart";
import { isSuspended, suspensionMessage } from "@/lib/suspension";
import { getSupabase } from "@/lib/supabase";
import { accessHref } from "@/lib/navigation";
import { BUY_NOW_KEY, BUY_NOW_PATH, serializePendingBuyNow } from "@/lib/buy-now-intent";

/**
 * Compra direta de uma peça (botão "Comprar" do card e "Comprar agora" do
 * modal): só esse item, sem mexer no carrinho. Sem login, guarda a escolha,
 * leva ao login e retoma em /comprar-agora.
 */
export function useBuyNow() {
  const router = useRouter();
  const { authReady, userId, suspendedUntil } = useMarketplace();
  const [pendingId, setPendingId] = useState<string | null>(null);

  /** Só registra a peça (usado também para cotar o frete no modal). */
  const prepare = useCallback(async (productId: string, quantity: number) => {
    if (!authReady) {
      toast.info("Aguarde um instante enquanto verificamos sua conta.");
      return false;
    }
    if (!userId) {
      try { window.sessionStorage.setItem(BUY_NOW_KEY, serializePendingBuyNow(productId, quantity)); } catch { /* sem armazenamento */ }
      router.push(accessHref(BUY_NOW_PATH));
      return false;
    }
    if (isSuspended(suspendedUntil)) {
      toast.error(suspensionMessage(suspendedUntil));
      return false;
    }
    const { error } = await getSupabase().rpc("start_buy_now", { p_product_id: productId, p_quantity: quantity });
    if (error) {
      toast.error(getCartErrorMessage(error));
      return false;
    }
    return true;
  }, [authReady, userId, suspendedUntil, router]);

  const buyNow = useCallback(async (productId: string, quantity = 1, beforeNavigate?: () => void) => {
    setPendingId(productId);
    const ok = await prepare(productId, quantity);
    setPendingId(null);
    if (!ok) return;
    beforeNavigate?.();
    playUiSound("purchase");
    router.push(BUY_NOW_PATH);
  }, [prepare, router]);

  return { buyNow, prepare, pendingId };
}
