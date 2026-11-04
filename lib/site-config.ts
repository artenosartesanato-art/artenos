// Dados institucionais e de contato da Artenós, num lugar só. Vêm de variáveis
// de ambiente públicas (NEXT_PUBLIC_*) porque aparecem nas páginas; enquanto
// não forem preenchidas, as páginas mostram um aviso no lugar do dado.

const env = (value: string | undefined) => (value ?? "").trim();
const digits = (value: string) => value.replace(/\D/g, "");

export const PENDING = "a definir";

export const siteConfig = {
  companyName: env(process.env.NEXT_PUBLIC_COMPANY_NAME) || "Artenós",
  companyLegalName: env(process.env.NEXT_PUBLIC_COMPANY_LEGAL_NAME),
  companyCnpj: env(process.env.NEXT_PUBLIC_COMPANY_CNPJ),
  companyAddress: env(process.env.NEXT_PUBLIC_COMPANY_ADDRESS),
  supportEmail: env(process.env.NEXT_PUBLIC_SUPPORT_EMAIL),
  supportPhone: env(process.env.NEXT_PUBLIC_SUPPORT_PHONE),
  supportWhatsapp: digits(env(process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP)),
  supportHours: env(process.env.NEXT_PUBLIC_SUPPORT_HOURS) || "segunda a sexta, das 9h às 18h (horário de Brasília)",
  dpoName: env(process.env.NEXT_PUBLIC_DPO_NAME),
  dpoEmail: env(process.env.NEXT_PUBLIC_DPO_EMAIL),
  privacyUpdatedAt: env(process.env.NEXT_PUBLIC_PRIVACY_UPDATED_AT) || "29 de outubro de 2026",
};

/** Link do WhatsApp com mensagem inicial; null se o número não foi configurado. */
export function whatsappLink(message = "Olá! Vim pela Central de Ajuda da Artenós e preciso de ajuda com:") {
  const number = siteConfig.supportWhatsapp;
  if (number.length < 10) return null;
  const full = number.startsWith("55") ? number : `55${number}`;
  return `https://wa.me/${full}?text=${encodeURIComponent(message)}`;
}

/** Telefone para exibir, ex.: (17) 99999-0000. */
export function formatPhone(value: string) {
  const number = digits(value).replace(/^55(?=\d{10,11}$)/, "");
  if (number.length === 11) return `(${number.slice(0, 2)}) ${number.slice(2, 7)}-${number.slice(7)}`;
  if (number.length === 10) return `(${number.slice(0, 2)}) ${number.slice(2, 6)}-${number.slice(6)}`;
  return value;
}
