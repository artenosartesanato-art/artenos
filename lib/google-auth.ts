// Login com Google (Supabase Auth, provedor "google").
//
// Fluxo: botão → Google (escolha da conta) → Supabase → /acesso/google, que
// lê a sessão e decide o destino com destinationFor(). Conta sem profile =
// cadastro incompleto → /concluir-cadastro.
import { getSupabase } from "@/lib/supabase";
import { setRememberDevice } from "@/lib/session";
import { safeReturnPath } from "@/lib/navigation";
import type { AccountChoice, SignupStatus } from "@/lib/google-destination";
export { destinationFor, type AccountChoice, type SignupStatus } from "@/lib/google-destination";

const INTENT_KEY = "artenos:google-intent";
/** Intenção vale por 30 min (tempo de sobra para escolher a conta no Google). */
const INTENT_TTL_MS = 30 * 60_000;

export type GoogleIntent = { perfil: AccountChoice | null; voltar: string | null; at: number };

export function saveGoogleIntent(intent: Omit<GoogleIntent, "at">) {
  try {
    window.sessionStorage.setItem(INTENT_KEY, JSON.stringify({ ...intent, at: Date.now() }));
  } catch { /* sem armazenamento: segue sem a intenção */ }
}

export function readGoogleIntent(now = Date.now()): GoogleIntent | null {
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(INTENT_KEY) ?? "null") as GoogleIntent | null;
    if (!parsed || now - Number(parsed.at) > INTENT_TTL_MS) return null;
    return {
      perfil: parsed.perfil === "client" || parsed.perfil === "artisan" ? parsed.perfil : null,
      voltar: safeReturnPath(parsed.voltar),
      at: Number(parsed.at),
    };
  } catch {
    return null;
  }
}

export function clearGoogleIntent() {
  try { window.sessionStorage.removeItem(INTENT_KEY); } catch { /* sem armazenamento */ }
}

/** Abre o Google. Só volta (com erro) se nem chegou a sair do site. */
export async function continueWithGoogle({ perfil, voltar, remember }: {
  perfil: AccountChoice | null; voltar: string | null; remember: boolean;
}) {
  // Define onde a sessão será guardada antes de ela existir.
  setRememberDevice(remember);
  saveGoogleIntent({ perfil, voltar: safeReturnPath(voltar) });
  const { error } = await getSupabase().auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${window.location.origin}/acesso/google`,
      // Sempre mostra a lista de contas do Google (permite trocar de conta).
      queryParams: { prompt: "select_account" },
    },
  });
  if (error) {
    throw new Error(/provider is not enabled|unsupported provider/i.test(error.message)
      ? "O acesso com Google ainda não foi ativado. Use e-mail e senha por enquanto."
      : "Não foi possível abrir o Google agora. Tente novamente em instantes.");
  }
}

/** Situação do cadastro da conta conectada (funciona sem o script novo, com menos detalhes). */
export async function loadSignupStatus(): Promise<SignupStatus> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc("my_signup_status");
  if (!error && data) return data as SignupStatus;
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { signed_in: false, is_admin: false, has_profile: false, account_type: null, approval_status: null, email: null, providers: [] };
  const [{ data: admin }, { data: profile, error: profileError }] = await Promise.all([
    supabase.rpc("is_active_admin"),
    supabase.from("profiles").select("account_type,approval_status").eq("id", auth.user.id).maybeSingle(),
  ]);
  if (profileError) throw new Error("Não foi possível verificar o seu cadastro agora.");
  return {
    signed_in: true,
    is_admin: admin === true,
    has_profile: Boolean(profile),
    account_type: (profile?.account_type ?? null) as AccountChoice | null,
    approval_status: (profile?.approval_status ?? null) as SignupStatus["approval_status"],
    email: auth.user.email ?? null,
    providers: (auth.user.app_metadata?.providers as string[] | undefined) ?? [],
  };
}
