"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Clock3 } from "@/components/icons";
import { useMarketplace } from "@/components/marketplace-state";
import { Dialog } from "@/components/ui/dialog";
import { getSupabase } from "@/lib/supabase";
import { adminRedirectFor } from "@/lib/navigation";
import {
  clearExpectedSignOut, endSession, expectedSignOut, idleLimitMs, isProtectedPath, lastActivity, markActivity,
  rememberDevice, ACTIVITY_KEY, IDLE_WARNING_MS,
} from "@/lib/session";

const ACTIVITY_EVENTS = ["pointerdown", "keydown", "scroll", "touchstart"] as const;

/**
 * Controle de sessão para o site todo (montado no SiteChrome):
 * inatividade com aviso, sessão expirada/encerrada em outra aba ou aparelho,
 * e retorno ao login explicando o motivo.
 */
export function SessionGuard() {
  const { userId, isAdmin } = useMarketplace();
  const router = useRouter();
  const pathname = usePathname();
  const pathRef = useRef(pathname);
  const [admin, setAdmin] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const endingRef = useRef(false);
  // Limite atual, lido pelo ouvinte de saída (fora do ciclo de render).
  const limitRef = useRef<number | null>(null);

  useEffect(() => { pathRef.current = pathname; }, [pathname]);

  // A equipe não tem perfil de comprador nem loja: essas páginas abririam vazias.
  useEffect(() => {
    const target = isAdmin ? adminRedirectFor(pathname) : null;
    if (target) router.replace(target);
  }, [isAdmin, pathname, router]);

  const goToLogin = useCallback((reason: string) => {
    const back = pathRef.current + window.location.search;
    router.replace(`/acesso?motivo=${reason}&voltar=${encodeURIComponent(back)}`);
  }, [router]);

  // Sessão encerrada sem a pessoa pedir (token expirado, saída em outra aba
  // ou "sair de todos os aparelhos"): explica e leva ao login.
  // Conta com sessão nesta aba (para distinguir um login novo de uma volta à aba).
  const sessionUserRef = useRef<string | null>(null);
  useEffect(() => {
    const { data } = getSupabase().auth.onAuthStateChange((event, session) => {
      const previous = sessionUserRef.current;
      sessionUserRef.current = session?.user?.id ?? null;
      // Login novo (não havia conta nesta aba) ou link de redefinir senha: conta
      // como atividade. Sem isso, a última atividade guardada da sessão anterior
      // (horas atrás) fazia o controle abaixo encerrar a sessão recém-aberta
      // "por inatividade" — o loop de login. Ao voltar para a aba o Supabase
      // também emite SIGNED_IN, mas aí a conta já era conhecida e nada muda.
      if ((event === "SIGNED_IN" && !previous && session) || event === "PASSWORD_RECOVERY") markActivity(true);
      if (event !== "SIGNED_OUT") return;
      setSecondsLeft(null);
      if (expectedSignOut()) {
        clearExpectedSignOut();
        return;
      }
      // Outra aba saiu por inatividade antes desta: mesmo motivo.
      const idleOut = limitRef.current !== null && Date.now() - lastActivity() >= limitRef.current;
      if (isProtectedPath(pathRef.current)) goToLogin(idleOut ? "inatividade" : "expirada");
      else toast.info("Sua sessão foi encerrada. Entre de novo quando quiser.");
    });
    return () => data.subscription.unsubscribe();
  }, [goToLogin]);

  // Confere no servidor se a sessão ainda existe (ex.: "sair de todos os
  // aparelhos" em outro lugar). Sem isso, o token antigo valeria até 1 h.
  useEffect(() => {
    if (!userId) return;
    let checking = false;
    const validate = async () => {
      if (checking || document.visibilityState !== "visible") return;
      checking = true;
      try {
        const { error } = await getSupabase().auth.getUser();
        if (error && (error.status === 401 || error.status === 403 || /session/i.test(error.code ?? ""))) {
          await endSession("local");
          if (isProtectedPath(pathRef.current)) goToLogin("expirada");
          else toast.info("Sua sessão foi encerrada. Entre de novo quando quiser.");
        }
      } finally {
        checking = false;
      }
    };
    const onVisible = () => { if (document.visibilityState === "visible") void validate(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    const timer = window.setInterval(() => void validate(), 5 * 60_000);
    void validate();
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.clearInterval(timer);
    };
  }, [userId, goToLogin]);

  // Contas administrativas têm limite de inatividade menor.
  useEffect(() => {
    let active = true;
    if (!userId) {
      queueMicrotask(() => { if (active) setAdmin(false); });
      return () => { active = false; };
    }
    void Promise.resolve(getSupabase().rpc("is_active_admin"))
      .then(({ data }) => { if (active) setAdmin(data === true); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [userId]);

  const signOutIdle = useCallback(async () => {
    if (endingRef.current) return;
    endingRef.current = true;
    setSecondsLeft(null);
    await endSession("local");
    endingRef.current = false;
    goToLogin("inatividade");
  }, [goToLogin]);

  // Inatividade: atividade registrada em todas as abas; aviso 1 min antes.
  useEffect(() => {
    if (!userId) return;
    const limit = idleLimitMs({ admin, remember: rememberDevice() });
    limitRef.current = limit;
    if (limit === null) return;
    const onActivity = () => markActivity();
    ACTIVITY_EVENTS.forEach((name) => window.addEventListener(name, onActivity, { passive: true }));
    const tick = () => {
      const idle = Date.now() - lastActivity();
      if (idle >= limit) void signOutIdle();
      else if (idle >= limit - IDLE_WARNING_MS) setSecondsLeft(Math.ceil((limit - idle) / 1000));
      else setSecondsLeft(null);
    };
    const onStorage = (event: StorageEvent) => { if (event.key === ACTIVITY_KEY) tick(); };
    window.addEventListener("storage", onStorage);
    const timer = window.setInterval(tick, 1000);
    tick();
    return () => {
      ACTIVITY_EVENTS.forEach((name) => window.removeEventListener(name, onActivity));
      window.removeEventListener("storage", onStorage);
      window.clearInterval(timer);
    };
  }, [userId, admin, signOutIdle]);

  return (
    <Dialog open={secondsLeft !== null} onClose={() => { markActivity(true); setSecondsLeft(null); }}
      labelledBy="sessao-titulo" describedBy="sessao-texto" className="session-dialog" closeButton={false}>
      <div className="session-dialog-body">
        <span className="session-dialog-icon" aria-hidden="true"><Clock3 size={26} /></span>
        <h2 id="sessao-titulo">Você ainda está aí?</h2>
        <p id="sessao-texto" aria-live="polite">
          Por segurança, sua sessão termina em <strong>{secondsLeft ?? 0} s</strong> por falta de uso.
        </p>
        <div className="session-dialog-actions">
          <button type="button" className="an-btn an-btn--block" data-autofocus
            onClick={() => { markActivity(true); setSecondsLeft(null); }}>
            Continuar conectado
          </button>
          <button type="button" className="an-btn an-btn--ghost an-btn--block" onClick={() => void signOutIdle()}>
            Sair agora
          </button>
        </div>
      </div>
    </Dialog>
  );
}
