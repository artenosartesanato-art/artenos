// Especialidades de loja: as mesmas no cadastro de vendedor, em "Abrir minha
// loja" (perfil) e em Minha loja. "Outro" abre um campo para a pessoa digitar.

export const OTHER_SPECIALTY = "Outro";

export const STORE_SPECIALTIES = [
  "Crochê e tricô", "Cerâmica", "Costura criativa", "Joias e acessórios",
  "Papelaria", "Decoração", "Cosméticos naturais", OTHER_SPECIALTY,
];

export const SPECIALTY_MIN = 2;
export const SPECIALTY_MAX = 60;

/** Valor salvo → escolha da lista + texto livre (para "Outro" ou valor antigo fora da lista). */
export function splitSpecialty(value: string | null | undefined) {
  const text = (value ?? "").trim();
  if (!text) return { choice: "", other: "" };
  if (STORE_SPECIALTIES.includes(text) && text !== OTHER_SPECIALTY) return { choice: text, other: "" };
  return { choice: OTHER_SPECIALTY, other: text === OTHER_SPECIALTY ? "" : text };
}

/** Escolha + texto livre → valor salvo ("Outro" vira o que a pessoa digitou). */
export function resolveSpecialty(choice: string, other: string) {
  return choice === OTHER_SPECIALTY ? other.replace(/\s+/g, " ").trim() : choice.trim();
}

/** Erro de preenchimento (o filtro de termos é conferido à parte). */
export function specialtyError(choice: string, other: string) {
  if (!choice) return "Escolha a especialidade principal.";
  if (choice !== OTHER_SPECIALTY) return null;
  const text = resolveSpecialty(choice, other);
  if (text.length < SPECIALTY_MIN) return "Escreva a sua especialidade (ex.: marchetaria, vitral).";
  if (text.length > SPECIALTY_MAX) return `Use no máximo ${SPECIALTY_MAX} caracteres.`;
  if (!/\p{L}/u.test(text)) return "Escreva a especialidade com letras.";
  return null;
}

/** Confere o valor final (já resolvido) antes de salvar. */
export function specialtyValueError(value: string) {
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length < SPECIALTY_MIN) return "Escolha a especialidade ou escreva a sua em “Outro”.";
  if (text.length > SPECIALTY_MAX) return `A especialidade pode ter no máximo ${SPECIALTY_MAX} caracteres.`;
  if (!/\p{L}/u.test(text)) return "Escreva a especialidade com letras.";
  return null;
}
