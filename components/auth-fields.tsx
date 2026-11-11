"use client";

// Campos do cadastro compartilhados por /acesso (cadastro tradicional) e
// /concluir-cadastro (conclusão do cadastro com Google): mesmos rótulos,
// máscaras, mensagens de erro e consulta de CEP.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, Check, Eye, EyeOff, Loader2, LockKeyhole } from "@/components/icons";
import { checkPassword, PASSWORD_LEVEL_LABEL, PASSWORD_RULES } from "@/lib/password-policy";
import type { FieldErrors } from "@/lib/registration-validation";
import { STORE_SPECIALTIES } from "@/lib/store-specialties";

export const specialties = STORE_SPECIALTIES;
export const FIELD_LABELS: Record<string, string> = {
  fullName: "Nome completo", storeName: "Nome da loja", specialty: "Especialidade", specialtyOther: "Sua especialidade", document: "Documento",
  phone: "Telefone", cep: "CEP", address: "Endereço", number: "Número", city: "Cidade", state: "Estado",
  email: "E-mail", password: "Senha", confirmPassword: "Confirmação da senha", story: "História da loja",
  terms: "Termos de Uso",
};

export const digits = (value: string) => value.replace(/\D/g, "");
export const maskCep = (value: string) => digits(value).slice(0, 8).replace(/(\d{5})(\d)/, "$1-$2");
export const maskPhone = (value: string) =>
  digits(value).slice(0, 11).replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d)/, "$1-$2");
export function maskDocument(value: string) {
  const number = digits(value).slice(0, 14);
  return number.length <= 11
    ? number.replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2")
    : number.replace(/(\d{2})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1/$2").replace(/(\d{4})(\d{1,2})$/, "$1-$2");
}

/** Campo com rótulo visível, dica e erro associados por aria-describedby. */
export function Field({ name, label, error, hint, wide = false, children }: {
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

export function PasswordInput({ id, name, autoComplete, invalid, describedBy, placeholder, showStrength = false, onValueChange }: {
  id: string; name: string; autoComplete: string; invalid?: true; describedBy?: string; placeholder?: string;
  /** Mostra o medidor de 4 barras e a lista de critérios (senha nova). */
  showStrength?: boolean;
  onValueChange?: (value: string) => void;
}) {
  const [visible, setVisible] = useState(false);
  const [value, setValue] = useState("");
  const strengthId = `${id}-forca`;
  return (
    <>
      <span className="input-wrap">
        <LockKeyhole size={18} className="input-icon" />
        <input id={id} name={name} type={visible ? "text" : "password"} autoComplete={autoComplete}
          className="with-icon with-action" aria-invalid={invalid}
          aria-describedby={[describedBy, showStrength ? strengthId : ""].filter(Boolean).join(" ") || undefined}
          placeholder={placeholder}
          onChange={(event) => { setValue(event.currentTarget.value); onValueChange?.(event.currentTarget.value); }} />
        <button type="button" className="icon-button" onClick={() => setVisible(!visible)}
          aria-label={visible ? "Ocultar senha" : "Mostrar senha"} aria-pressed={visible}>
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </span>
      {showStrength && <PasswordStrength id={strengthId} password={value} />}
    </>
  );
}

/**
 * Medidor de força: 4 barras que vão se completando (minúscula, maiúscula,
 * número e símbolo; a última só acende com o tamanho mínimo) e a lista dos
 * critérios obrigatórios, marcados conforme a pessoa digita.
 */
export function PasswordStrength({ id, password }: { id?: string; password: string }) {
  const check = checkPassword(password);
  return (
    <div className={`password-strength is-${check.level}`} id={id}>
      <div className="password-strength-bars" aria-hidden="true">
        {[1, 2, 3, 4].map((bar) => <span key={bar} className={bar <= check.bars ? "is-on" : undefined} />)}
      </div>
      <p className="password-strength-label" aria-live="polite">
        {PASSWORD_LEVEL_LABEL[check.level]}
        <span className="an-visually-hidden"> ({check.score} de {PASSWORD_RULES.length} critérios atendidos)</span>
      </p>
      <ul className="password-strength-rules">
        {PASSWORD_RULES.map((rule) => (
          <li key={rule.id} className={check.passed[rule.id] ? "is-ok" : undefined}>
            <span className="password-rule-mark" aria-hidden="true">{check.passed[rule.id] ? <Check size={12} /> : null}</span>
            {rule.label}
            <span className="an-visually-hidden">{check.passed[rule.id] ? ": atendido" : ": pendente"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ErrorSummary({ errors, title = "Revise os campos destacados" }: { errors: FieldErrors; title?: string }) {
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

export function AddressFields({ errors, onClear }: { errors: FieldErrors; onClear: (name: string) => void }) {
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
