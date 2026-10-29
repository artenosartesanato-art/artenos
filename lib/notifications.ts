// Regras das notificações sem dependências de React (testáveis no Node).

export type NotificationKind = "mensagem" | "pedido" | "venda" | "encomenda" | "produto" | "avaliacao";

export type AppNotification = {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  link: string;
  ref_id: string | null;
  unread_count: number;
  created_at: string;
  read_at: string | null;
};

export const KIND_LABEL: Record<NotificationKind, string> = {
  mensagem: "Mensagem",
  pedido: "Pedido",
  venda: "Venda",
  encomenda: "Encomenda",
  produto: "Peça salva",
  avaliacao: "Avaliação",
};

export const MAX_ITEMS = 40;

/** Total exibido no sininho: soma os agrupamentos não lidos. */
export function unreadTotal(items: AppNotification[]) {
  return items.reduce((total, item) => total + (item.read_at ? 0 : Math.max(item.unread_count, 1)), 0);
}

export function badgeText(total: number) {
  return total > 99 ? "99+" : String(total);
}

/** Prefixo "(3) " no título da aba, como nos apps de mensagem. */
export function titleWithCount(title: string, total: number) {
  const base = title.replace(/^\(\d+\+?\)\s/, "");
  return total > 0 ? `(${badgeText(total)}) ${base}` : base;
}

/** Insere ou atualiza (agrupamento) mantendo a mais recente no topo. */
export function upsertNotification(items: AppNotification[], incoming: AppNotification) {
  const rest = items.filter((item) => item.id !== incoming.id);
  return [incoming, ...rest]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, MAX_ITEMS);
}

/**
 * Notificações que a página atual já mostra (ex.: abrir /pedidos lê os avisos
 * de pedido). Mensagens só contam como lidas quando a conversa está aberta.
 */
export function readOnVisit(items: AppNotification[], pathname: string) {
  return items
    .filter((item) => !item.read_at && item.kind !== "mensagem" && item.link.split("?")[0] === pathname)
    .map((item) => item.id);
}

/** Não lidas por conversa, para o contador na lista do chat. */
export function unreadByRef(items: AppNotification[]) {
  const map = new Map<string, number>();
  for (const item of items) {
    if (!item.read_at && item.ref_id) map.set(item.ref_id, (map.get(item.ref_id) ?? 0) + Math.max(item.unread_count, 1));
  }
  return map;
}

/**
 * Avisos que chegaram desde a última leitura (consulta de segurança quando o
 * tempo real falha): não lidos que são novos ou que agruparam mais mensagens.
 */
export function freshUnread(previous: AppNotification[], next: AppNotification[]) {
  const known = new Map(previous.map((item) => [item.id, item]));
  return next.filter((item) => {
    if (item.read_at) return false;
    const before = known.get(item.id);
    return !before || item.unread_count > before.unread_count || item.created_at > before.created_at;
  });
}
