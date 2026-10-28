"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Eye, EyeOff, Loader2, LockKeyhole, ShieldCheck } from "@/components/icons";
import { CustomerHeader } from "@/components/customer-header";
import { getSupabase } from "@/lib/supabase";
import { validateNewPassword, type FieldErrors } from "@/lib/registration-validation";
import "../storefront.css";

type Stage = "checking" | "ready" | "invalid" | "done";

const UPDATE_ERRORS: Record<string, string> = {
  weak_password: "A senha é muito fraca. Use pelo menos 8 caracteres e evite sequências fáceis.",
  same_password: "Escolha uma senha diferente da anterior.",
  session_expired: "O link expirou. Peça um novo link de recuperação.",
  over_request_rate_limit: "Muitas tentativas em pouco tempo. Aguarde alguns minutos.",
};

export default function ResetPasswordPage() {
  const [stage, setStage] = useState<Stage>("checking");
  const [pending, setPending] = useState(false);
  const [visible, setVisible] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  useEffect(() => {
    let active = true;
    const supabase = getSupabase();
    // O cliente lê o token do link (detectSessionInUrl) e avisa com
    // PASSWORD_RECOVERY. Sem sessão em alguns segundos, o link é inválido.
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === "PASSWORD_RECOVERY" || (session && /type=recovery|code=/.test(window.location.href))) setStage("ready");
    });
    const timer = window.setTimeout(async () => {
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      setStage((current) => (current === "checking" ? (data.session ? "ready" : "invalid") : current));
    }, 2500);
    return () => { active = false; window.clearTimeout(timer); listener.subscription.unsubscribe(); };
  }, []);

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
      setStage("done");
    } catch {
      setErrors({ _form: "Não foi possível conectar agora. Confira sua internet e tente novamente." });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="store-page">
      <CustomerHeader />
      <main id="conteudo" tabIndex={-1} className="store-container reset-main">
        {stage === "checking" ? (
          <div className="an-state" role="status"><Loader2 size={28} className="spin" /><h1>Validando o link…</h1></div>
        ) : stage === "invalid" ? (
          <div className="an-state">
            <AlertTriangle size={32} />
            <h1>Este link não é mais válido</h1>
            <p>Links de recuperação expiram e só podem ser usados uma vez. Peça um novo para continuar.</p>
            <div className="an-state-actions"><Link className="an-btn" href="/acesso?aba=entrar">Pedir novo link</Link></div>
          </div>
        ) : stage === "done" ? (
          <div className="an-state" role="status">
            <ShieldCheck size={32} />
            <h1>Senha atualizada</h1>
            <p>Sua nova senha já está valendo neste e nos próximos acessos.</p>
            <div className="an-state-actions"><Link className="an-btn" href="/">Continuar na Artenós</Link></div>
          </div>
        ) : (
          <form className="recovery-form reset-card" onSubmit={submit} noValidate>
            <div className="form-heading">
              <p className="eyebrow">Recuperar acesso</p>
              <h1>Crie uma nova senha</h1>
              <p>Use pelo menos 8 caracteres. Evite datas e sequências fáceis.</p>
            </div>
            {errors._form && (
              <div className="an-alert an-alert--error form-error-summary" role="alert">
                <AlertTriangle size={18} /><span>{errors._form}</span>
              </div>
            )}
            {(["password", "confirmPassword"] as const).map((name) => (
              <div className="field" key={name}>
                <label htmlFor={`campo-${name}`}>{name === "password" ? "Nova senha" : "Repita a nova senha"}</label>
                <span className="input-wrap">
                  <LockKeyhole size={18} className="input-icon" />
                  <input id={`campo-${name}`} name={name} type={visible ? "text" : "password"} autoComplete="new-password"
                    className="with-icon with-action" aria-invalid={errors[name] ? true : undefined}
                    aria-describedby={errors[name] ? `campo-${name}-erro` : undefined} />
                  {name === "password" && (
                    <button type="button" className="icon-button" onClick={() => setVisible(!visible)}
                      aria-label={visible ? "Ocultar senhas" : "Mostrar senhas"} aria-pressed={visible}>
                      {visible ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  )}
                </span>
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
