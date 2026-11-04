"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { CONSENT_EVENT, OPEN_EVENT, readConsent, saveConsent, type CookieChoice } from "@/lib/cookie-consent";

export { openCookiePreferences } from "@/lib/cookie-consent";

function subscribe(listener: () => void) {
  window.addEventListener(CONSENT_EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(CONSENT_EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}

/** Escolha atual (null = ainda não escolheu). */
export function useCookieConsent(): CookieChoice | null {
  return useSyncExternalStore(subscribe, readConsent, () => null);
}

/**
 * Envolve scripts não essenciais (análise, publicidade): só renderiza depois
 * de "Aceitar todos". Hoje nenhum script desse tipo é usado.
 */
export function OptionalScripts({ children }: { children: ReactNode }) {
  return useCookieConsent() === "all" ? <>{children}</> : null;
}

/** Aviso de cookies, mostrado até a pessoa escolher (e reaberto pelo rodapé). */
export function CookieConsentBanner() {
  const choice = useCookieConsent();
  const [reopened, setReopened] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    queueMicrotask(() => setMounted(true));
    const open = () => setReopened(true);
    window.addEventListener(OPEN_EVENT, open);
    return () => window.removeEventListener(OPEN_EVENT, open);
  }, []);

  if (!mounted || (choice && !reopened)) return null;
  const choose = (value: CookieChoice) => { saveConsent(value); setReopened(false); };
  return (
    <section className="cookie-banner" role="region" aria-label="Aviso de cookies">
      <p>
        Usamos cookies e armazenamento do navegador <strong>essenciais</strong> para manter sua sessão, o carrinho e suas
        preferências. Não usamos cookies de publicidade. Cookies opcionais de análise só seriam usados com o seu
        consentimento. <Link href="/privacidade#cookies">Saiba mais</Link>.
      </p>
      <div className="cookie-banner-actions">
        <button type="button" className="an-btn an-btn--secondary an-btn--sm" onClick={() => choose("essential")}>Somente essenciais</button>
        <button type="button" className="an-btn an-btn--sm" onClick={() => choose("all")}>Aceitar todos</button>
      </div>
    </section>
  );
}
