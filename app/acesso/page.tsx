"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
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
import { StandaloneCustomerHeader } from "@/components/standalone-customer-header";
import { favoriteIntentReturnPath } from "@/components/marketplace-state";
import { BrandLogo } from "@/components/brand-logo";
import {
  loginWithSupabase,
  registerWithSupabase,
  validBrazilianPhone,
} from "@/lib/supabase";
import "../storefront.css";

type AccountType = "client" | "artisan";
type Tab = "login" | AccountType;
const specialties = [
  "Crochê e tricô",
  "Cerâmica",
  "Costura criativa",
  "Joias e acessórios",
  "Papelaria",
  "Decoração",
  "Cosméticos naturais",
  "Outro",
];
const digits = (value: string) => value.replace(/\D/g, "");
const maskCep = (value: string) =>
  digits(value)
    .slice(0, 8)
    .replace(/(\d{5})(\d)/, "$1-$2");
const maskPhone = (value: string) =>
  digits(value)
    .slice(0, 11)
    .replace(/(\d{2})(\d)/, "($1) $2")
    .replace(/(\d{5})(\d)/, "$1-$2");
function maskDocument(value: string) {
  const number = digits(value).slice(0, 14);
  return number.length <= 11
    ? number
        .replace(/(\d{3})(\d)/, "$1.$2")
        .replace(/(\d{3})(\d)/, "$1.$2")
        .replace(/(\d{3})(\d{1,2})$/, "$1-$2")
    : number
        .replace(/(\d{2})(\d)/, "$1.$2")
        .replace(/(\d{3})(\d)/, "$1.$2")
        .replace(/(\d{3})(\d)/, "$1/$2")
        .replace(/(\d{4})(\d{1,2})$/, "$1-$2");
}

function handlePhoneChange(event: React.ChangeEvent<HTMLInputElement>) {
  event.currentTarget.setCustomValidity("");
  event.currentTarget.value = maskPhone(event.currentTarget.value);
}

function validatePhoneField(event: React.FocusEvent<HTMLInputElement>) {
  const input = event.currentTarget;
  input.setCustomValidity(
    validBrazilianPhone(input.value)
      ? ""
      : "Informe um telefone brasileiro válido, com DDD. Celulares devem começar com 9.",
  );
  if (input.validationMessage) input.reportValidity();
}

function PasswordField({
  name,
  label,
  autoComplete = "new-password",
}: {
  name: string;
  label: string;
  autoComplete?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <label className="field">
      <span>{label}</span>
      <span className="input-wrap">
        <input
          name={name}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          minLength={8}
          required
          placeholder="Mínimo de 8 caracteres"
        />
        <button
          type="button"
          className="icon-button"
          onClick={() => setVisible(!visible)}
          aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
        >
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </span>
    </label>
  );
}

function AddressFields() {
  const [loading, setLoading] = useState(false);
  const lastCep = useRef("");

  async function lookupCep(input: HTMLInputElement) {
    const cep = digits(input.value);
    if (cep.length !== 8 || cep === lastCep.current) return;
    const form = input.form;
    lastCep.current = cep;
    setLoading(true);
    try {
      const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      if (!response.ok) throw new Error();
      const data = await response.json();
      if (data.erro) throw new Error();
      if (form) {
        (form.elements.namedItem("address") as HTMLInputElement).value =
          data.logradouro || "";
        (form.elements.namedItem("city") as HTMLInputElement).value =
          data.localidade || "";
        (form.elements.namedItem("state") as HTMLInputElement).value =
          data.uf || "";
      }
    } catch {
      lastCep.current = "";
      toast.error("Não encontramos esse CEP. Preencha o endereço manualmente.");
    } finally {
      setLoading(false);
    }
  }

  function handleCepChange(event: React.ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    input.value = maskCep(input.value);
    if (digits(input.value).length === 8) void lookupCep(input);
  }
  return (
    <>
      <label className="field">
        <span>CEP</span>
        <span className="input-wrap">
          <input
            name="cep"
            inputMode="numeric"
            autoComplete="postal-code"
            required
            placeholder="00000-000"
            onChange={handleCepChange}
            onBlur={(event) => void lookupCep(event.currentTarget)}
          />
          {loading && <Loader2 size={17} className="spin input-status" />}
        </span>
      </label>
      <label className="field field-wide">
        <span>Endereço</span>
        <input
          name="address"
          autoComplete="street-address"
          required
          placeholder="Rua, avenida ou estrada"
        />
      </label>
      <label className="field">
        <span>Número</span>
        <input name="number" required placeholder="123 ou s/n" />
      </label>
      <label className="field">
        <span>Cidade</span>
        <input name="city" required placeholder="Sua cidade" />
      </label>
      <label className="field">
        <span>Estado</span>
        <input
          name="state"
          required
          maxLength={2}
          placeholder="UF"
          onInput={(event) =>
            (event.currentTarget.value =
              event.currentTarget.value.toUpperCase())
          }
        />
      </label>
    </>
  );
}

