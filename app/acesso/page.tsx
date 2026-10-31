"use client";

import { Suspense, useEffect, useId, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  Eye,
  EyeOff,
  HandHeart,
  Loader2,
  LockKeyhole,
  Mail,
  MapPin,
  ShieldCheck,
  Store,
} from "@/components/icons";
import { toast } from "sonner";
import { favoriteIntentReturnPath } from "@/components/marketplace-state";
import { markActivity, setRememberDevice } from "@/lib/session";
import { checkThrottle, loadThrottle, registerFailure, registerSuccess, saveThrottle, waitLabel } from "@/lib/login-throttle";
import { AccountBlockedError, captchaFrom, getSupabase, loginWithSupabase, registerWithSupabase } from "@/lib/supabase";
import { Dialog } from "@/components/ui/dialog";
import { formatDeletionDate, reactivationMailto } from "@/lib/account-deletion";
import { siteConfig } from "@/lib/site-config";
import { recordAccess } from "@/lib/access-log";
import { resetTurnstile, TurnstileWidget } from "@/components/turnstile-widget";
import { safeReturnPath } from "@/lib/navigation";
import { STORE_SPECIALTIES } from "@/lib/store-specialties";
import {
  fieldForServerMessage,
  validateLogin,
  validateRecovery,
  validateRegistration,
  type FieldErrors,
} from "@/lib/registration-validation";
import "../storefront.css";

type AccountType = "client" | "artisan";
type Tab = "login" | AccountType;
const TABS: { id: Tab; label: string; param: string }[] = [
  { id: "login", label: "Entrar", param: "entrar" },
  { id: "client", label: "Criar conta", param: "cliente" },
  { id: "artisan", label: "Vender", param: "artesa" },
];
const specialties = STORE_SPECIALTIES;
const FIELD_LABELS: Record<string, string> = {
  fullName: "Nome completo", storeName: "Nome da loja", specialty: "Especialidade", document: "Documento",
  phone: "Telefone", cep: "CEP", address: "Endereço", number: "Número", city: "Cidade", state: "Estado",
  email: "E-mail", password: "Senha", confirmPassword: "Confirmação da senha", story: "História da loja",
  terms: "Termos de Uso",
};

const digits = (value: string) => value.replace(/\D/g, "");
const maskCep = (value: string) => digits(value).slice(0, 8).replace(/(\d{5})(\d)/, "$1-$2");
const maskPhone = (value: string) =>
  digits(value).slice(0, 11).replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d)/, "$1-$2");
