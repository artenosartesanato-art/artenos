import 'server-only';
import { getSupabaseAdmin } from './supabase-admin';
import { emailConfigured, escapeHtml, sendEmail } from './email';

const brl = (value: number | string) =>
  Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function methodLabel(method: string | null) {
  if (method === 'bank_transfer' || method === 'pix') return 'Pix';
  if (method === 'credit_card') return 'Cartão de crédito';
  if (method === 'debit_card') return 'Cartão de débito';
  return method ?? 'Não informado';
}

// Envia o comprovante por e-mail uma única vez por compra (via lib/email.ts:
// SMTP do Gmail ou Resend, conforme as variáveis configuradas).
export async function sendReceiptEmail(checkoutId: string): Promise<'sent' | 'skipped'> {
  const admin = getSupabaseAdmin();

  // "Reserva" o envio: só quem conseguir preencher receipt_sent_at envia (evita e-mail duplicado
  // quando o webhook e a tela de pagamento confirmam ao mesmo tempo).
  const { data: claimed, error: claimError } = await admin
    .from('checkouts')
    .update({ receipt_sent_at: new Date().toISOString() })
    .eq('id', checkoutId)
    .eq('status', 'approved')
    .is('receipt_sent_at', null)
    .select('id, client_id, total_amount, payment_method, paid_at, mp_payment_id, shipping_snapshot')
    .maybeSingle();

  if (claimError) throw new Error(claimError.message);
  if (!claimed) return 'skipped';

  try {
    if (!emailConfigured()) throw new Error('E-mail não configurado: o comprovante não foi enviado.');

    const { data: items, error: itemsError } = await admin
      .from('checkout_items')
      .select('product_name, unit_price, quantity, line_total')
      .eq('checkout_id', checkoutId);
    if (itemsError) throw new Error(itemsError.message);

    const { data: userData, error: userError } = await admin.auth.admin.getUserById(claimed.client_id);
    const to = userData?.user?.email;
    if (userError || !to) throw new Error('E-mail do cliente não encontrado.');

    const paidAt = claimed.paid_at
      ? new Date(claimed.paid_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
      : '';

    const rows = (items ?? [])
      .map(
        (item) =>
          `<tr><td>${escapeHtml(String(item.product_name))}</td><td align="center">${item.quantity}</td>` +
          `<td align="right">${brl(item.unit_price)}</td><td align="right">${brl(item.line_total)}</td></tr>`
      )
      .join('');
    const shippingRows = (Array.isArray(claimed.shipping_snapshot) ? claimed.shipping_snapshot : [])
      .map((quote: { company_name?: string; service_name?: string; price?: number }) =>
        `<tr><td>${escapeHtml(`Frete · ${quote.company_name ?? 'Transportadora'} / ${quote.service_name ?? 'Entrega'}`)}</td>` +
        `<td align="center">1</td><td align="right">${brl(quote.price ?? 0)}</td>` +
        `<td align="right">${brl(quote.price ?? 0)}</td></tr>`)
      .join('');

    const html =
      `<h2>Comprovante de pagamento — Artenós</h2>` +
      `<p>Pedido: <strong>${claimed.id}</strong><br>` +
      `Data: ${paidAt}<br>` +
      `Forma de pagamento: ${methodLabel(claimed.payment_method)}<br>` +
      `Código do pagamento: ${escapeHtml(String(claimed.mp_payment_id ?? ''))}</p>` +
      `<table width="100%" cellpadding="6" cellspacing="0" border="1">` +
      `<tr><th align="left">Produto / frete</th><th>Qtd</th><th align="right">Unitário</th><th align="right">Total</th></tr>${rows}${shippingRows}</table>` +
      `<p><strong>Total pago: ${brl(claimed.total_amount)}</strong></p>` +
      `<p>Você já pode conversar com a artesã sobre o pedido pela área de mensagens do Artenós.</p>`;

    await sendEmail({
      to,
      subject: `Comprovante do seu pedido no Artenós (${brl(claimed.total_amount)})`,
      html,
    });

    return 'sent';
  } catch (error) {
    // Libera a reserva para uma nova tentativa (próxima confirmação do pagamento).
    await admin.from('checkouts').update({ receipt_sent_at: null }).eq('id', checkoutId);
    throw error;
  }
}
