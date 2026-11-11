// Política de senha da Artenós: mesmas regras no cadastro, na redefinição e
// na troca de senha do perfil. Puro (sem React), testável no Node.

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 72; // limite do bcrypt usado pelo Supabase Auth

export type PasswordRuleId = "length" | "lower" | "upper" | "number" | "symbol";

export type PasswordRule = { id: PasswordRuleId; label: string; test: (password: string) => boolean };

export const PASSWORD_RULES: readonly PasswordRule[] = [
  { id: "length", label: `Pelo menos ${PASSWORD_MIN_LENGTH} caracteres`, test: (value) => value.length >= PASSWORD_MIN_LENGTH },
  { id: "lower", label: "Uma letra minúscula", test: (value) => /\p{Ll}/u.test(value) },
  { id: "upper", label: "Uma letra maiúscula", test: (value) => /\p{Lu}/u.test(value) },
  { id: "number", label: "Um número", test: (value) => /\p{Nd}/u.test(value) },
  { id: "symbol", label: "Um símbolo (ex.: ! @ # $ %)", test: (value) => /[^\p{L}\p{Nd}\s]/u.test(value) },
];

export type PasswordCheck = {
  /** Regras atendidas, na ordem de PASSWORD_RULES. */
  passed: Record<PasswordRuleId, boolean>;
  /** Quantas das 5 regras foram atendidas. */
  score: number;
  /** De 0 a 4: quantas barras do medidor ficam preenchidas. */
  bars: 0 | 1 | 2 | 3 | 4;
  level: "empty" | "weak" | "fair" | "good" | "strong";
  valid: boolean;
};

export function checkPassword(password: string): PasswordCheck {
  const value = String(password ?? "");
  const passed = Object.fromEntries(PASSWORD_RULES.map((rule) => [rule.id, rule.test(value)])) as Record<PasswordRuleId, boolean>;
  const score = PASSWORD_RULES.filter((rule) => passed[rule.id]).length;
  const valid = score === PASSWORD_RULES.length && value.length <= PASSWORD_MAX_LENGTH;
  // 4 barras: cada uma representa um critério de composição (minúscula,
  // maiúscula, número, símbolo). A última só acende com o tamanho mínimo, para
  // a barra cheia sempre significar "senha aceita".
  const kinds = (["lower", "upper", "number", "symbol"] as const).filter((id) => passed[id]).length;
  const bars = (value ? (valid ? 4 : Math.min(kinds, 3)) : 0) as PasswordCheck["bars"];
  const level = !value ? "empty" : valid ? "strong" : bars >= 3 ? "good" : bars === 2 ? "fair" : "weak";
  return { passed, score, bars, level, valid };
}

export const PASSWORD_LEVEL_LABEL: Record<PasswordCheck["level"], string> = {
  empty: "Digite uma senha",
  weak: "Senha fraca",
  fair: "Senha razoável",
  good: "Quase lá",
  strong: "Senha forte",
};

/** Mensagem de erro para o campo de senha, ou null se a senha for aceita. */
export function passwordPolicyError(password: string): string | null {
  const value = String(password ?? "");
  if (!value) return "Crie uma senha.";
  if (value.length > PASSWORD_MAX_LENGTH) return `Use no máximo ${PASSWORD_MAX_LENGTH} caracteres.`;
  const { passed } = checkPassword(value);
  const missing = PASSWORD_RULES.filter((rule) => !passed[rule.id]).map((rule) => rule.label.toLowerCase());
  if (!missing.length) return null;
  return `A senha precisa ter: ${missing.join(", ")}.`;
}
