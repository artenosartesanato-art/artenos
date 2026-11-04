import { NextResponse } from "next/server";
import { getSupabaseAdmin, getUserFromRequest } from "@/lib/supabase-admin";
import { findPaymentByReference, getPayment, mpRequest, type MpPayment } from "@/lib/mercadopago";
import { reconcilePayment } from "@/lib/payments";
import { sameOrigin } from "@/lib/request-guard";

export const runtime = "nodejs";
export async function POST(request: Request) {
  // Só aceita chamadas da própria página (proteção contra CSRF).
  if (!sameOrigin(request)) return NextResponse.json({ error: "Origem não permitida." }, { status: 403 });
  try {
    const user = await getUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Faça login." }, { status: 401 });
    const { checkoutId } = await request.json();
    if (typeof checkoutId !== "string" || !/^[0-9a-f-]{36}$/i.test(checkoutId))
      return NextResponse.json({ error: "Compra inválida." }, { status: 400 });
    const admin = getSupabaseAdmin();
    const { data: checkout } = await admin.from("checkouts").select("*").eq("id", checkoutId).single();
    if (!checkout || checkout.client_id !== user.id)
      return NextResponse.json({ error: "Compra não encontrada." }, { status: 404 });
    if (checkout.status === "cancelled") return NextResponse.json({ cancelled: true });
    if (!["pending", "awaiting_payment"].includes(checkout.status))
      return NextResponse.json({ error: "Compra já paga. Cancelamento exige atendimento." }, { status: 409 });

    if (checkout.payment_started_at) {
      const payment = checkout.mp_payment_id
        ? await getPayment(checkout.mp_payment_id)
        : await findPaymentByReference(checkout.id);
      if (!payment) {
        return NextResponse.json({ error: "O resultado da cobrança ainda é incerto. Atualize o status ou tente novamente o mesmo pagamento; não liberaremos o estoque antes da confirmação." }, { status: 409 });
      }
      if (payment.status === "approved") {
        await reconcilePayment(payment);
        return NextResponse.json({ error: "Pagamento já aprovado. Acesse seus pedidos." }, { status: 409 });
      }
      const cancelled = payment.status === "cancelled" || payment.status === "rejected"
        ? payment
        : await mpRequest<MpPayment>(`/v1/payments/${encodeURIComponent(String(payment.id))}`, {
          method: "PUT", body: { status: "cancelled" },
        });
      await reconcilePayment(cancelled);
      if (!["cancelled", "rejected"].includes(cancelled.status))
        return NextResponse.json({ error: "Cancelamento ainda não confirmado." }, { status: 409 });
    }
    // RPC revalida sob lock: não cancela se outra aba acabou de iniciar pagamento.
    const { error } = await admin.rpc("cancel_reserved_checkout", { p_checkout_id: checkoutId });
    if (error) throw error;
    return NextResponse.json({ cancelled: true });
  } catch {
    return NextResponse.json({ error: "Não foi possível confirmar o cancelamento. Atualize o status antes de tentar novamente." }, { status: 409 });
  }
}
