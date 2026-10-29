import { getSupabase } from "@/lib/supabase";

/** Registra login/saída/troca de senha no servidor (IP e horário). Falhas não atrapalham o usuário. */
export async function recordAccess(event: "login" | "logout" | "password_reset") {
  try {
    const { data } = await getSupabase().auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;
    await fetch("/api/registro-acesso", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ event }),
      keepalive: true,
    });
  } catch {
    // sem rede: o acesso continua; o registro é melhor esforço
  }
}
