// Validação do formulário da Central de Ajuda (mesmas regras no navegador e na rota).

export const SUPPORT_TOPICS = {
  compra: "Compra e pedidos",
  encomenda: "Encomendas",
  pagamento: "Pagamento",
  frete: "Frete e entrega",
  troca: "Trocas e devoluções",
  vender: "Vender na Artenós",
  conta: "Minha conta",
  privacidade: "Privacidade e dados pessoais",
  outro: "Outro assunto",
} as const;
export type SupportTopic = keyof typeof SUPPORT_TOPICS;

export type SupportInput = { name: string; email: string; topic: SupportTopic; orderCode: string | null; message: string };

/** Envio rápido demais costuma ser robô (o formulário leva alguns segundos para preencher). */
export const MIN_FILL_MS = 3000;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateSupport(raw: Record<string, unknown>, now = Date.now()):
  { ok: true; value: SupportInput } | { ok: false; error: string; spam?: boolean } {
  if (String(raw.website ?? "").trim()) return { ok: false, error: "Envio recusado.", spam: true };
  const startedAt = Number(raw.startedAt);
  if (!Number.isFinite(startedAt) || now - startedAt < MIN_FILL_MS) return { ok: false, error: "Envio recusado. Tente de novo.", spam: true };
  const name = String(raw.name ?? "").trim().slice(0, 120);
  const email = String(raw.email ?? "").trim().toLowerCase().slice(0, 200);
  const topic = String(raw.topic ?? "") as SupportTopic;
  const orderCode = String(raw.orderCode ?? "").trim().slice(0, 40) || null;
  const message = String(raw.message ?? "").trim().slice(0, 4000);
  if (name.length < 2) return { ok: false, error: "Informe seu nome." };
  if (!EMAIL.test(email)) return { ok: false, error: "Informe um e-mail válido para a resposta." };
  if (!(topic in SUPPORT_TOPICS)) return { ok: false, error: "Escolha o assunto." };
  if (message.length < 10) return { ok: false, error: "Conte com um pouco mais de detalhes (mínimo de 10 caracteres)." };
  return { ok: true, value: { name, email, topic, orderCode, message } };
}
