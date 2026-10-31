import 'server-only';
import { getSupabaseAdmin } from './supabase-admin';
import { emailConfigured, escapeHtml, sendEmail } from './email';

// Pede avaliação de pedidos entregues há 3+ dias (uma vez por pedido): aviso no
// sininho e e-mail. Usado pela tarefa diária de manutenção e por /api/cron/avaliacoes.
export async function sendReviewReminders(limit = 50) {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.rpc('claim_review_reminders', { p_limit: limit });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as { order_id: string; client_email: string | null; client_name: string; store_name: string; product_name: string | null }[];
  const site = (process.env.NEXT_PUBLIC_SITE_URL ?? '').replace(/\/$/, '');
  let emailed = 0;
  for (const row of rows) {
    await admin.rpc('notify_review_reminder', { p_order_id: row.order_id });
    if (!row.client_email || !emailConfigured()) continue;
    const link = `${site}/pedidos?avaliar=${row.order_id}`;
    const firstName = row.client_name.trim().split(/\s+/)[0] ?? '';
    try {
      await sendEmail({
        to: row.client_email,
        subject: 'Como foi sua compra na Artenós?',
        html:
          `<p>Olá, ${escapeHtml(firstName)}!</p>` +
          `<p>Seu pedido de <strong>${escapeHtml(row.product_name ?? 'peças artesanais')}</strong> da loja ` +
          `<strong>${escapeHtml(row.store_name)}</strong> foi entregue. Conte como foi: sua avaliação ajuda a loja e outras pessoas.</p>` +
          `<p><a href="${escapeHtml(link)}">Avaliar a compra</a></p>` +
          `<p>Leva menos de um minuto. Se preferir não avaliar, é só ignorar este e-mail.</p>`,
      });
      emailed += 1;
    } catch (mailError) {
      console.error('[avaliacoes] e-mail não enviado:', mailError);
    }
  }
  return { reminded: rows.length, emailed };
}
