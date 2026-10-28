// Datas e agrupamento do chat (sem dependências de React, testável no Node).

const DAY_MS = 24 * 60 * 60 * 1000;
/** Mensagens do mesmo remetente com até este intervalo formam um bloco. */
export const GROUP_WINDOW_MS = 5 * 60 * 1000;

export type ChatMessage = {
  id: string;
  sender_id: string;
  created_at: string;
};

export type ChatItem<T extends ChatMessage> = {
  message: T;
  /** Rótulo do separador de dia, quando esta é a primeira mensagem do dia. */
  dayLabel: string | null;
  firstOfGroup: boolean;
  lastOfGroup: boolean;
};

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** Diferença em dias de calendário (local): 0 = hoje, 1 = ontem. */
function daysAgo(date: Date, now: Date) {
  return Math.round((startOfDay(now) - startOfDay(date)) / DAY_MS);
}

const two = (value: number) => String(value).padStart(2, "0");

export function formatClock(iso: string) {
  const date = new Date(iso);
  return `${two(date.getHours())}:${two(date.getMinutes())}`;
}

/** Horário curto da lista de conversas: 14:05, Ontem, terça, 12/10/26. */
export function formatListTime(iso: string, now = new Date()) {
  const date = new Date(iso);
  const days = daysAgo(date, now);
  if (days <= 0) return formatClock(iso);
  if (days === 1) return "Ontem";
  if (days < 7) return date.toLocaleDateString("pt-BR", { weekday: "long" }).replace("-feira", "");
  return `${two(date.getDate())}/${two(date.getMonth() + 1)}/${String(date.getFullYear()).slice(-2)}`;
}

/** Separador de dia no histórico: Hoje, Ontem, segunda-feira, 12 de outubro. */
export function formatDayLabel(iso: string, now = new Date()) {
  const date = new Date(iso);
  const days = daysAgo(date, now);
  if (days <= 0) return "Hoje";
  if (days === 1) return "Ontem";
  if (days < 7) return date.toLocaleDateString("pt-BR", { weekday: "long" });
  return date.toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "long",
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
}

/** Marca separadores de dia e blocos do mesmo remetente (como no WhatsApp). */
export function groupChat<T extends ChatMessage>(messages: T[], now = new Date()): ChatItem<T>[] {
  return messages.map((message, index) => {
    const previous = messages[index - 1];
    const next = messages[index + 1];
    const time = new Date(message.created_at);
    const newDay = !previous || startOfDay(new Date(previous.created_at)) !== startOfDay(time);
    const joinsPrevious = Boolean(previous) && !newDay && previous.sender_id === message.sender_id &&
      time.getTime() - new Date(previous.created_at).getTime() <= GROUP_WINDOW_MS;
    const nextTime = next ? new Date(next.created_at) : null;
    const joinsNext = Boolean(next && nextTime) && next.sender_id === message.sender_id &&
      startOfDay(nextTime!) === startOfDay(time) &&
      nextTime!.getTime() - time.getTime() <= GROUP_WINDOW_MS;
    return {
      message,
      dayLabel: newDay ? formatDayLabel(message.created_at, now) : null,
      firstOfGroup: !joinsPrevious,
      lastOfGroup: !joinsNext,
    };
  });
}

/** Até duas iniciais para o avatar quando não há foto. */
export function initials(name: string | null | undefined) {
  const words = (name ?? "").trim().split(/\s+/).filter((word) => /\p{L}/u.test(word[0] ?? ""));
  if (words.length === 0) return "?";
  const letters = words.length === 1 ? words[0].slice(0, 2) : words[0][0] + words[words.length - 1][0];
  return letters.toLocaleUpperCase("pt-BR");
}
