import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { authStorage } from "@/lib/session";
import { meaningfulTextError } from "@/lib/text-quality";

let client: SupabaseClient | null = null;

export function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !publishableKey) {
    throw new Error(
      "Configure NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY no arquivo .env ou .env.local.",
    );
  }
  client ??= createClient(url, publishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      // localStorage ("manter conectado") ou cookies de sessão; ver lib/session.ts.
      storage: authStorage,
    },
  });
  return client;
}

const text = (value: unknown) => String(value ?? "").trim();
const digits = (value: unknown) => text(value).replace(/\D/g, "");
export const validEmail = (value: string) =>
  value.length <= 254 &&
  /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(
    value,
  );
const brazilianAreaCodes = new Set([
  "11",
  "12",
  "13",
  "14",
  "15",
  "16",
  "17",
  "18",
  "19",
  "21",
  "22",
  "24",
  "27",
  "28",
  "31",
  "32",
  "33",
  "34",
  "35",
  "37",
  "38",
  "41",
  "42",
  "43",
  "44",
  "45",
  "46",
  "47",
  "48",
  "49",
  "51",
  "53",
  "54",
  "55",
  "61",
  "62",
  "63",
  "64",
  "65",
  "66",
  "67",
  "68",
  "69",
  "71",
  "73",
  "74",
  "75",
  "77",
  "79",
  "81",
  "82",
  "83",
  "84",
  "85",
  "86",
  "87",
  "88",
  "89",
  "91",
  "92",
  "93",
  "94",
  "95",
  "96",
  "97",
  "98",
  "99",
]);

export function validBrazilianPhone(value: unknown) {
  let number = digits(value);
  if ((number.length === 12 || number.length === 13) && number.startsWith("55"))
    number = number.slice(2);
  if (number.length !== 10 && number.length !== 11) return false;
  if (!brazilianAreaCodes.has(number.slice(0, 2))) return false;
  const subscriber = number.slice(2);
  if (/^(\d)\1+$/.test(subscriber)) return false;
  return number.length === 11
    ? /^9\d{8}$/.test(subscriber)
    : /^[2-5]\d{7}$/.test(subscriber);
}

export function validCpf(value: string) {
  if (value.length !== 11 || /^(\d)\1+$/.test(value)) return false;
  for (let digit = 9; digit < 11; digit++) {
    let sum = 0;
    for (let i = 0; i < digit; i++) sum += Number(value[i]) * (digit + 1 - i);
    if (((sum * 10) % 11) % 10 !== Number(value[digit])) return false;
  }
  return true;
}
export function validCnpj(value: string) {
  if (value.length !== 14 || /^(\d)\1+$/.test(value)) return false;
  const calc = (length: number) => {
    const weights =
      length === 12
        ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
        : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const remainder =
      weights.reduce(
        (sum, weight, index) => sum + Number(value[index]) * weight,
        0,
      ) % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };
  return calc(12) === Number(value[12]) && calc(13) === Number(value[13]);
}

type SupabaseError = { code?: string; message?: string; status?: number };

function friendlyAuthError(error: SupabaseError, action: "signup" | "login") {
  const code = error.code ?? "";
  const message = error.message ?? "";
  const messages: Record<string, string> = {
    email_exists: "Este e-mail já está cadastrado. Tente entrar na sua conta.",
    user_already_exists:
      "Este e-mail já está cadastrado. Tente entrar na sua conta.",
    weak_password:
      "A senha é muito fraca. Use pelo menos 8 caracteres e evite sequências fáceis.",
    email_address_invalid: "Informe um endereço de e-mail válido.",
    email_address_not_authorized:
      "Esse endereço de e-mail não está autorizado para cadastro.",
    signup_disabled: "Novos cadastros estão temporariamente desativados.",
    email_provider_disabled:
      "O acesso por e-mail está temporariamente indisponível.",
    over_email_send_rate_limit:
      "Muitos e-mails foram solicitados. Aguarde alguns minutos e tente novamente.",
    over_request_rate_limit:
      "Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.",
    captcha_failed:
      "Não foi possível confirmar a verificação de segurança. Atualize a página e tente novamente.",
    request_timeout:
      "O servidor demorou para responder. Confira sua conexão e tente novamente.",
    email_not_confirmed:
      "Confirme seu e-mail antes de entrar. Verifique também a caixa de spam.",
    invalid_credentials: "E-mail ou senha incorretos.",
    user_banned:
      "Esta conta está temporariamente bloqueada. Entre em contato com o atendimento.",
    unexpected_failure:
      "O serviço de cadastro está temporariamente indisponível. Tente novamente em instantes.",
    validation_failed:
      "Alguns dados não foram aceitos. Revise o formulário e tente novamente.",
  };

  if (messages[code]) return messages[code];
  if (/database error saving new user/i.test(message)) {
    return "Não foi possível criar a conta. Verifique se o CPF ou CNPJ já foi cadastrado.";
  }
  if (/failed to fetch|network|load failed/i.test(message)) {
    return "Não foi possível conectar ao servidor. Confira sua internet e tente novamente.";
  }
  if (/email.*invalid|invalid.*email/i.test(message))
    return "Informe um endereço de e-mail válido.";
  if (/already registered|already exists/i.test(message))
    return "Este e-mail já está cadastrado. Tente entrar na sua conta.";
  return action === "login"
    ? "Não foi possível entrar agora. Tente novamente em instantes."
    : "Não foi possível concluir o cadastro. Tente novamente em instantes.";
}

async function ensureDocumentAvailable(document: string) {
  const { data, error } = await getSupabase().rpc(
    "is_registration_document_available",
    {
      candidate_document: document,
    },
  );
  if (error)
    throw new Error(
      "Não foi possível verificar o CPF ou CNPJ agora. Tente novamente em instantes.",
    );
  if (!data)
    throw new Error("Este CPF ou CNPJ já está cadastrado em outra conta.");
}

