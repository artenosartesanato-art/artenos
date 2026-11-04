"use client";

import Script from "next/script";

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

declare global {
  interface Window { turnstile?: { reset: (widget?: string | HTMLElement) => void } }
}

/**
 * Verificação anti-robô (Cloudflare Turnstile) dentro de um <form>: o token vai
 * no campo "cf-turnstile-response". Só aparece se NEXT_PUBLIC_TURNSTILE_SITE_KEY
 * existir. No login e no cadastro o token segue para o Supabase Auth (ative
 * "CAPTCHA protection" com Turnstile no painel do Supabase com a mesma chave).
 */
export function TurnstileWidget() {
  if (!SITE_KEY) return null;
  return (
    <>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer />
      <div className="cf-turnstile" data-sitekey={SITE_KEY} data-language="pt-br" />
    </>
  );
}

/** Um token só vale uma vez: renova depois de cada tentativa. */
export function resetTurnstile() {
  try { window.turnstile?.reset(); } catch { /* widget ausente */ }
}
