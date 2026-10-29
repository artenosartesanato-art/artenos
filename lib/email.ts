import 'server-only';
import nodemailer, { type Transporter } from 'nodemailer';

// Envio de e-mails da plataforma (comprovantes, Central de Ajuda, avisos).
// Os e-mails de login/senha do Supabase Auth NÃO passam por aqui: eles usam o
// SMTP configurado no painel do Supabase (veja docs/EMAIL-GMAIL.md).
//
// Ordem de preferência:
// 1. SMTP (ex.: Gmail com senha de app) — SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD;
// 2. Resend — RESEND_API_KEY.
// Remetente: EMAIL_FROM (no Gmail, precisa ser o próprio endereço da conta).

export type EmailMessage = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
};

let transporter: Transporter | null = null;

export function smtpConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD);
}

export function emailConfigured() {
  return smtpConfigured() || Boolean(process.env.RESEND_API_KEY);
}

export function emailFrom() {
  return process.env.EMAIL_FROM || (process.env.SMTP_USER ? `Artenós <${process.env.SMTP_USER}>` : 'Artenós <onboarding@resend.dev>');
}

function smtpTransport() {
  if (transporter) return transporter;
  const port = Number(process.env.SMTP_PORT || 465);
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    // 465 = SSL direto; 587 = STARTTLS (secure false + upgrade obrigatório).
    secure: port === 465,
    requireTLS: port !== 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
  });
  return transporter;
}

export async function sendEmail(message: EmailMessage): Promise<void> {
  const to = Array.isArray(message.to) ? message.to : [message.to];
  if (smtpConfigured()) {
    await smtpTransport().sendMail({
      from: emailFrom(),
      to,
      subject: message.subject,
      html: message.html,
      text: message.text,
      replyTo: message.replyTo,
    });
    return;
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('E-mail não configurado: defina SMTP_* (Gmail) ou RESEND_API_KEY.');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: emailFrom(),
      to,
      subject: message.subject,
      html: message.html,
      text: message.text,
      reply_to: message.replyTo,
    }),
  });
  if (!response.ok) throw new Error(`Resend respondeu ${response.status}: ${await response.text()}`);
}

export const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
