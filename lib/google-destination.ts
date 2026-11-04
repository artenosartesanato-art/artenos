// Destino depois de entrar (Google ou senha). Sem dependências: testável no Node.
import { safeReturnPath } from "./navigation.ts";

export type AccountChoice = "client" | "artisan";

export type SignupStatus = {
  signed_in: boolean;
  is_admin: boolean;
  has_profile: boolean;
  account_type: AccountChoice | null;
  approval_status: "active" | "pending_review" | "assisted_review" | null;
  email: string | null;
  providers: string[];
};

/** Para onde a conta vai depois de entrar (mesma regra do login com senha). */
export function destinationFor(status: Pick<SignupStatus, "is_admin" | "has_profile" | "account_type" | "approval_status">,
  voltar: string | null, perfil: AccountChoice | null = null) {
  if (status.is_admin) return "/administracao";
  if (!status.has_profile) return `/concluir-cadastro${perfil ? `?perfil=${perfil}` : ""}`;
  if (status.account_type === "artisan" && status.approval_status !== "active") return "/cadastro-em-analise";
  return safeReturnPath(voltar) ?? (status.account_type === "artisan" ? "/vendedor" : "/");
}
