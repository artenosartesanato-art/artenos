// Validação de formulários de acesso no navegador, com as MESMAS regras que
// registerWithSupabase aplica antes do envio. Serve para mostrar o erro ao
// lado do campo; a validação do servidor continua valendo.
import { validBrazilianPhone, validCnpj, validCpf, validEmail } from "@/lib/supabase";
import { meaningfulTextError } from "@/lib/text-quality";

export type FieldErrors = Record<string, string>;
const text = (value: unknown) => String(value ?? "").trim();
const digits = (value: unknown) => text(value).replace(/\D/g, "");

export function validateLogin(values: Record<string, unknown>): FieldErrors {
  const errors: FieldErrors = {};
  const email = text(values.email).toLowerCase();
  if (!email) errors.email = "Informe o e-mail da sua conta.";
  else if (!validEmail(email)) errors.email = "Informe um e-mail completo, como nome@gmail.com.";
  if (!text(values.password)) errors.password = "Informe sua senha.";
  return errors;
}

export function validateRecovery(values: Record<string, unknown>): FieldErrors {
  const email = text(values.email).toLowerCase();
  if (!email) return { email: "Informe o e-mail da sua conta." };
  if (!validEmail(email)) return { email: "Informe um e-mail completo, como nome@gmail.com." };
  return {};
}

export function validateNewPassword(values: Record<string, unknown>): FieldErrors {
  const errors: FieldErrors = {};
  const password = text(values.password);
  if (password.length < 8) errors.password = "Use pelo menos 8 caracteres.";
  if (!text(values.confirmPassword)) errors.confirmPassword = "Repita a nova senha.";
  else if (password !== text(values.confirmPassword)) errors.confirmPassword = "As senhas não são iguais.";
  return errors;
}

export function validateRegistration(values: Record<string, unknown>, type: "client" | "artisan"): FieldErrors {
  const errors: FieldErrors = {};
  if (text(values.fullName).length < 3) errors.fullName = "Informe seu nome completo.";
  if (type === "artisan") {
    if (!text(values.storeName)) errors.storeName = "Informe o nome da sua loja.";
    if (!text(values.specialty)) errors.specialty = "Escolha a especialidade principal.";
  }
  const document = digits(values.document);
  if (!document) errors.document = type === "client" ? "Informe seu CPF." : "Informe seu CPF ou CNPJ.";
  else if (type === "client" ? !validCpf(document) : !(validCpf(document) || validCnpj(document)))
    errors.document = type === "client" ? "Confira os números do CPF." : "Confira os números do CPF ou CNPJ.";
  if (!digits(values.phone)) errors.phone = "Informe um telefone com DDD.";
  else if (!validBrazilianPhone(values.phone)) errors.phone = "Informe um telefone válido com DDD. Celulares começam com 9.";
  const cep = digits(values.cep);
  if (cep.length !== 8 || /^(\d)\1+$/.test(cep)) errors.cep = "Informe os 8 números do CEP.";
  if (!text(values.address)) errors.address = "Informe a rua ou avenida.";
  if (!text(values.number)) errors.number = "Informe o número (ou s/n).";
  if (!text(values.city)) errors.city = "Informe a cidade.";
  if (!/^[A-Za-z]{2}$/.test(text(values.state))) errors.state = "Use a sigla do estado, como SP.";
  const email = text(values.email).toLowerCase();
  if (!email) errors.email = "Informe seu e-mail.";
  else if (!validEmail(email)) errors.email = "Informe um e-mail completo, como nome@gmail.com.";
  const password = text(values.password);
  if (password.length < 8) errors.password = "Use pelo menos 8 caracteres.";
  if (!text(values.confirmPassword)) errors.confirmPassword = "Repita a senha.";
  else if (password !== text(values.confirmPassword)) errors.confirmPassword = "As senhas não são iguais.";
  if (type === "artisan") {
    const storyError = meaningfulTextError(text(values.story), "A história da loja");
    if (storyError) errors.story = storyError;
  }
  if (values.terms !== "accepted") errors.terms = "Para criar a conta, aceite os Termos de Uso e a Política de Privacidade.";
  return errors;
}

/** Associa uma mensagem do servidor ao campo correspondente, quando possível. */
export function fieldForServerMessage(message: string): string | null {
  if (/cpf|cnpj/i.test(message)) return "document";
  if (/e-mail|email/i.test(message)) return "email";
  if (/telefone/i.test(message)) return "phone";
  if (/cep/i.test(message)) return "cep";
  if (/senha/i.test(message)) return "password";
  return null;
}
