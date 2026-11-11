"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Loader2, ShieldCheck } from "@/components/icons";
import { PasswordInput } from "@/components/auth-fields";
import { getSupabase } from "@/lib/supabase";
import { validateNewPassword, type FieldErrors } from "@/lib/registration-validation";
import "../storefront.css";
import { recordAccess } from "@/lib/access-log";

type Stage = "checking" | "ready" | "invalid" | "expired" | "done";

const UPDATE_ERRORS: Record<string, string> = {
  weak_password: "A senha é muito fraca. Use letras maiúsculas e minúsculas, números e símbolos.",
  same_password: "Escolha uma senha diferente da anterior.",
  session_expired: "O link expirou. Peça um novo link de recuperação.",
  over_request_rate_limit: "Muitas tentativas em pouco tempo. Aguarde alguns minutos.",
};

/** Lido no primeiro render, antes de o cliente do Supabase limpar a URL. */
function linkFromUrl() {
  if (typeof window === "undefined") return { recovery: false, error: null as string | null };
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const query = new URLSearchParams(window.location.search);
  const errorCode = hash.get("error_code") ?? query.get("error_code") ?? hash.get("error") ?? query.get("error");
  return {
    recovery: hash.get("type") === "recovery" || query.has("code") || query.get("type") === "recovery",
    error: errorCode,
  };
}

export default function ResetPasswordPage() {
  const [link] = useState(linkFromUrl);
  const [stage, setStage] = useState<Stage>("checking");
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  useEffect(() => {
    let active = true;
    // Link com erro (expirado, já usado): nem tenta.
    if (link.error) {
      queueMicrotask(() => { if (active) setStage(link.error === "otp_expired" ? "expired" : "invalid"); });
      return () => { active = false; };
    }
    const supabase = getSupabase();
    // O cliente lê o token do link (detectSessionInUrl) e avisa com
    // PASSWORD_RECOVERY. Só um link de recuperação libera a troca: estar
    // conectado não basta (troca de senha sem link pede a senha atual).
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (active && event === "PASSWORD_RECOVERY") setStage("ready");
    });
    const timer = window.setTimeout(async () => {
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      setStage((current) => (current === "checking" ? (data.session && link.recovery ? "ready" : "invalid") : current));
    }, 2500);
    return () => { active = false; window.clearTimeout(timer); listener.subscription.unsubscribe(); };
  }, [link]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const found = validateNewPassword(values);
    setErrors(found);
    if (Object.keys(found).length) return;
    setPending(true);
    try {
      const { error } = await getSupabase().auth.updateUser({ password: String(values.password) });
      if (error) {
        setErrors({ _form: UPDATE_ERRORS[error.code ?? ""] ?? "Não foi possível salvar a nova senha. Tente novamente." });
        return;
      }
      void recordAccess("password_reset");
      setStage("done");
    } catch {
      setErrors({ _form: "Não foi possível conectar agora. Confira sua internet e tente novamente." });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="store-page">
      <main id="conteudo" tabIndex={-1} className="store-container reset-main">
        {stage === "checking" ? (
          <div className="an-state" role="status"><Loader2 size={28} className="spin" /><h1>Validando o link…</h1></div>
        ) : stage === "invalid" || stage === "expired" ? (
          <div className="an-state" role="alert">
            <AlertTriangle size={32} />
            <h1>{stage === "expired" ? "Este link expirou" : "Este link não é válido"}</h1>
            <p>{stage === "expired"
              ? "Por segurança, o link de recuperação vale por tempo limitado. Peça um novo para criar sua senha."
              : "O link já foi usado, está incompleto ou não é de recuperação de senha. Peça um novo para continuar."}</p>
            <div className="an-state-actions"><Link className="an-btn" href="/acesso?aba=entrar&recuperar=1">Pedir novo link</Link></div>
          </div>
        ) : stage === "done" ? (
          <div className="an-state" role="status">
            <ShieldCheck size={32} />
            <h1>Senha atualizada</h1>
            <p>Sua nova senha já está valendo. Nos próximos acessos, entre com o e-mail e a nova senha.</p>
            <div className="an-state-actions"><Link className="an-btn" href="/">Continuar na Artenós</Link></div>
          </div>
        ) : (
          <form className="recovery-form reset-card" onSubmit={submit} noValidate>
            <div className="form-heading">
              <p className="eyebrow">Recuperar acesso</p>
              <h1>Crie uma nova senha</h1>
              <p>Use letras maiúsculas e minúsculas, números e símbolos, com pelo menos 8 caracteres.</p>
            </div>
            {errors._form && (
              <div className="an-alert an-alert--error form-error-summary" role="alert">
                <AlertTriangle size={18} /><span>{errors._form}</span>
              </div>
            )}
            {(["password", "confirmPassword"] as const).map((name) => (
              <div className="field" key={name}>
                <label htmlFor={`campo-${name}`}>{name === "password" ? "Nova senha" : "Repita a nova senha"}</label>
                <PasswordInput id={`campo-${name}`} name={name} autoComplete="new-password"
                  invalid={errors[name] ? true : undefined}
                  placeholder={name === "password" ? "Crie uma senha forte" : "Digite a nova senha novamente"}
                  describedBy={errors[name] ? `campo-${name}-erro` : undefined}
                  showStrength={name === "password"}
                  onValueChange={() => setErrors((current) => {
                    if (!current[name]) return current;
                    const next = { ...current };
                    delete next[name];
                    return next;
                  })} />
                {errors[name] && <small className="field-error" id={`campo-${name}-erro`}><AlertTriangle size={13} /> {errors[name]}</small>}
              </div>
            ))}
            <button className="primary-button" disabled={pending} aria-busy={pending}>
              {pending && <Loader2 size={18} className="spin" />}{pending ? "Salvando…" : "Salvar nova senha"}
            </button>
          </form>
        )}
      </main>
    </div>
  );
}
