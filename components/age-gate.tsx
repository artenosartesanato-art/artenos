"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, LogOut, ShieldCheck } from "@/components/icons";
import { Field } from "@/components/auth-fields";
import { useMarketplace } from "@/components/marketplace-state";
import { Dialog } from "@/components/ui/dialog";
import { MINIMUM_AGE, checkBirthDate, formatBirthDate, maskBirthDate } from "@/lib/birth-date";
import { endSession } from "@/lib/session";
import { getSupabase } from "@/lib/supabase";

/** Telas que continuam abertas enquanto a data não foi informada (ou a conta está bloqueada). */
const OPEN_PATHS = ["/concluir-cadastro", "/acesso", "/termos", "/privacidade", "/redefinir-senha", "/ajuda"];

type Gate = { missing: boolean; blocked: boolean; unblockOn: string | null };
const NO_GATE: Gate = { missing: false, blocked: false, unblockOn: null };

/**
 * Idade mínima (18 anos), só para lojas. Loja criada antes de a data de nascimento ser
 * obrigatória: no próximo acesso, este aviso cobre a tela e só sai depois de a
 * data ser informada. Quem declara menos de 18 fica com a conta bloqueada (o
 * banco também recusa compras, mensagens e alterações na loja).
 */
export function AgeGate() {
  const { authReady, userId, isAdmin, profileMissing } = useMarketplace();
  const pathname = usePathname();
  const router = useRouter();
  const titleId = useId();
  const [gate, setGate] = useState<Gate>(NO_GATE);
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  /** Data de menor aguardando confirmação (evita bloquear por erro de digitação). */
  const [confirmMinor, setConfirmMinor] = useState<{ iso: string; age: number } | null>(null);
  const [pending, setPending] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const load = useCallback(async () => {
    if (!userId || isAdmin || profileMissing) {
      setGate(NO_GATE);
      return;
    }
    // Sem a função no banco (migração não rodada) ou sem conexão: segue sem o aviso.
    const { data, error: loadError } = await Promise.resolve(getSupabase().rpc("get_my_age_gate"))
      .catch(() => ({ data: null, error: true }));
    const row = (Array.isArray(data) ? data[0] : data) as
      { birth_date_missing?: boolean; age_blocked?: boolean; unblock_on?: string | null } | null;
    setGate(loadError || !row ? NO_GATE
      : { missing: row.birth_date_missing === true, blocked: row.age_blocked === true, unblockOn: row.unblock_on ?? null });
  }, [userId, isAdmin, profileMissing]);

  useEffect(() => {
    if (!authReady) return;
    const timer = window.setTimeout(() => void load(), 0);
    const onProfileChanged = () => void load();
    window.addEventListener("artenos:profile-changed", onProfileChanged);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("artenos:profile-changed", onProfileChanged);
    };
  }, [authReady, load]);

  async function save(iso: string) {
    setPending(true);
    try {
      const { data, error: saveError } = await getSupabase().rpc("set_my_birth_date", { p_birth_date: iso });
      if (saveError) {
        setConfirmMinor(null);
        setError(/nascimento|cadastro|login/i.test(saveError.message)
          ? saveError.message
          : "Não foi possível salvar agora. Confira sua internet e tente novamente.");
        return;
      }
      setConfirmMinor(null);
      setValue("");
      if (data === "blocked") {
        await load();
        return;
      }
      setGate(NO_GATE);
      toast.success("Data de nascimento salva. Obrigado!");
    } catch {
      setError("Não foi possível salvar agora. Confira sua internet e tente novamente.");
    } finally {
      setPending(false);
    }
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const result = checkBirthDate(value);
    if (result.ok) {
      setError("");
      void save(result.iso);
    } else if (result.reason === "underage" && result.iso) {
      setError("");
      setConfirmMinor({ iso: result.iso, age: result.age ?? 0 });
    } else {
      setError(result.message);
    }
  }

  async function leave() {
    if (leaving) return;
    setLeaving(true);
    await endSession("local");
    setGate(NO_GATE);
    setLeaving(false);
    router.replace("/");
  }

  const open = (gate.missing || gate.blocked)
    && !OPEN_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
  const leaveButton = (
    <button type="button" className="an-btn an-btn--ghost" onClick={() => void leave()} disabled={leaving || pending}>
      {leaving ? <Loader2 size={16} className="spin" /> : <LogOut size={16} />} Sair da conta
    </button>
  );

  return (
    // Sem botão de fechar e sem fechar com Esc ou clique fora: a data é obrigatória.
    <Dialog open={open} onClose={() => undefined} labelledBy={titleId} closeButton={false} className="account-pending-dialog age-gate-dialog">
      {gate.blocked ? (
        <div className="account-pending-body" role="alert">
          <h2 id={titleId}>Conta bloqueada</h2>
          <p>
            Para vender na Artenós é preciso ter {MINIMUM_AGE} anos ou mais. Pela data de nascimento informada, esta conta fica bloqueada
            {gate.unblockOn ? <> até <strong>{formatBirthDate(gate.unblockOn)}</strong></> : null}: não é possível comprar,
            vender, favoritar ou enviar mensagens.
          </p>
          <p>Informou a data errada? Fale com o atendimento para corrigir.</p>
          <div className="account-pending-actions">
            <Link className="an-btn" href="/ajuda">Falar com o atendimento</Link>
            {leaveButton}
          </div>
        </div>
      ) : confirmMinor ? (
        <div className="account-pending-body">
          <h2 id={titleId}>Confirme sua data de nascimento</h2>
          <p>
            Você informou <strong>{formatBirthDate(confirmMinor.iso)}</strong>, o que dá{" "}
            <strong>{confirmMinor.age} {confirmMinor.age === 1 ? "ano" : "anos"}</strong>. Para vender na Artenós é preciso ter{" "}
            {MINIMUM_AGE} anos ou mais: se confirmar, a conta será bloqueada.
          </p>
          {error && <p className="field-error" role="alert">{error}</p>}
          <div className="account-pending-actions">
            <button type="button" className="an-btn" onClick={() => setConfirmMinor(null)} disabled={pending} data-autofocus>
              Corrigir a data
            </button>
            <button type="button" className="an-btn an-btn--ghost" onClick={() => void save(confirmMinor.iso)} disabled={pending}
              aria-busy={pending}>
              {pending && <Loader2 size={16} className="spin" />} A data está certa
            </button>
          </div>
        </div>
      ) : (
        <form className="account-pending-body" onSubmit={submit} noValidate>
          <h2 id={titleId}>Informe sua data de nascimento</h2>
          <p>
            <ShieldCheck size={16} aria-hidden="true" /> Para vender na Artenós é preciso ter {MINIMUM_AGE} anos ou mais.
            Para continuar usando sua loja, informe sua data de nascimento. É só uma vez.
          </p>
          <Field name="birthDateGate" label="Data de nascimento" error={error || undefined}
            hint="Dia, mês e ano. Ela não aparece para outras pessoas.">
            {(props) => (
              <input {...props} name="birthDate" inputMode="numeric" autoComplete="bday" maxLength={10} placeholder="dd/mm/aaaa"
                value={value} data-autofocus
                onChange={(event) => { setValue(maskBirthDate(event.target.value)); setError(""); }} />
            )}
          </Field>
          <div className="account-pending-actions">
            <button className="an-btn" disabled={pending} aria-busy={pending}>
              {pending && <Loader2 size={16} className="spin" />}{pending ? "Salvando…" : "Confirmar"}
            </button>
            {leaveButton}
          </div>
        </form>
      )}
    </Dialog>
  );
}