function RegisterForm({ type }: { type: AccountType }) {
  const [pending, setPending] = useState<"standard" | "assisted" | null>(null);
  const [done, setDone] = useState(false);
  async function submit(form: HTMLFormElement, assisted = false) {
    const values = Object.fromEntries(new FormData(form));
    if (values.password !== values.confirmPassword)
      return toast.error("As senhas precisam ser iguais.");
    setPending(assisted ? "assisted" : "standard");
    try {
      const result = await registerWithSupabase({ ...values, type, assisted });
      form.reset();
      setDone(true);
      toast.success(result.message);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Tente novamente em instantes.",
      );
    } finally {
      setPending(null);
    }
  }
  if (done)
    return (
      <div className="success-state">
        <span className="success-icon">
          <ShieldCheck size={28} />
        </span>
        <h2>
          {type === "artisan" ? "Solicitação recebida" : "Cadastro concluído"}
        </h2>
        <p>
          {type === "artisan"
            ? "Nossa equipe vai analisar seus dados e entrar em contato pelo telefone ou e-mail informado."
            : "Sua conta Artenós está pronta. Você já pode entrar com seu e-mail e senha."}
        </p>
        <button className="secondary-button" onClick={() => setDone(false)}>
          Cadastrar outra conta
        </button>
      </div>
    );
  return (
    <form
      className="register-form"
      onSubmit={(event) => {
        event.preventDefault();
        void submit(event.currentTarget);
      }}
    >
      <div className="form-heading">
        <p className="eyebrow">
          {type === "client"
            ? "Para quem valoriza o feito à mão"
            : "Para quem transforma talento em negócio"}
        </p>
        <h2>
          {type === "client" ? "Crie sua conta" : "Abra sua loja na Artenós"}
        </h2>
        <p>
          {type === "client"
            ? "Salve seus dados e acompanhe suas próximas descobertas."
            : "Conte sobre o seu trabalho. A equipe Artenós revisará sua solicitação."}
        </p>
      </div>
      <div className="fields-grid">
        <label className="field field-wide">
          <span>Nome completo</span>
          <input
            name="fullName"
            autoComplete="name"
            required
            placeholder="Como aparece no documento"
          />
        </label>
        {type === "artisan" && (
          <>
            <label className="field">
              <span>Nome da loja</span>
              <input
                name="storeName"
                required
                placeholder="Nome da sua marca"
              />
            </label>
            <label className="field">
              <span>Especialidade principal</span>
              <select name="specialty" required defaultValue="">
                <option value="" disabled>
                  Selecione
                </option>
                {specialties.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
          </>
        )}
        <label className="field">
          <span>{type === "artisan" ? "CPF ou CNPJ" : "CPF"}</span>
          <input
            name="document"
            inputMode="numeric"
            required
            placeholder={type === "artisan" ? "CPF ou CNPJ" : "000.000.000-00"}
            onChange={(event) =>
              (event.target.value = maskDocument(event.target.value))
            }
          />
        </label>
        <label className="field">
          <span>Telefone</span>
          <input
            name="phone"
            type="tel"
            autoComplete="tel-national"
            inputMode="tel"
            required
            maxLength={15}
            placeholder="(00) 00000-0000"
            title="Informe um telefone brasileiro válido, com DDD"
            onChange={handlePhoneChange}
            onBlur={validatePhoneField}
          />
        </label>
        <AddressFields />
        <label className="field field-wide">
          <span>E-mail</span>
          <input
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            required
            maxLength={254}
            pattern="[^\s@]+@[^\s@]+\.[^\s@]{2,}"
            title="Informe um e-mail completo, como nome@gmail.com"
            placeholder="voce@exemplo.com"
          />
        </label>
        <PasswordField name="password" label="Senha" />
        <PasswordField name="confirmPassword" label="Confirme sua senha" />
        {type === "artisan" && (
          <label className="field field-wide">
            <span>Conte a história da sua loja</span>
            <textarea
              name="story"
              required
              minLength={40}
              maxLength={1200}
              rows={5}
              placeholder="Como você começou, o que inspira suas peças e o que torna o seu trabalho especial?"
            />
            <small>De 40 a 1.200 caracteres.</small>
          </label>
        )}
      </div>
      <label className="consent">
        <input
          className="check"
          type="checkbox"
          name="terms"
          value="accepted"
          required
        />
        <span>
          Li e aceito os{" "}
          <a href="/termos" target="_blank">
            Termos de Uso
          </a>{" "}
          e a{" "}
          <a href="/privacidade" target="_blank">
            Política de Privacidade
          </a>
          .
        </span>
      </label>
      <div className="form-actions">
        <button className="primary-button" disabled={pending !== null}>
          {pending === "standard" && <Loader2 size={18} className="spin" />}
          {type === "artisan" ? "Enviar para análise" : "Criar minha conta"}
        </button>
        {type === "artisan" && (
          <button
            type="button"
            className="secondary-button"
            disabled={pending !== null}
            onClick={(event) => {
              const form = event.currentTarget.form;
              if (form?.reportValidity()) void submit(form, true);
            }}
          >
            {pending === "assisted" && <Loader2 size={18} className="spin" />}
            <HandHeart size={18} /> Solicitar cadastro assistido
          </button>
        )}
      </div>
    </form>
  );
}

function LoginForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [visible, setVisible] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    try {
      const result = await loginWithSupabase(
        Object.fromEntries(new FormData(event.currentTarget)),
      );
      toast.success(
        result.approvalStatus === "active"
          ? `Bem-vinda à Artenós, ${result.firstName}!`
          : `Olá, ${result.firstName}. Acompanhe aqui a análise do seu cadastro.`,
      );
      router.replace(result.approvalStatus === "active"
        ? favoriteIntentReturnPath() || result.redirectTo
        : result.redirectTo);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Tente novamente.");
    } finally {
      setPending(false);
    }
  }
  return (
    <form className="login-form" onSubmit={submit}>
      <div className="form-heading">
        <p className="eyebrow">Que bom ter você de volta</p>
        <h2>Entre na sua conta</h2>
        <p>Acesse com o e-mail usado no seu cadastro.</p>
      </div>
      <label className="field">
        <span>E-mail</span>
        <span className="input-wrap">
          <Mail size={18} className="input-icon" />
          <input
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            required
            maxLength={254}
            pattern="[^\s@]+@[^\s@]+\.[^\s@]{2,}"
            title="Informe um e-mail completo, como nome@gmail.com"
            placeholder="voce@exemplo.com"
            className="with-icon"
          />
        </span>
      </label>
      <label className="field">
        <span>Senha</span>
        <span className="input-wrap">
          <LockKeyhole size={18} className="input-icon" />
          <input
            name="password"
            type={visible ? "text" : "password"}
            autoComplete="current-password"
            required
            className="with-icon"
            placeholder="Sua senha"
          />
          <button
            type="button"
            className="icon-button"
            onClick={() => setVisible(!visible)}
            aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
          >
            {visible ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </span>
      </label>
      <div className="login-row">
        <label className="remember">
          <input
            className="check"
            type="checkbox"
            name="remember"
            value="yes"
          />{" "}
          Manter conectado
        </label>
      </div>
      <button className="primary-button" disabled={pending}>
        {pending && <Loader2 size={18} className="spin" />}Entrar
      </button>
      <p className="secure-note">
        <ShieldCheck size={16} /> Seus dados são protegidos e criptografados.
      </p>
    </form>
  );
}

export default function AccessPage() {
  const [tab, setTab] = useState<Tab>("login");
  return (<>
    <StandaloneCustomerHeader />
    <main className="site-shell auth-with-global-header">
      <aside className="brand-panel">
        <div className="brand">
          <BrandLogo variant="perola" priority />
        </div>
        <div className="brand-copy">
          <span className="kicker">Feito à mão. Encontrado aqui.</span>
          <h1>Um lugar para criar conexões que têm alma.</h1>
          <p>
            Descubra peças únicas ou leve o seu trabalho artesanal para pessoas
            que valorizam cada detalhe.
          </p>
        </div>
        <div className="trust-list">
          <span>
            <Store size={18} /> Lojas autorais verificadas
          </span>
          <span>
            <MapPin size={18} /> Talentos de todo o Brasil
          </span>
          <span>
            <ShieldCheck size={18} /> Cadastro seguro e responsável
          </span>
        </div>
        <p className="copyright">© 2026 Artenós</p>
      </aside>
      <section className="auth-panel">
        <div className="auth-tabs">
          <div
            className="tab-list"
            role="tablist"
            aria-label="Acesso e cadastro"
          >
            <button
              role="tab"
              aria-selected={tab === "login"}
              className={tab === "login" ? "active" : ""}
              onClick={() => setTab("login")}
            >
              Entrar
            </button>
            <button
              role="tab"
              aria-selected={tab === "client"}
              className={tab === "client" ? "active" : ""}
              onClick={() => setTab("client")}
            >
              Sou cliente
            </button>
            <button
              role="tab"
              aria-selected={tab === "artisan"}
              className={tab === "artisan" ? "active" : ""}
              onClick={() => setTab("artisan")}
            >
              Sou artesã
            </button>
          </div>
          <div role="tabpanel">
            {tab === "login" ? <LoginForm /> : <RegisterForm type={tab} />}
          </div>
        </div>
        <p className="footer-links">
          Atendimento humano disponível no cadastro assistido.
        </p>
      </section>
    </main>
  </>);
}
