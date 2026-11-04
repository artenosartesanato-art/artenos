// Filtro de termos ofensivos. A regra que vale é a do banco
// (public.moderation_find_term, migração 20261029_moderacao_chat.sql); esta
// cópia só avisa antes de enviar. Lista editável: config/termos-bloqueados.json.
import config from "../config/termos-bloqueados.json" with { type: "json" };

const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b", "@": "a", "$": "s" };

/** Palavras normalizadas: sem acento, sem leetspeak, sem letras repetidas, letras soltas juntas. */
export function moderationTokens(text: string): string[] {
  const plain = text
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[0134578@$]/g, (char) => LEET[char] ?? char);
  const raw = plain.split(/[^a-z]+/).filter(Boolean);
  // "p.u.t.a" / "f d p": 3+ letras soltas seguidas viram uma palavra.
  const merged: string[] = [];
  let run: string[] = [];
  const flush = () => {
    if (run.length >= 3) merged.push(run.join(""));
    else merged.push(...run);
    run = [];
  };
  for (const token of raw) {
    if (token.length === 1) run.push(token);
    else { flush(); merged.push(token); }
  }
  flush();
  return merged.map((token) => token.replace(/(.)\1+/g, "$1"));
}

const wordMatches = (word: string, term: string) => word === term || word === `${term}s` || word === `${term}es`;

export function findBlockedTerm(text: string, terms: readonly string[] = config.termos): string | null {
  const words = moderationTokens(text);
  for (const term of terms) {
    const parts = moderationTokens(term);
    if (!parts.length) continue;
    for (let index = 0; index + parts.length <= words.length; index += 1) {
      if (parts.every((part, offset) => wordMatches(words[index + offset], part))) return term;
    }
  }
  return null;
}

export const MODERATION_MESSAGE = "Sua mensagem contém termos que não são permitidos na Artenós.";

/** Mensagem amigável quando o banco recusou um texto pelo filtro (prefixo "MODERACAO:"). */
export function moderationError(error: unknown): string | null {
  const message = typeof error === "object" && error && "message" in error ? String((error as { message: unknown }).message) : "";
  const match = message.match(/MODERACAO:\s*(.+)/);
  return match ? match[1].trim() : null;
}
