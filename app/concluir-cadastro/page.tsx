"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, HandHeart, Loader2, LogOut, Mail, ShieldCheck, ShoppingBag, Store } from "@/components/icons";
import { AddressFields, ErrorSummary, Field, maskDocument, maskPhone, specialties } from "@/components/auth-fields";
import { GoogleLogo } from "@/components/google-button";
import { getSupabase } from "@/lib/supabase";
import { endSession } from "@/lib/session";
import { clearGoogleIntent, destinationFor, loadSignupStatus, readGoogleIntent, type AccountChoice } from "@/lib/google-auth";
import { fieldForServerMessage, validateCompletion, type FieldErrors } from "@/lib/registration-validation";
import { safeReturnPath } from "@/lib/navigation";
import "../storefront.css";

type Account = { email: string; name: string; avatar: string | null; viaGoogle: boolean };

const digits = (value: unknown) => String(value ?? "").replace(/\D/g, "");

function CompleteSignup() {
  const router = useRouter();
  const params = useSearchParams();
  const [account, setAccount] = useState<Account | null>(null);
  const [type, setType] = useState<AccountChoice | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pending, setPending] = useState<"standard" | "assisted" | null>(null);
  const returnTo = safeReturnPath(params.get("voltar"));
  const clear = (name: string) => setErrors((current) => {
    if (!current[name] && !current._form) return current;
    const next = { ...current };
    delete next[name];
    delete next._form;
    return next;
  });

  useEffect(() => {
    let active = true;
    void (async () => {
      const supabase = getSupabase();
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      if (!data.session) {
        router.replace("/acesso?aba=entrar&voltar=%2Fconcluir-cadastro");
        return;
      }
      try {
        const status = await loadSignupStatus();
        if (!active) return;
        // Já concluído (ou administração): não há o que completar.
        if (status.has_profile || status.is_admin) {
          router.replace(destinationFor(status, returnTo));
          return;
        }
      } catch {
        if (active) setErrors({ _form: "Não foi possível verificar seu cadastro agora. Recarregue a página." });
      }
      const user = data.session.user;
      const meta = user.user_metadata ?? {};
      const intent = readGoogleIntent();
      const fromUrl = params.get("perfil");
      // Escolha anterior fica na conta: sobrevive a sair e voltar depois.
      const saved = meta.signup_choice === "client" || meta.signup_choice === "artisan" ? meta.signup_choice as AccountChoice : null;
      const initial = fromUrl === "client" || fromUrl === "artisan" ? fromUrl : intent?.perfil ?? saved;
      setType(initial);
      if (initial && initial !== saved) void supabase.auth.updateUser({ data: { signup_choice: initial } }).catch(() => undefined);
      setAccount({
        email: user.email ?? "",
        name: String(meta.full_name ?? meta.name ?? "").trim(),
        avatar: typeof meta.avatar_url === "string" ? meta.avatar_url : typeof meta.picture === "string" ? meta.picture : null,
        viaGoogle: ((user.app_metadata?.providers as string[] | undefined) ?? []).includes("google"),
      });
    })();
    return () => { active = false; };
  }, [params, returnTo, router]);

  function choose(next: AccountChoice) {
    setType(next);
    setErrors({});
    // Só preferência de tela: o tipo real da conta é gravado pelo banco.
    void getSupabase().auth.updateUser({ data: { signup_choice: next } }).catch(() => undefined);
  }

  async function submit(form: HTMLFormElement, assisted = false) {
    if (pending || !type) return;
    const values = Object.fromEntries(new FormData(form));
    const found = validateCompletion(values, type);
    if (Object.keys(found).length) {
      setErrors(found);
      return;
    }
    setErrors({});
    setPending(assisted ? "assisted" : "standard");
    try {
      // Validado de novo no banco (complete_oauth_signup); o e-mail vem da conta.
      const { data, error } = await getSupabase().rpc("complete_oauth_signup", {
        p_account_type: type,
        p_registration_mode: assisted ? "assisted" : "standard",
        p_full_name: String(values.fullName ?? ""),
        p_document: digits(values.document),
        p_phone: digits(values.phone),
        p_cep: digits(values.cep),
        p_address: String(values.address ?? ""),
        p_address_number: String(values.number ?? ""),
        p_city: String(values.city ?? ""),
        p_state: String(values.state ?? "").toUpperCase(),
        p_store_name: type === "artisan" ? String(values.storeName ?? "") : null,
        p_specialty: type === "artisan" ? String(values.specialty ?? "") : null,
        p_story: type === "artisan" ? String(values.story ?? "") : null,
        p_terms_accepted: values.terms === "accepted",
      });
      if (error) {
        const message = error.message.includes("Could not find the function")
          ? "O cadastro com Google ainda não foi ativado no banco. Avise o suporte da Artenós."
          : error.message;
        const field = fieldForServerMessage(message);
        setErrors(field && field !== "email" ? { [field]: message } : { _form: message });
        return;
      }
      clearGoogleIntent();
      window.dispatchEvent(new Event("artenos:profile-changed"));
      const intent = readGoogleIntent();
      const approved = data === "active";
      toast.success(type === "artisan" ? "Solicitação da loja enviada para análise." : "Cadastro concluído. Boas-vindas à Artenós!");
      router.replace(destinationFor({
        is_admin: false, has_profile: true, account_type: type,
        approval_status: approved ? "active" : "pending_review",
      }, returnTo ?? intent?.voltar ?? null));
    } catch {
      setErrors({ _form: "Não foi possível conectar agora. Confira sua internet e tente novamente." });
    } finally {
      setPending(null);
    }
  }

  async function leave() {
    await endSession("local");
    router.replace("/");
    toast.info("Você saiu. Entre de novo quando quiser para concluir o cadastro.");
  }

  if (!account) {
    return (
      <main id="conteudo" tabIndex={-1} className="store-container reset-main">
        {errors._form
          ? <div className="an-state" role="alert"><AlertTriangle size={30} /><h1>{errors._form}</h1></div>
          : <div className="an-state" role="status"><Loader2 size={28} className="spin" /><h1>Carregando seu cadastro…</h1></div>}
      </main>
    );
  }

  const docLabel = type === "artisan" ? "CPF ou CNPJ" : "CPF";
  return (
    <main id="conteudo" tabIndex={-1} className="store-container complete-main">
      <form className="register-form complete-card" noValidate onSubmit={(event) => { event.preventDefault(); void submit(event.currentTarget); }}>
        <div className="form-heading">
          <p className="eyebrow">Falta pouco</p>
          <h1>Concluir cadastro</h1>
          <p>
            {account.viaGoogle ? "Sua conta Google já está conectada. " : ""}
            Para comprar ou vender na Artenós, complete os dados abaixo. Você pode sair e terminar depois: seu acesso continua salvo.
          </p>
        </div>

        <div className="complete-account">
          {account.avatar
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={account.avatar} alt="" width={48} height={48} referrerPolicy="no-referrer"
              onError={() => setAccount((current) => current ? { ...current, avatar: null } : current)} />
            : <span aria-hidden="true">{account.viaGoogle ? <GoogleLogo size={22} /> : <Mail size={20} />}</span>}
          <div>
            <strong>{account.name || "Sua conta"}</strong>
            <small>{account.email}{account.viaGoogle ? " · conectado com o Google" : ""}</small>
          </div>
          <ShieldCheck size={18} aria-hidden="true" />
        </div>

        <fieldset className="complete-type">
          <legend>Como você vai usar a Artenós?</legend>
          <label className={type === "client" ? "is-selected" : ""}>
            <input type="radio" name="accountType" value="client" checked={type === "client"} onChange={() => choose("client")} />
            <ShoppingBag size={20} />
            <span><strong>Quero comprar</strong><small>Peças, encomendas e acompanhamento de pedidos.</small></span>
          </label>
          <label className={type === "artisan" ? "is-selected" : ""}>
            <input type="radio" name="accountType" value="artisan" checked={type === "artisan"} onChange={() => choose("artisan")} />
            <Store size={20} />
            <span><strong>Quero vender</strong><small>Abrir uma loja; a equipe analisa antes de ir ao ar.</small></span>
          </label>
        </fieldset>

        {type && (
          <>
            <p className="form-required-note">Todos os campos são obrigatórios. Seu e-mail já veio da conta e não precisa ser digitado.</p>
            <ErrorSummary errors={errors} />
            <div className="fields-grid">
              <p className="form-section-title">Seus dados</p>
              <Field name="fullName" label="Nome completo" error={errors.fullName} wide>
                {(props) => <input {...props} name="fullName" autoComplete="name" defaultValue={account.name}
                  placeholder="Seu nome e sobrenome" onInput={() => clear("fullName")} />}
              </Field>
              {type === "artisan" && (
                <>
                  <Field name="storeName" label="Nome da loja" error={errors.storeName}>
                    {(props) => <input {...props} name="storeName" autoComplete="organization" placeholder="Como sua loja vai aparecer na vitrine" onInput={() => clear("storeName")} />}
                  </Field>
                  <Field name="specialty" label="Especialidade principal" error={errors.specialty}>
                    {(props) => (
                      <select {...props} name="specialty" defaultValue="" onChange={() => clear("specialty")}>
                        <option value="" disabled>Selecione</option>
                        {specialties.map((item) => <option key={item}>{item}</option>)}
                      </select>
                    )}
                  </Field>
                </>
              )}
              <Field name="document" label={docLabel} error={errors.document} hint="Usado só para validar o cadastro; não aparece na loja.">
                {(props) => (
                  <input {...props} name="document" inputMode="numeric" autoComplete="off" placeholder="000.000.000-00"
                    onChange={(event) => { event.target.value = maskDocument(event.target.value); clear("document"); }} />
                )}
              </Field>
              <Field name="phone" label="Telefone com DDD" error={errors.phone}>
                {(props) => (
                  <input {...props} name="phone" type="tel" autoComplete="tel-national" inputMode="tel" maxLength={15}
                    placeholder="(11) 91234-5678" onChange={(event) => { event.currentTarget.value = maskPhone(event.currentTarget.value); clear("phone"); }} />
                )}
              </Field>
              <p className="form-section-title">Endereço</p>
              <AddressFields errors={errors} onClear={clear} />
              {type === "artisan" && (
                <Field name="story" label="Conte a história da sua loja" error={errors.story} wide
                  hint="Como você começou, o que inspira suas peças e o que torna seu trabalho especial (40 a 1.200 caracteres).">
                  {(props) => <textarea {...props} name="story" maxLength={1200} rows={5}
                    placeholder="Ex.: comecei a bordar com minha avó, uso linhas de algodão e cada peça leva uma semana…" onInput={() => clear("story")} />}
                </Field>
              )}
            </div>
            <div className="consent-wrap">
              <label className="consent" htmlFor="campo-terms">
                <input id="campo-terms" className="check" type="checkbox" name="terms" value="accepted"
                  aria-invalid={errors.terms ? true : undefined} aria-describedby={errors.terms ? "campo-terms-erro" : undefined}
                  onChange={() => clear("terms")} />
                <span>
                  Li e aceito os <a href="/termos" target="_blank" rel="noopener">Termos de Uso</a> e a{" "}
                  <a href="/privacidade" target="_blank" rel="noopener">Política de Privacidade</a> (abrem em nova aba).
                </span>
              </label>
              {errors.terms && <small className="field-error" id="campo-terms-erro"><AlertTriangle size={13} /> {errors.terms}</small>}
            </div>
            <div className="form-actions">
              <button className="primary-button" disabled={pending !== null} aria-busy={pending === "standard"}>
                {pending === "standard" && <Loader2 size={18} className="spin" />}
                {pending === "standard" ? "Salvando…" : type === "artisan" ? "Enviar loja para análise" : "Concluir cadastro"}
              </button>
              {type === "artisan" && (
                <button type="button" className="secondary-button" disabled={pending !== null} aria-busy={pending === "assisted"}
                  onClick={(event) => { const form = event.currentTarget.form; if (form) void submit(form, true); }}>
                  {pending === "assisted" ? <Loader2 size={18} className="spin" /> : <HandHeart size={18} />} Quero cadastro assistido
                </button>
              )}
            </div>
          </>
        )}
        {!type && errors._form && <ErrorSummary errors={errors} />}
        <p className="form-switch">
          Prefere terminar depois? <button type="button" className="link-button" onClick={() => void leave()}><LogOut size={14} /> Sair da conta</button>
        </p>
      </form>
    </main>
  );
}

export default function CompleteSignupPage() {
  return (
    <div className="store-page access-page">
      <Suspense fallback={<main className="store-container reset-main" />}>
        <CompleteSignup />
      </Suspense>
    </div>
  );
}
