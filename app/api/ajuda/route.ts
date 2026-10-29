import { NextResponse } from 'next/server';
import { getSupabaseAdmin, getUserFromRequest } from '../../../lib/supabase-admin';
import { emailConfigured, escapeHtml, sendEmail } from '../../../lib/email';
import { SUPPORT_TOPICS, validateSupport } from '../../../lib/support';
import { clientIp, sameOrigin } from '../../../lib/request-guard';
import { verifyTurnstile } from '../../../lib/turnstile';
import { findBlockedTerm } from '../../../lib/moderation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Formulário da Central de Ajuda: grava o chamado com protocolo, avisa o
// suporte e confirma para quem escreveu. Limite: 5 por IP e 3 por e-mail por hora.
export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Origem não permitida.' }, { status: 403 });

  let raw: Record<string, unknown>;
  try {
    raw = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Envio inválido.' }, { status: 400 });
  }
  const checked = validateSupport(raw);
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: checked.spam ? 422 : 400 });
  const ticket = checked.value;
  if (findBlockedTerm(`${ticket.name} ${ticket.message}`)) {
    return NextResponse.json({ error: 'Sua mensagem contém termos que não são permitidos na Artenós.' }, { status: 400 });
  }

  const ip = clientIp(request);
  if (!(await verifyTurnstile(String(raw.turnstileToken ?? ''), ip))) {
    return NextResponse.json({ error: 'Confirme que você não é um robô e tente de novo.' }, { status: 400 });
  }

  try {
    const admin = getSupabaseAdmin();
    for (const [bucket, key, limit] of [['ajuda-ip', ip, 5], ['ajuda-email', ticket.email, 3]] as const) {
      const { data: allowed, error } = await admin.rpc('rate_limit_hit', { p_bucket: bucket, p_key: key, p_limit: limit, p_window_seconds: 3600 });
      if (error) throw new Error(error.message);
      if (!allowed) return NextResponse.json({ error: 'Muitos envios seguidos. Tente de novo em uma hora ou use o WhatsApp.' }, { status: 429 });
    }

    const user = await getUserFromRequest(request);
    const { data: saved, error: saveError } = await admin.from('support_tickets').insert({
      user_id: user?.id ?? null, name: ticket.name, email: ticket.email, topic: ticket.topic,
      order_code: ticket.orderCode, message: ticket.message,
    }).select('protocol').single();
    if (saveError || !saved) throw new Error(saveError?.message ?? 'Chamado não gravado.');
    const protocol = saved.protocol as string;

    const inbox = process.env.SUPPORT_INBOX_EMAIL || process.env.NEXT_PUBLIC_SUPPORT_EMAIL;
    if (emailConfigured()) {
      const topic = SUPPORT_TOPICS[ticket.topic];
      const body = escapeHtml(ticket.message).replace(/\n/g, '<br>');
      const jobs: Promise<void>[] = [];
      if (inbox) {
        jobs.push(sendEmail({
          to: inbox,
          replyTo: ticket.email,
          subject: `[${protocol}] ${topic} — ${ticket.name}`,
          html: `<p><strong>Protocolo:</strong> ${protocol}<br><strong>Nome:</strong> ${escapeHtml(ticket.name)}<br>` +
            `<strong>E-mail:</strong> ${escapeHtml(ticket.email)}<br><strong>Assunto:</strong> ${escapeHtml(topic)}<br>` +
            `<strong>Pedido:</strong> ${escapeHtml(ticket.orderCode ?? '—')}<br><strong>Conta:</strong> ${user ? escapeHtml(user.id) : 'visitante'}</p>` +
            `<p>${body}</p>`,
        }));
      }
      jobs.push(sendEmail({
        to: ticket.email,
        subject: `Recebemos sua mensagem — protocolo ${protocol}`,
        html: `<p>Olá, ${escapeHtml(ticket.name.split(/\s+/)[0] ?? '')}!</p>` +
          `<p>Recebemos sua mensagem na Central de Ajuda da Artenós. Seu protocolo é <strong>${protocol}</strong>.</p>` +
          `<p>Responderemos neste e-mail. Se precisar complementar, responda a esta mensagem informando o protocolo.</p>` +
          `<p><em>Assunto: ${escapeHtml(SUPPORT_TOPICS[ticket.topic])}</em></p><blockquote>${body}</blockquote>`,
      }));
      const results = await Promise.allSettled(jobs);
      for (const result of results) if (result.status === 'rejected') console.error('[ajuda] e-mail não enviado:', result.reason);
    } else {
      console.warn('[ajuda] e-mail não configurado: chamado gravado sem aviso por e-mail.', protocol);
    }
    return NextResponse.json({ protocol });
  } catch (error) {
    console.error('[ajuda] erro:', error);
    return NextResponse.json({ error: 'Não foi possível registrar sua mensagem agora. Tente de novo ou use o WhatsApp.' }, { status: 500 });
  }
}
