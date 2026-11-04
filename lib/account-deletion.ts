// Regras e textos da exclusão em duas etapas (pedido → 30 dias → exclusão
// definitiva). Puro: usado nas rotas do servidor, nas telas e nos testes.

export const DELETION_GRACE_DAYS = 30;

/** "28/11/2026", no horário de Brasília. */
export function formatDeletionDate(value: string | Date) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" })
    .format(typeof value === "string" ? new Date(value) : value);
}

/** Data da exclusão definitiva para um pedido feito agora. */
export function deletionDateFrom(now: Date) {
  return new Date(now.getTime() + DELETION_GRACE_DAYS * 24 * 3600 * 1000);
}

/** Link "Enviar e-mail" para pedir a reativação, já com assunto e o e-mail da conta. */
export function reactivationMailto(supportEmail: string, accountEmail: string) {
  const body = `Olá! Quero reativar a minha conta na Artenós.\n\nE-mail da conta: ${accountEmail}\n`;
  return `mailto:${supportEmail}?subject=${encodeURIComponent("Reativação de conta")}&body=${encodeURIComponent(body)}`;
}

/** Cadastro com e-mail já usado: orienta a entrar ou, se a conta foi excluída, a pedir a reativação. */
export function emailTakenMessage(supportEmail: string) {
  const contact = supportEmail ? ` escreva para ${supportEmail}` : " fale com o atendimento";
  return `Este e-mail já está cadastrado. Tente entrar na sua conta. Se você pediu a exclusão dela nos últimos ${DELETION_GRACE_DAYS} dias,${contact} para reativá-la.`;
}

type Mail = { subject: string; text: string; html: string };
const escape = (value: string) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);

function mail(subject: string, paragraphs: string[]): Mail {
  return {
    subject,
    text: paragraphs.join("\n\n"),
    html: `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#3b2a20">${paragraphs.map((p) => `<p>${escape(p)}</p>`).join("")}</div>`,
  };
}

export function deletionRequestedEmail(name: string, scheduledAt: string, supportEmail: string): Mail {
  return mail("Sua conta na Artenós foi desativada", [
    `Olá${name ? `, ${name}` : ""}.`,
    `Recebemos o seu pedido de exclusão. Sua conta foi desativada e será excluída definitivamente em ${formatDeletionDate(scheduledAt)}. Depois dessa data ela não pode mais ser recuperada.`,
    supportEmail
      ? `Mudou de ideia? Para reativar a conta até essa data, envie um e-mail para ${supportEmail} a partir deste endereço.`
      : "Mudou de ideia? Para reativar a conta até essa data, fale com o atendimento da Artenós.",
    "Pedidos, pagamentos e notas fiscais ficam guardados pelo prazo exigido por lei, sem os seus dados de contato.",
    "Se não foi você quem pediu, responda este e-mail o quanto antes.",
  ]);
}

export function accountReactivatedEmail(name: string): Mail {
  return mail("Sua conta na Artenós foi reativada", [
    `Olá${name ? `, ${name}` : ""}.`,
    "Sua conta foi reativada e você já pode entrar de novo com o mesmo e-mail e senha.",
    "Se você tem uma loja, as peças voltaram despublicadas: revise cada uma e publique de novo no painel da loja.",
  ]);
}
