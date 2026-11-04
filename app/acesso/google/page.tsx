"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Loader2 } from "@/components/icons";
import { getSupabase } from "@/lib/supabase";
import { markActivity } from "@/lib/session";
import { clearGoogleIntent, destinationFor, loadSignupStatus, readGoogleIntent } from "@/lib/google-auth";
import "../../storefront.css";

/** Erros que o Google/Supabase devolvem na volta, em linguagem simples. */
function returnError(): string | null {
  const params = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const code = params.get("error") ?? hash.get("error");
  if (!code) return null;
  const description = `${params.get("error_description") ?? hash.get("error_description") ?? ""}`;
  if (code === "access_denied") return "O acesso com o Google foi cancelado. Você pode tentar de novo quando quiser.";
  if (/email/i.test(description)) return "O Google não informou um e-mail confirmado para esta conta. Use outra conta ou entre com e-mail e senha.";
  return "Não foi possível concluir o acesso com o Google. Tente novamente.";
}

export default function GoogleReturnPage() {
  const router = useRouter();
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void (async () => {
      const problem = returnError();
      if (problem) {
        if (active) setError(problem);
        return;
      }
      try {
        // O cliente lê o retorno do Google na URL antes de responder.
        const { data } = await getSupabase().auth.getSession();
        if (!data.session) throw new Error("Sua sessão com o Google não foi encontrada. Tente entrar de novo.");
        const status = await loadSignupStatus();
        const intent = readGoogleIntent();
        markActivity(true);
        const destination = destinationFor(status, intent?.voltar ?? null, intent?.perfil ?? null);
        if (status.has_profile || status.is_admin) {
          clearGoogleIntent();
          toast.success("Você entrou com o Google.");
        }
        if (active) router.replace(destination);
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : "Não foi possível concluir o acesso com o Google.");
      }
    })();
    return () => { active = false; };
  }, [router]);

  return (
    <div className="store-page">
      <main id="conteudo" tabIndex={-1} className="store-container reset-main">
        {error ? (
          <div className="an-state" role="alert">
            <AlertTriangle size={32} />
            <h1>Não deu certo desta vez</h1>
            <p>{error}</p>
            <div className="an-state-actions">
              <Link className="an-btn" href="/acesso?aba=entrar">Voltar para o login</Link>
            </div>
          </div>
        ) : (
          <div className="an-state" role="status">
            <Loader2 size={28} className="spin" />
            <h1>Entrando com o Google…</h1>
            <p>Estamos confirmando sua conta.</p>
          </div>
        )}
      </main>
    </div>
  );
}
