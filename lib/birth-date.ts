// Data de nascimento e idade mínima (18 anos). Sem dependências (testável no
// Node). O banco aplica as mesmas regras (migração 20261114_data_nascimento).

export const MINIMUM_AGE = 18;
const MAXIMUM_AGE = 120;

/** Máscara dd/mm/aaaa enquanto a pessoa digita. */
export function maskBirthDate(value: string) {
  return String(value ?? "").replace(/\D/g, "").slice(0, 8)
    .replace(/(\d{2})(\d)/, "$1/$2").replace(/(\d{2})(\d)/, "$1/$2");
}

/** Hoje (data do aparelho) como AAAA-MM-DD. */
export function todayIso(now = new Date()) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * Converte "dd/mm/aaaa" (ou "aaaa-mm-dd") em "AAAA-MM-DD". Devolve null se a
 * data não existe no calendário (31/02, mês 13...).
 */
export function parseBirthDate(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const [year, month, day] = br ? [Number(br[3]), Number(br[2]), Number(br[1])]
    : iso ? [Number(iso[1]), Number(iso[2]), Number(iso[3])] : [0, 0, 0];
  if (!year || month < 1 || month > 12 || day < 1) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Idade em anos completos numa data (as duas em AAAA-MM-DD). */
export function ageOn(birthIso: string, today = todayIso()) {
  const [birthYear, birthMonth, birthDay] = birthIso.split("-").map(Number);
  const [year, month, day] = today.split("-").map(Number);
  const hadBirthday = month > birthMonth || (month === birthMonth && day >= birthDay);
  return year - birthYear - (hadBirthday ? 0 : 1);
}

export type BirthDateCheck =
  | { ok: true; iso: string; age: number }
  | { ok: false; reason: "missing" | "invalid" | "underage"; message: string; iso?: string; age?: number };

/** Mesma conferência do banco: data real, não futura, até 120 anos e 18+. */
export function checkBirthDate(value: unknown, today = todayIso()): BirthDateCheck {
  const raw = String(value ?? "").trim();
  if (!raw) return { ok: false, reason: "missing", message: "Informe sua data de nascimento." };
  const iso = parseBirthDate(raw);
  if (!iso) return { ok: false, reason: "invalid", message: "Informe uma data válida, no formato dia/mês/ano (ex.: 25/03/1990)." };
  const age = ageOn(iso, today);
  if (iso > today || age > MAXIMUM_AGE) return { ok: false, reason: "invalid", message: "Confira o ano da data de nascimento." };
  if (age < MINIMUM_AGE)
    return { ok: false, reason: "underage", iso, age, message: `É preciso ter ${MINIMUM_AGE} anos ou mais para vender na Artenós.` };
  return { ok: true, iso, age };
}

/** Mensagem de erro para o formulário de cadastro (null = data aceita). */
export function birthDateError(value: unknown, today = todayIso()) {
  const result = checkBirthDate(value, today);
  return result.ok ? null : result.message;
}

/** "AAAA-MM-DD" → "dd/mm/aaaa". */
export function formatBirthDate(iso: string | null | undefined) {
  const match = String(iso ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "";
}