async function validateCep(value: string) {
  if (value.length !== 8 || /^(\d)\1+$/.test(value)) return false;
  try {
    const response = await fetch(`https://viacep.com.br/ws/${value}/json/`, {
      cache: "no-store",
    });
    if (!response.ok) throw new Error();
    const data = await response.json();
    return !data.erro;
  } catch {
    throw new Error(
      "Não foi possível validar o CEP agora. Confira sua conexão e tente novamente.",
    );
  }
}

/** Token do Turnstile (anti-robô), quando o formulário tem o widget. */
export function captchaFrom(values: Record<string, unknown>) {
  return text(values["cf-turnstile-response"]) || undefined;
}

export async function registerWithSupabase(values: Record<string, unknown>) {
  const type = text(values.type) as "client" | "artisan";
  const document = digits(values.document);
  const email = text(values.email).toLowerCase();
  const cep = digits(values.cep);
  const password = text(values.password);
  if (!["client", "artisan"].includes(type))
    throw new Error("Tipo de conta inválido.");
  if (values.terms !== "accepted")
    throw new Error(
      "Você precisa aceitar os Termos de Uso e a Política de Privacidade.",
    );
  if (!validEmail(email))
    throw new Error(
      "Informe um e-mail válido, incluindo o domínio completo. Exemplo: nome@gmail.com.",
    );
  if (password.length < 8 || password !== text(values.confirmPassword))
    throw new Error(
      "Use uma senha de pelo menos 8 caracteres e confirme-a corretamente.",
    );
  if (
    type === "client"
      ? !validCpf(document)
      : !(validCpf(document) || validCnpj(document))
  )
    throw new Error(
      `Informe um ${type === "client" ? "CPF" : "CPF ou CNPJ"} válido.`,
    );
  await ensureDocumentAvailable(document);
  if (!validBrazilianPhone(values.phone))
    throw new Error(
      "Informe um telefone brasileiro válido, com DDD. Celulares devem começar com 9.",
    );
  if (!(await validateCep(cep))) throw new Error("Informe um CEP válido.");
  if (type === "artisan" && (!text(values.storeName) || !text(values.specialty)))
    throw new Error("Informe o nome da loja e a especialidade.");
  const storyError = type === "artisan" ? meaningfulTextError(text(values.story), "A história da loja") : null;
  if (storyError) throw new Error(storyError);
  const metadata = {
    account_type: type,
    registration_mode: values.assisted ? "assisted" : "standard",
    full_name: text(values.fullName),
    document,
    phone: digits(values.phone),
    cep,
    address: text(values.address),
    address_number: text(values.number),
    city: text(values.city),
    state: text(values.state).toUpperCase(),
    store_name: type === "artisan" ? text(values.storeName) : null,
    specialty: type === "artisan" ? text(values.specialty) : null,
    story: type === "artisan" ? text(values.story) : null,
    terms_accepted_at: new Date().toISOString(),
  };
  try {
    const { data, error } = await getSupabase().auth.signUp({
      email,
      password,
      options: { data: metadata, captchaToken: captchaFrom(values) },
    });
    if (error) throw new Error(friendlyAuthError(error, "signup"));
    if (
      data.user &&
      Array.isArray(data.user.identities) &&
      data.user.identities.length === 0
    ) {
      throw new Error(
        "Este e-mail já está cadastrado. Tente entrar na sua conta.",
      );
    }
  } catch (error) {
    if (
      error instanceof Error &&
      !/Auth|fetch|network|load failed/i.test(error.name + error.message)
    )
      throw error;
    throw new Error(friendlyAuthError(error as SupabaseError, "signup"));
  }
  return {
    message:
      type === "artisan"
        ? "Recebemos sua solicitação de cadastro."
        : "Cadastro realizado. Confira seu e-mail para confirmar a conta.",
  };
}

export async function loginWithSupabase(values: Record<string, unknown>) {
  let data;
  try {
    const result = await getSupabase().auth.signInWithPassword({
      email: text(values.email).toLowerCase(),
      password: text(values.password),
      options: { captchaToken: captchaFrom(values) },
    });
    if (result.error) throw new Error(friendlyAuthError(result.error, "login"));
    data = result.data;
  } catch (error) {
    if (
      error instanceof Error &&
      !/Auth|fetch|network|load failed/i.test(error.name + error.message)
    )
      throw error;
    throw new Error(friendlyAuthError(error as SupabaseError, "login"));
  }
  const { data: isAdmin } = await getSupabase().rpc("is_active_admin");
  if (isAdmin === true) {
    return {
      firstName: "administrador",
      accountType: "client" as const,
      approvalStatus: "active" as const,
      redirectTo: "/administracao",
    };
  }

  const { data: profile, error: profileError } = await getSupabase()
    .from("profiles")
    .select("account_type,approval_status,full_name")
    .eq("id", data.user.id)
    .single();
  if (profileError || !profile) {
    await getSupabase().auth.signOut();
    throw new Error(
      "Não foi possível verificar a situação da sua conta. Tente novamente em instantes.",
    );
  }
  const isPendingArtisan =
    profile.account_type === "artisan" && profile.approval_status !== "active";
  const isApprovedArtisan =
    profile.account_type === "artisan" && profile.approval_status === "active";

  return {
    firstName: text(profile.full_name).split(" ")[0] || "cliente",
    accountType: profile.account_type as "client" | "artisan",
    approvalStatus: profile.approval_status as
      | "active"
      | "pending_review"
      | "assisted_review",
    redirectTo: isPendingArtisan
      ? "/cadastro-em-analise"
      : isApprovedArtisan
        ? "/vendedor"
        : "/",
  };
}
