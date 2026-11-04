"use client";

import Script from "next/script";
import { useState, type FormEvent } from "react";
import { CheckCircle2, LoaderCircle } from "@/components/icons";
import { useMarketplace } from "@/components/marketplace-state";
import { getSupabase } from "@/lib/supabase";
import { SUPPORT_TOPICS, validateSupport } from "@/lib/support";

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

/** Formulário de contato: grava o chamado e devolve o protocolo. */
export function SupportContact() {
  const { userId } = useMarketplace();
  const [startedAt] = useState(() => Date.now());
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [protocol, setProtocol] = useState("");
  const [orderDigits, setOrderDigits] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = {
      name: form.get("name"), email: form.get("email"), emailConfirm: form.get("emailConfirm"), topic: form.get("topic"),
      orderCode: orderDigits,
      message: form.get("message"), website: form.get("website"), startedAt,
      turnstileToken: form.get("cf-turnstile-response"),
    };
    const checked = validateSupport(payload);
    if (!checked.ok) return setError(checked.error);
    setSending(true);
    setError("");
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (userId) {
        const { data } = await getSupabase().auth.getSession();
        if (data.session) headers.Authorization = `Bearer ${data.session.access_token}`;
      }
      const response = await fetch("/api/ajuda", { method: "POST", headers, body: JSON.stringify(payload) });
      const result = (await response.json().catch(() => ({}))) as { protocol?: string; error?: string };
      if (!response.ok || !result.protocol) throw new Error(result.error || "Não foi possível enviar agora.");
      setProtocol(result.protocol);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível enviar agora.");
    } finally {
      setSending(false);
    }
  }

  if (protocol) {
    return (
      <div className="help-sent" role="status">
        <CheckCircle2 size={26} />
        <p><strong>Mensagem enviada.</strong> Seu protocolo é <strong>{protocol}</strong>. Enviamos uma confirmação para o seu e-mail.</p>
      </div>
    );
  }
  return (
    <form className="help-form" onSubmit={submit} noValidate>
      <label className="an-field"><span>Nome</span><input name="name" autoComplete="name" required maxLength={120} placeholder="Como podemos te chamar?" /></label>
      <div className="help-form-row">
        <label className="an-field"><span>E-mail para resposta</span><input name="email" type="email" autoComplete="email" required maxLength={200} placeholder="voce@exemplo.com" /></label>
        <label className="an-field"><span>Confirme o e-mail</span><input name="emailConfirm" type="email" autoComplete="off" required maxLength={200} placeholder="Digite o e-mail de novo"
          onPaste={(event) => event.preventDefault()} /></label>
      </div>
      <label className="an-field">
        <span>Assunto</span>
        <select name="topic" defaultValue="compra">
          {Object.entries(SUPPORT_TOPICS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <label className="an-field">
        <span>Número do pedido (opcional)</span>
        {/* Os pedidos da Artenós são "AN-" + números: o prefixo é fixo e o campo aceita só números. */}
        <span className="help-order-input">
          <span aria-hidden="true">AN-</span>
          <input name="orderCode" inputMode="numeric" pattern="[0-9]*" maxLength={12} placeholder="1042" value={orderDigits}
            aria-describedby="pedido-dica" onChange={(event) => setOrderDigits(event.target.value.replace(/\D/g, ""))} />
        </span>
        <small id="pedido-dica" className="help-field-hint">Está em Pedidos, no título de cada compra (ex.: Pedido AN-1042).</small>
      </label>
      <label className="an-field"><span>Mensagem</span><textarea name="message" rows={5} required minLength={10} maxLength={4000}
        placeholder="Conte o que aconteceu e como podemos ajudar." /></label>
      {/* Campo escondido: pessoas não preenchem; robôs costumam preencher. */}
      <label className="help-honeypot" aria-hidden="true">Site<input name="website" tabIndex={-1} autoComplete="off" /></label>
      {TURNSTILE_SITE_KEY && (
        <>
          <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer />
          <div className="cf-turnstile" data-sitekey={TURNSTILE_SITE_KEY} data-language="pt-br" />
        </>
      )}
      {error && <p className="an-field-error" role="alert">{error}</p>}
      <button type="submit" className="an-btn an-btn--block" disabled={sending} aria-busy={sending}>
        {sending && <LoaderCircle size={16} className="spin" />} {sending ? "Enviando…" : "Enviar mensagem"}
      </button>
      <p className="help-form-note">Usamos seus dados só para responder este chamado. Veja a <a href="/privacidade">Política de Privacidade</a>.</p>
    </form>
  );
}
