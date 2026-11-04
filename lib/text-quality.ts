// Barra textos sem sentido em campos públicos da loja (ex.: "asdfasdf…").
// Regras simples e previsíveis; o banco repete as mesmas em
// public.is_meaningful_text (supabase/migrations/20261029_validacao_textos_loja.sql).

export const STORY_MIN_LENGTH = 40;
const MIN_WORDS = 6;
const MIN_DISTINCT_WORDS = 4;
const MIN_VOWEL_RATIO = 0.3;
const MAX_WORD_LENGTH = 30;

const strip = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Devolve a mensagem de erro, ou null quando o texto parece escrito por uma pessoa. */
export function meaningfulTextError(value: string, label = "O texto", minLength = STORY_MIN_LENGTH): string | null {
  const text = value.trim();
  if (text.length < minLength) return `${label} precisa ter pelo menos ${minLength} caracteres (faltam ${minLength - text.length}).`;
  const plain = strip(text);
  const words = plain.split(/\s+/).filter((word) => /\p{L}/u.test(word));
  if (words.length < MIN_WORDS) return `${label} precisa ter frases com pelo menos ${MIN_WORDS} palavras separadas por espaço.`;
  if (words.some((word) => word.replace(/[^\p{L}]/gu, "").length > MAX_WORD_LENGTH))
    return `${label} tem uma palavra longa demais. Separe as palavras com espaço.`;
  const distinct = new Set(words.map((word) => word.replace(/[^\p{L}]/gu, "")).filter((word) => word.length >= 3));
  if (distinct.size < MIN_DISTINCT_WORDS) return `${label} parece repetir as mesmas palavras. Conte com suas palavras.`;
  if (/(.)\1{4,}/u.test(plain)) return `${label} tem letras repetidas demais.`;
  const letters = plain.replace(/[^a-z]/g, "");
  const vowels = letters.replace(/[^aeiouy]/g, "").length;
  if (letters.length > 0 && vowels / letters.length < MIN_VOWEL_RATIO)
    return `${label} não parece um texto em português. Escreva frases completas.`;
  return null;
}

/** Itens da regra, para mostrar enquanto a pessoa digita (✓ / pendente). */
export function storyChecklist(value: string, minLength = STORY_MIN_LENGTH) {
  const text = value.trim();
  const words = strip(text).split(/\s+/).filter((word) => /\p{L}/u.test(word));
  const distinct = new Set(words.map((word) => word.replace(/[^\p{L}]/gu, "")).filter((word) => word.length >= 3));
  return [
    { label: `Pelo menos ${minLength} caracteres (${Math.min(text.length, minLength)}/${minLength})`, done: text.length >= minLength },
    { label: `Pelo menos ${MIN_WORDS} palavras (${Math.min(words.length, MIN_WORDS)}/${MIN_WORDS})`, done: words.length >= MIN_WORDS },
    { label: `Pelo menos ${MIN_DISTINCT_WORDS} palavras diferentes (${Math.min(distinct.size, MIN_DISTINCT_WORDS)}/${MIN_DISTINCT_WORDS})`, done: distinct.size >= MIN_DISTINCT_WORDS },
  ];
}
