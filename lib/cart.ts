import { getSupabase } from "@/lib/supabase";
import { notifyCartChanged } from "@/components/marketplace-state";

export function getCartErrorMessage(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error && "message" in error
        ? String(error.message)
        : "";

  if (/estoque insuficiente|esgotad|conta está suspensa|escolha uma opção/i.test(message)) return message;
  if (/opção não encontrada|opção escolhida/i.test(message))
    return "Essa opção da peça não está mais disponível. Escolha outra.";
  if (/indisponível|não encontrado/i.test(message))
    return "Este produto não está mais disponível.";
  if (/login/i.test(message)) return "Entre na sua conta para usar o carrinho.";
  if (/quantidade inválida/i.test(message))
    return "A quantidade informada não é válida.";
  return "Não foi possível atualizar o carrinho. Tente novamente.";
}

export async function addProductToCart(productId: string, quantity = 1, variantId?: string | null) {
  const { error } = await getSupabase().rpc("add_to_cart", variantId
    ? { p_product_id: productId, p_quantity: quantity, p_variant_id: variantId }
    : { p_product_id: productId, p_quantity: quantity });

  if (error) throw new Error(getCartErrorMessage(error));
  notifyCartChanged();
}