function maskDocument(value: string) {
  const number = digits(value).slice(0, 14);
  return number.length <= 11
    ? number.replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2")
    : number.replace(/(\d{2})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1/$2").replace(/(\d{4})(\d{1,2})$/, "$1-$2");
}

/** Campo com rótulo visível, dica e erro associados por aria-describedby. */
function Field({ name, label, error, hint, wide = false, children }: {
  name: string;
  label: string;
  error?: string;
  hint?: string;
  wide?: boolean;
  children: (props: { id: string; "aria-invalid"?: true; "aria-describedby"?: string }) => ReactNode;
}) {
  const id = `campo-${name}`;
  const describedBy = [hint ? `${id}-dica` : "", error ? `${id}-erro` : ""].filter(Boolean).join(" ") || undefined;
  return (
    <div className={`field${wide ? " field-wide" : ""}`}>
      <label htmlFor={id}>{label}</label>
      {children({ id, "aria-invalid": error ? true : undefined, "aria-describedby": describedBy })}
      {/* Dica abaixo do campo: rótulos e campos ficam na mesma altura em cada linha. */}
      {hint && <small className="field-hint" id={`${id}-dica`}>{hint}</small>}
      {error && <small className="field-error" id={`${id}-erro`}><AlertTriangle size={13} /> {error}</small>}
    </div>
  );
}

function PasswordInput({ id, name, autoComplete, invalid, describedBy, placeholder }: {
  id: string; name: string; autoComplete: string; invalid?: true; describedBy?: string; placeholder?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <span className="input-wrap">
      <LockKeyhole size={18} className="input-icon" />
      <input id={id} name={name} type={visible ? "text" : "password"} autoComplete={autoComplete}
        className="with-icon with-action" aria-invalid={invalid} aria-describedby={describedBy} placeholder={placeholder} />
      <button type="button" className="icon-button" onClick={() => setVisible(!visible)}
        aria-label={visible ? "Ocultar senha" : "Mostrar senha"} aria-pressed={visible}>
        {visible ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </span>
  );
}

function ErrorSummary({ errors, title = "Revise os campos destacados" }: { errors: FieldErrors; title?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const entries = Object.entries(errors).filter(([key]) => key !== "_form");
  const key = entries.map(([field]) => field).join("|") + (errors._form ?? "");
  useEffect(() => { ref.current?.focus(); }, [key]);
  if (!entries.length && !errors._form) return null;
  return (
    <div className="an-alert an-alert--error form-error-summary" role="alert" tabIndex={-1} ref={ref}>
      <AlertTriangle size={18} />
      <div>
        <strong>{errors._form ?? title}</strong>
        {entries.length > 0 && (
          <ul>
            {entries.map(([field, message]) => (
              <li key={field}><a href={`#campo-${field}`}>{FIELD_LABELS[field] ? `${FIELD_LABELS[field]}: ` : ""}{message}</a></li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function AddressFields({ errors, onClear }: { errors: FieldErrors; onClear: (name: string) => void }) {
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const lastCep = useRef("");

  async function lookupCep(input: HTMLInputElement) {
    const cep = digits(input.value);
    if (cep.length !== 8 || cep === lastCep.current) return;
    const form = input.form;
    lastCep.current = cep;
    setLoading(true);
    setNotice("");
    try {
      const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      if (!response.ok) throw new Error();
      const data = await response.json();
      if (data.erro) throw new Error();
      if (form) {
        const set = (name: string, value: string) => {
          const field = form.elements.namedItem(name) as HTMLInputElement | null;
          if (field && value) { field.value = value; onClear(name); }
        };
        set("address", data.logradouro || "");
        set("city", data.localidade || "");
        set("state", data.uf || "");
        setNotice(`Endereço encontrado: ${data.localidade}/${data.uf}. Confira e informe o número.`);
      }
    } catch {
      lastCep.current = "";
      setNotice("Não encontramos esse CEP automaticamente. Preencha o endereço abaixo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Field name="cep" label="CEP" error={errors.cep}>
        {(props) => (
          <span className="input-wrap">
            <input {...props} name="cep" inputMode="numeric" autoComplete="postal-code" placeholder="00000-000"
              onChange={(event) => {
                event.currentTarget.value = maskCep(event.currentTarget.value);
                onClear("cep");
                if (digits(event.currentTarget.value).length === 8) void lookupCep(event.currentTarget);
              }}
              onBlur={(event) => void lookupCep(event.currentTarget)} />
            {loading && <Loader2 size={17} className="spin input-status" />}
          </span>
        )}
      </Field>
      <Field name="state" label="Estado (UF)" error={errors.state}>
        {(props) => (
          <input {...props} name="state" autoComplete="address-level1" maxLength={2} placeholder="SP"
            onInput={(event) => { event.currentTarget.value = event.currentTarget.value.toUpperCase(); onClear("state"); }} />
        )}
      </Field>
      <p className="field field-cep-notice" aria-live="polite">{notice}</p>
      <Field name="address" label="Endereço" error={errors.address} wide>
        {(props) => <input {...props} name="address" autoComplete="address-line1" placeholder="Rua, avenida ou estrada" onInput={() => onClear("address")} />}
      </Field>
      <Field name="number" label="Número" error={errors.number}>
        {(props) => <input {...props} name="number" autoComplete="address-line2" placeholder="123 ou s/n" onInput={() => onClear("number")} />}
      </Field>
      <Field name="city" label="Cidade" error={errors.city}>
        {(props) => <input {...props} name="city" autoComplete="address-level2" placeholder="Sua cidade" onInput={() => onClear("city")} />}
      </Field>
    </>
  );
}

function RegisterForm({ type, onGoToLogin }: { type: AccountType; onGoToLogin: () => void }) {
  const [pending, setPending] = useState<"standard" | "assisted" | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [done, setDone] = useState<string | null>(null);
  const [existingAccount, setExistingAccount] = useState(false);
  const clear = (name: string) => setErrors((current) => {
    if (!current[name] && !current._form) return current;
    const next = { ...current };
    delete next[name];
    delete next._form;
    return next;
  });

  async function submit(form: HTMLFormElement, assisted = false) {
    if (pending) return;
    const values = Object.fromEntries(new FormData(form));
    const found = validateRegistration(values, type);
    if (Object.keys(found).length) {
      setErrors(found);
      return;
    }
    setErrors({});
    setPending(assisted ? "assisted" : "standard");
    try {
      await registerWithSupabase({ ...values, type, assisted });
      setDone(String(values.email ?? "").trim().toLowerCase());
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível concluir o cadastro. Tente novamente em instantes.";
      // Vendedor com e-mail ou CPF de uma conta que já existe: não cria outra
      // conta; a pessoa entra e abre a loja na conta dela (mesmos dados).
      if (type === "artisan" && /já está cadastrad|já foi cadastrad/i.test(message)) {
        setExistingAccount(true);
        setErrors({ _form: "Você já tem uma conta com esse e-mail ou CPF. Entre nela e abra sua loja em Meu perfil: seus dados, compras e favoritos continuam na mesma conta." });
        resetTurnstile();
        return;
      }
      const field = fieldForServerMessage(message);
      setErrors(field ? { [field]: message } : { _form: message });
      resetTurnstile();
    } finally {
      setPending(null);
    }
  }

  if (done !== null)
    return (
      <div className="success-state" role="status">
        <span className="success-icon"><ShieldCheck size={28} /></span>
        <h2>{type === "artisan" ? "Solicitação recebida" : "Falta só confirmar seu e-mail"}</h2>
        <p>
          {type === "artisan"
            ? <>Enviamos um link de confirmação para <strong>{done}</strong>. Depois de confirmar, você já pode entrar e acompanhar a análise da sua loja.</>
            : <>Enviamos um link de confirmação para <strong>{done}</strong>. Abra o e-mail (confira também o spam) e depois entre com sua senha.</>}
        </p>
        <div className="form-actions">
          <button type="button" className="primary-button" onClick={onGoToLogin}>Ir para o login</button>
        </div>
      </div>
    );

  const docLabel = type === "artisan" ? "CPF ou CNPJ" : "CPF";
  return (
    <form className="register-form" noValidate onSubmit={(event) => { event.preventDefault(); void submit(event.currentTarget); }}>
      <div className="form-heading">
        <p className="eyebrow">{type === "client" ? "Para quem valoriza o feito à mão" : "Para quem transforma talento em negócio"}</p>
        <h2>{type === "client" ? "Crie sua conta" : "Abra sua loja na Artenós"}</h2>
        <p>
          {type === "client"
            ? "Com a conta você salva favoritos, compra e acompanha seus pedidos."
            : "Conte sobre o seu trabalho. A equipe Artenós analisa cada solicitação antes de a loja ir ao ar."}
        </p>
      </div>
      <p className="form-required-note">Todos os campos são obrigatórios.</p>
      <ErrorSummary errors={errors} />
      {existingAccount && (
        <p className="existing-account-cta">
          <a className="an-btn an-btn--secondary" href={`/acesso?aba=entrar&voltar=${encodeURIComponent("/perfil?loja=1#abrir-loja")}`}>
            Entrar e abrir minha loja
          </a>
        </p>
      )}
      <div className="fields-grid">
        <p className="form-section-title">Seus dados</p>
        <Field name="fullName" label="Nome completo" error={errors.fullName} wide>
          {(props) => <input {...props} name="fullName" autoComplete="name" placeholder="Seu nome e sobrenome" onInput={() => clear("fullName")} />}
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
            <input {...props} name="document" inputMode="numeric" autoComplete="off"
              placeholder="000.000.000-00"
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
        <p className="form-section-title">Acesso</p>
        <Field name="email" label="E-mail" error={errors.email} wide hint="Enviaremos um link para confirmar este endereço.">
          {(props) => (
            <span className="input-wrap">
              <Mail size={18} className="input-icon" />
              <input {...props} name="email" type="email" autoComplete="email" inputMode="email" maxLength={254}
                className="with-icon" placeholder="voce@exemplo.com" onInput={() => clear("email")} />
            </span>
          )}
        </Field>
        <Field name="password" label="Senha" error={errors.password} hint="Pelo menos 8 caracteres.">
          {(props) => <PasswordInput id={props.id} name="password" autoComplete="new-password" placeholder="Mínimo de 8 caracteres" invalid={props["aria-invalid"]} describedBy={props["aria-describedby"]} />}
        </Field>
        <Field name="confirmPassword" label="Confirme a senha" error={errors.confirmPassword}>
          {(props) => <PasswordInput id={props.id} name="confirmPassword" autoComplete="new-password" placeholder="Digite a senha novamente" invalid={props["aria-invalid"]} describedBy={props["aria-describedby"]} />}
        </Field>
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
      <TurnstileWidget />
      <div className="form-actions">
        <button className="primary-button" disabled={pending !== null} aria-busy={pending === "standard"}>
          {pending === "standard" && <Loader2 size={18} className="spin" />}
          {pending === "standard" ? "Enviando…" : type === "artisan" ? "Enviar para análise" : "Criar minha conta"}
        </button>
        {type === "artisan" && (
          <button type="button" className="secondary-button" disabled={pending !== null} aria-busy={pending === "assisted"}
            onClick={(event) => { const form = event.currentTarget.form; if (form) void submit(form, true); }}>
            {pending === "assisted" ? <Loader2 size={18} className="spin" /> : <HandHeart size={18} />} Quero cadastro assistido
          </button>
        )}
      </div>
      {type === "artisan" && (
        <p className="form-switch">No cadastro assistido, a equipe Artenós entra em contato para ajudar a montar a loja.</p>
      )}
      <p className="form-switch">Já tem conta? <button type="button" className="link-button" onClick={onGoToLogin}>Entrar</button></p>
    </form>
  );
}

/** Lembra a escolha anterior; na primeira vez, desmarcado (mais seguro). */
function rememberDeviceDefault() {
  try { return window.localStorage.getItem("artenos:lembrar") === "1"; } catch { return false; }
}

function LoginForm({ returnTo, onRecover, onRegister }: { returnTo: string | null; onRecover: () => void; onRegister: () => void }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  // Conta em exclusão (senha certa): aviso com a data e como reativar.
  const [pendingDeletion, setPendingDeletion] = useState<{ email: string; date: string } | null>(null);
  const clear = (name: string) => setErrors((current) => {
    if (!current[name] && !current._form) return current;
    const next = { ...current };
    delete next[name];
    delete next._form;
    return next;
  });

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const found = validateLogin(values);
    if (Object.keys(found).length) {
      setErrors(found);
      return;
    }
    const email = String(values.email ?? "");
    const throttle = checkThrottle(loadThrottle(), email, Date.now());
    if (!throttle.allowed) {
      setErrors({ _form: `Muitas tentativas sem sucesso. Por segurança, aguarde ${waitLabel(throttle.retryInMs)} e tente de novo.` });
      return;
    }
    setErrors({});
    setPending(true);
    // Escolhido antes de entrar: define onde a sessão será guardada.
    setRememberDevice(values.remember === "on");
    try {
      const result = await loginWithSupabase(values);
      saveThrottle(registerSuccess(loadThrottle(), email));
      markActivity(true);
      void recordAccess("login");
      toast.success(result.approvalStatus === "active"
        ? `Boas-vindas, ${result.firstName}!`
        : `Olá, ${result.firstName}. Acompanhe aqui a análise do seu cadastro.`);
      const destination = result.approvalStatus !== "active" || result.redirectTo === "/administracao"
        ? result.redirectTo
        : returnTo || favoriteIntentReturnPath() || result.redirectTo;
      router.replace(destination);
      // Se a troca de página não andar (ex.: aba aberta numa versão antiga do
      // site, cujos arquivos já não existem), recarrega direto no destino.
      window.setTimeout(() => {
        if (window.location.pathname === "/acesso") window.location.replace(destination);
      }, 2500);
    } catch (error) {
      if (error instanceof AccountBlockedError) {
        // Confere no servidor (com a senha de novo) se é exclusão em andamento.
        const situation = await fetch("/api/acesso/situacao", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password: String(values.password ?? "") }),
        }).then((response) => response.json()).catch(() => null) as { status?: string; scheduledAt?: string } | null;
        resetTurnstile();
        setPending(false);
        if (situation?.status === "pending_deletion" && situation.scheduledAt) {
          setPendingDeletion({ email, date: formatDeletionDate(situation.scheduledAt) });
        } else {
          setErrors({ _form: "Esta conta está bloqueada. Entre em contato com o atendimento da Artenós." });
        }
        return;
      }
      const message = error instanceof Error ? error.message : "Não foi possível entrar agora. Tente novamente.";
      // Só senha/e-mail errados contam para o limite (não falhas de conexão).
      if (/incorretos/i.test(message)) saveThrottle(registerFailure(loadThrottle(), email, Date.now()));
      setErrors({ _form: message });
      resetTurnstile();
      setPending(false);
    }
  }

  return (
    <form className="login-form" onSubmit={submit} noValidate>
      <div className="form-heading">
        <p className="eyebrow">Que bom ter você de volta</p>
        <h2>Entre na sua conta</h2>
        <p>{returnTo ? "Depois de entrar, você volta para onde estava." : "Use o e-mail e a senha do seu cadastro."}</p>
      </div>
      <ErrorSummary errors={errors} title="Não foi possível entrar" />
      <Field name="email" label="E-mail" error={errors.email}>
        {(props) => (
          <span className="input-wrap">
            <Mail size={18} className="input-icon" />
            <input {...props} name="email" type="email" autoComplete="username" inputMode="email" maxLength={254}
              className="with-icon" placeholder="voce@exemplo.com" onInput={() => clear("email")} />
          </span>
        )}
      </Field>
      <Field name="password" label="Senha" error={errors.password}>
        {(props) => <PasswordInput id={props.id} name="password" autoComplete="current-password" placeholder="Sua senha" invalid={props["aria-invalid"]} describedBy={props["aria-describedby"]} />}
      </Field>
      <div className="login-row">
        <label className="remember-device">
          <input type="checkbox" name="remember" className="check" defaultChecked={rememberDeviceDefault()}
            aria-describedby="lembrar-ajuda" />
          <span>Manter conectado neste aparelho</span>
        </label>
        <button type="button" className="link-button" onClick={onRecover}>Esqueci minha senha</button>
      </div>
      <p className="remember-help" id="lembrar-ajuda">
        Desmarcado, você sai ao fechar o navegador ou após 30 min sem uso. Em computador compartilhado, deixe desmarcado.
      </p>
      <TurnstileWidget />
      <button className="primary-button" disabled={pending} aria-busy={pending}>
        {pending && <Loader2 size={18} className="spin" />}{pending ? "Entrando…" : "Entrar"}
      </button>
      <p className="form-switch">Ainda não tem conta? <button type="button" className="link-button" onClick={onRegister}>Criar conta</button></p>
      <Dialog open={pendingDeletion !== null} onClose={() => setPendingDeletion(null)} labelledBy="conta-exclusao-titulo"
        className="account-pending-dialog" closeLabel="Fechar">
        {pendingDeletion && (
          <div className="account-pending-body">
            <h2 id="conta-exclusao-titulo">Sua conta está em processo de exclusão</h2>
            <p>Ela foi desativada a seu pedido e será excluída definitivamente em <strong>{pendingDeletion.date}</strong>.</p>
            <p>
              Para reativá-la antes dessa data, envie um e-mail para{" "}
              {siteConfig.supportEmail ? <strong>{siteConfig.supportEmail}</strong> : "o atendimento da Artenós"} a partir do endereço da conta.
            </p>
            <div className="account-pending-actions">
              {siteConfig.supportEmail && (
                <a className="an-btn" href={reactivationMailto(siteConfig.supportEmail, pendingDeletion.email)}>Enviar e-mail</a>
              )}
              <button type="button" className="an-btn an-btn--ghost" onClick={() => setPendingDeletion(null)}>Fechar</button>
            </div>
          </div>
        )}
      </Dialog>
    </form>
  );
}

function RecoveryForm({ onBack }: { onBack: () => void }) {
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [sentTo, setSentTo] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const found = validateRecovery(values);
    if (Object.keys(found).length) {
      setErrors(found);
      return;
    }
    setErrors({});
    setPending(true);
    const email = String(values.email).trim().toLowerCase();
    try {
      const { error } = await getSupabase().auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/redefinir-senha`,
        captchaToken: captchaFrom(values),
      });
      resetTurnstile();
      if (error && /rate|limit|many/i.test(error.message)) {
        setErrors({ _form: "Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente." });
        return;
      }
      if (error && /fetch|network/i.test(error.message)) throw error;
      // Mesma resposta para e-mails cadastrados ou não: não revela contas.
      setSentTo(email);
    } catch {
      setErrors({ _form: "Não foi possível conectar agora. Confira sua internet e tente novamente." });
    } finally {
      setPending(false);
    }
  }

  if (sentTo)
    return (
      <div className="success-state" role="status">
        <span className="success-icon"><Mail size={26} /></span>
        <h2>Confira seu e-mail</h2>
        <p>Se houver uma conta Artenós com <strong>{sentTo}</strong>, você vai receber um link para criar uma nova senha. Ele vale por tempo limitado; confira também o spam.</p>
        <div className="form-actions"><button type="button" className="secondary-button" onClick={onBack}>Voltar para o login</button></div>
      </div>
    );

  return (
    <form className="recovery-form" onSubmit={submit} noValidate>
      <button type="button" className="link-button recovery-back" onClick={onBack}><ArrowLeft size={14} /> Voltar para o login</button>
      <div className="form-heading">
        <p className="eyebrow">Recuperar acesso</p>
        <h2>Esqueceu a senha?</h2>
        <p>Informe o e-mail da sua conta e enviaremos um link para criar uma nova senha.</p>
      </div>
      <ErrorSummary errors={errors} title="Revise o e-mail" />
      <Field name="email" label="E-mail" error={errors.email}>
        {(props) => (
          <span className="input-wrap">
            <Mail size={18} className="input-icon" />
            <input {...props} name="email" type="email" autoComplete="email" inputMode="email" className="with-icon"
              placeholder="voce@exemplo.com" data-autofocus />
          </span>
        )}
      </Field>
      <TurnstileWidget />
      <button className="primary-button" disabled={pending} aria-busy={pending}>
        {pending && <Loader2 size={18} className="spin" />}{pending ? "Enviando…" : "Enviar link"}
      </button>
    </form>
  );
}

const SESSION_REASONS: Record<string, string> = {
  inatividade: "Por segurança, sua sessão foi encerrada depois de um tempo sem uso. Entre de novo para continuar.",
  expirada: "Sua sessão expirou ou foi encerrada em outro aparelho. Entre de novo para continuar.",
  todos: "Você saiu da conta em todos os aparelhos.",
  saiu: "Você saiu da sua conta.",
};

function AccessContent() {
  const params = useSearchParams();
  const tabsId = useId();
  const initial = TABS.find((tab) => tab.param === params.get("aba"))?.id ?? "login";
  const [tab, setTab] = useState<Tab>(initial);
  const [recovering, setRecovering] = useState(false);
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({ login: null, client: null, artisan: null });
  // `retorno` é aceito por compatibilidade com links antigos de mensagens.
  const returnTo = safeReturnPath(params.get("voltar") ?? params.get("retorno"));
  // Por que a sessão terminou (definido pelo controle de sessão).
  const reason = SESSION_REASONS[params.get("motivo") ?? ""];

  function choose(next: Tab, focus = false) {
    setTab(next);
    setRecovering(false);
    const url = new URL(window.location.href);
    url.searchParams.set("aba", TABS.find((item) => item.id === next)!.param);
    window.history.replaceState(null, "", url.pathname + url.search);
    if (focus) tabRefs.current[next]?.focus();
  }

  function onTabKey(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    const keys: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1 };
    if (event.key in keys) {
      event.preventDefault();
      choose(TABS[(index + keys[event.key] + TABS.length) % TABS.length].id, true);
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      choose(TABS[event.key === "Home" ? 0 : TABS.length - 1].id, true);
    }
  }

  return (
    <main id="conteudo" tabIndex={-1} className="access-shell">
      <aside className="brand-panel" aria-label="Sobre a Artenós">
        <div className="brand-copy">
          <span className="kicker">Feito à mão. Encontrado aqui.</span>
          <p className="brand-title">Um lugar para criar conexões que têm alma.</p>
          <p>Descubra peças únicas ou leve o seu trabalho artesanal para pessoas que valorizam cada detalhe.</p>
          <ul className="trust-list">
            <li><Store size={18} /> Lojas analisadas pela equipe</li>
            <li><MapPin size={18} /> Talentos de todo o Brasil</li>
            <li><ShieldCheck size={18} /> Pagamento via Mercado Pago</li>
          </ul>
        </div>
      </aside>
      <section className="auth-panel">
        <div className="auth-tabs">
          <h1 className="an-visually-hidden">Entrar ou criar conta na Artenós</h1>
          {reason && (
            <div className="an-alert an-alert--info session-reason" role="status">
              <ShieldCheck size={18} /><span>{reason}</span>
            </div>
          )}
          <div className="tab-list" role="tablist" aria-label="Acesso e cadastro">
            {TABS.map((item, index) => (
              <button key={item.id} ref={(node) => { tabRefs.current[item.id] = node; }} type="button" role="tab"
                id={`${tabsId}-${item.id}`} aria-controls={`${tabsId}-painel`} aria-selected={tab === item.id}
                tabIndex={tab === item.id ? 0 : -1} onClick={() => choose(item.id)} onKeyDown={(event) => onTabKey(event, index)}>
                {item.label}
              </button>
            ))}
          </div>
          <div role="tabpanel" id={`${tabsId}-painel`} aria-labelledby={`${tabsId}-${tab}`}>
            {tab === "login" ? (
              recovering
                ? <RecoveryForm onBack={() => setRecovering(false)} />
                : <LoginForm returnTo={returnTo} onRecover={() => setRecovering(true)} onRegister={() => choose("client", true)} />
            ) : (
              <RegisterForm key={tab} type={tab} onGoToLogin={() => choose("login", true)} />
            )}
          </div>
        </div>
        <p className="footer-links">
          Precisa de ajuda para montar sua loja? Escolha <strong>Vender</strong> e peça o cadastro assistido. <Link href="/termos">Termos</Link> · <Link href="/privacidade">Privacidade</Link>
        </p>
      </section>
    </main>
  );
}

export default function AccessPage() {
  return (
    <div className="store-page access-page">
      <Suspense fallback={<main className="access-shell" />}>
        <AccessContent />
      </Suspense>
    </div>
  );
}
