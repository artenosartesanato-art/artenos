import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../../lib/supabase-admin';
import { emailConfigured, escapeHtml, sendEmail } from '../../../../lib/email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Pede avaliação de pedidos entregues há 3+ dias (uma vez por pedido): aviso no
// sininho e e-mail. Rode uma vez por dia por um agendador (ex.: Vercel Cron).
// Proteção: Authorization: Bearer <CRON_SECRET>.
async function handle(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  try {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin.rpc('claim_review_reminders', { p_limit: 50 });
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
    return NextResponse.json({ reminded: rows.length, emailed });
  } catch (error) {
    console.error('[avaliacoes] erro:', error);
    return NextResponse.json({ error: 'Falha ao enviar lembretes.' }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
