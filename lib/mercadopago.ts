import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

const API = 'https://api.mercadopago.com';

export type MpFeeDetail = { type?: string; amount?: number; fee_payer?: string };

export type MpPayment = {
  id: number;
  status: string; // approved | pending | in_process | authorized | rejected | cancelled | refunded | charged_back ...
  status_detail?: string;
  external_reference?: string | null;
  transaction_amount: number;
  currency_id?: string;
  metadata?: { artenos_attempt_id?: string };
  payment_method_id?: string; // ex.: pix, visa, master
  payment_type_id?: string; // ex.: bank_transfer (Pix), credit_card
  fee_details?: MpFeeDetail[];
  date_approved?: string | null;
  date_of_expiration?: string | null;
  point_of_interaction?: {
    transaction_data?: { qr_code?: string; qr_code_base64?: string; ticket_url?: string };
  };
};

export class MpError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = 'MpError';
    this.status = status;
    this.body = body;
  }
}

function accessToken() {
  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) throw new Error('Configure MP_ACCESS_TOKEN no .env.local (token do Mercado Pago, só do servidor).');
  return token;
}

export async function mpRequest<T>(
  path: string,
  // accessToken: só para o split (caminho A, ainda não ligado): cobrar em nome
  // da loja com o token que ela autorizou. Sem ele, usa a conta da Artenós (hoje).
  init: { method?: string; body?: unknown; headers?: Record<string, string>; accessToken?: string } = {}
): Promise<T> {
  const response = await fetch(API + path, {
    method: init.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${init.accessToken ?? accessToken()}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: 'no-store',
    signal: AbortSignal.timeout(25000),
  });

  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  if (!response.ok) {
    const message =
      body && typeof body === 'object' && 'message' in body
        ? String((body as { message: unknown }).message)
        : `Erro ${response.status} no Mercado Pago`;
    throw new MpError(message, response.status, body);
  }
  return body as T;
}

export function createPayment(body: Record<string, unknown>, idempotencyKey: string, deviceId?: string) {
  const headers: Record<string, string> = { 'X-Idempotency-Key': idempotencyKey };
  if (deviceId) headers['X-meli-session-id'] = deviceId; // ajuda na análise antifraude
  return mpRequest<MpPayment>('/v1/payments', { method: 'POST', body, headers });
}

export function getPayment(id: string | number) {
  return mpRequest<MpPayment>(`/v1/payments/${encodeURIComponent(String(id))}`);
}

// Procura o pagamento mais recente de uma compra pela referência externa (id do checkout).
export async function findPaymentByReference(reference: string) {
  const result = await mpRequest<{ results?: MpPayment[] }>(
    `/v1/payments/search?external_reference=${encodeURIComponent(reference)}&sort=date_created&criteria=desc&limit=1`
  );
  return result.results?.[0] ?? null;
}

// Soma só as taxas cobradas de quem recebe (o marketplace). Se o comprador pagou a taxa, não entra.
export function gatewayFeeOf(payment: MpPayment) {
  const total = (payment.fee_details ?? [])
    .filter((fee) => fee.fee_payer === 'collector')
    .reduce((sum, fee) => sum + Number(fee.amount ?? 0), 0);
  return Math.round(total * 100) / 100;
}

// Confere se o aviso veio mesmo do Mercado Pago (HMAC SHA256 do manifest com a chave secreta do webhook).
export function verifyWebhookSignature(opts: {
  signature: string | null;
  requestId: string | null;
  dataId: string | null;
  secret: string;
}) {
  if (!opts.signature || !opts.dataId) return false;

  const parts: Record<string, string> = {};
  for (const piece of opts.signature.split(',')) {
    const [key, ...rest] = piece.trim().split('=');
    if (key) parts[key] = rest.join('=');
  }
  const ts = parts.ts;
  const v1 = parts.v1;
  if (!ts || !v1) return false;

  const id = /^[a-z0-9]+$/i.test(opts.dataId) ? opts.dataId.toLowerCase() : opts.dataId;
  const manifest = `id:${id};request-id:${opts.requestId ?? ''};ts:${ts};`;
  const expected = createHmac('sha256', opts.secret).update(manifest).digest('hex');

  const a = Buffer.from(expected);
  const b = Buffer.from(v1);
  return a.length === b.length && timingSafeEqual(a, b);
}
