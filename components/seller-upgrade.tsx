"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Clock3, LoaderCircle, Store } from "@/components/icons";
import { getSupabase } from "@/lib/supabase";
import { findBlockedTerm } from "@/lib/moderation";
import { playUiSound } from "@/lib/ui-sound";
import { specialtyValueError } from "@/lib/store-specialties";
import { SpecialtyField } from "@/components/specialty-field";

type SellerRequest = {
  status: "pending_review" | "under_review" | "changes_requested" | "approved" | "rejected" | "suspended" | null;
  submission_type: string | null; decision_reason: string | null; submitted_at: string | null;
  store_name: string | null; specialty: string | null; story: string | null; is_seller: boolean;
};

const dateFormat = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

/**
 * "Venda na Artenós" no perfil do cliente: abre a loja na MESMA conta (sem novo
 * cadastro). Durante a análise a pessoa continua cliente; aprovada, a conta
 * vira vendedora com compras, favoritos e mensagens preservados.
 */
export function SellerUpgrade() {
  const [request, setRequest] = useState<SellerRequest | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [storeName, setStoreName] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [story, setStory] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const sectionRef = useRef<HTMLElement>(null);

  const load = useCallback(async () => {
    const { data, error: loadError } = await getSupabase().rpc("get_my_seller_request");
    const row = (Array.isArray(data) ? data[0] : data) as SellerRequest | undefined;
    if (!loadError && row) {
      setRequest(row);
      setStoreName(row.store_name ?? "");
      setSpecialty(row.specialty ?? "");
      setStory(row.story ?? "");
    }
    setLoaded(true);
  }, []);

  useEffect(() => { queueMicrotask(() => void load()); }, [load]);

  // Veio de "Venda na Artenós" (?loja=1): rola até aqui e abre o formulário.
  useEffect(() => {
    if (!loaded || new URLSearchParams(window.location.search).get("loja") !== "1") return;
    sectionRef.current?.scrollIntoView({ block: "start" });
    if (!request?.status || request.status === "rejected" || request.status === "changes_requested") {
      queueMicrotask(() => setFormOpen(true));
    }
  }, [loaded, request?.status]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) return;
    const specialtyProblem = specialtyValueError(specialty);
    if (specialtyProblem) return setError(specialtyProblem);
    if (findBlockedTerm(`${storeName} ${specialty} ${story}`)) return setError("Os dados da loja contêm termos que não são permitidos na Artenós.");
    setSending(true);
    setError("");
    const { error: sendError } = await getSupabase().rpc("request_seller_profile", {
      p_store_name: storeName.trim(), p_specialty: specialty.trim(), p_story: story.trim(),
    });
    setSending(false);
    if (sendError) return setError(sendError.message || "Não foi possível enviar agora. Tente de novo.");
    playUiSound("success");
    toast.success("Pedido de loja enviado.", { description: "Enquanto a equipe analisa, sua conta continua funcionando normalmente." });
    setFormOpen(false);
    await load();
  }

  if (!loaded) return null;
  const status = request?.status ?? null;
  const inReview = status === "pending_review" || status === "under_review";
  const canSend = !status || status === "rejected" || status === "changes_requested";

  return (
    <section ref={sectionRef} id="abrir-loja" className="profile-card profile-card-wide seller-upgrade" aria-labelledby="abrir-loja-titulo">
      <div className="profile-card-title">
        <Store size={20} />
        <h2 id="abrir-loja-titulo">Venda na Artenós</h2>
      </div>

      {inReview && (
        <div className="seller-upgrade-status is-review" role="status">
          <Clock3 size={18} />
          <div>
            <strong>{request?.store_name || "Sua loja"} está em análise</strong>
            <span>
              Pedido enviado {request?.submitted_at ? `em ${dateFormat.format(new Date(request.submitted_at))}` : "há pouco"}.
              Enquanto isso, você continua comprando normalmente. Quando a equipe aprovar, esta mesma conta ganha o painel da loja.
            </span>
          </div>
        </div>
      )}
      {status === "changes_requested" && (
        <div className="seller-upgrade-status is-attention" role="status">
          <strong>A equipe pediu ajustes na sua loja</strong>
          {request?.decision_reason && <span>{request.decision_reason}</span>}
        </div>
      )}
      {status === "rejected" && (
        <div className="seller-upgrade-status is-attention" role="status">
          <strong>O pedido de loja não foi aprovado</strong>
          {request?.decision_reason && <span>{request.decision_reason}</span>}
          <span>Você pode ajustar os dados e enviar de novo.</span>
        </div>
      )}
      {status === "suspended" && (
        <div className="seller-upgrade-status is-attention" role="status">
          <strong>Sua loja está suspensa</strong>
          <span>{request?.decision_reason || "Fale com o atendimento da Artenós para saber como reativar."}</span>
        </div>
      )}

      {canSend && !formOpen && (
        <>
          <p className="profile-card-help">
            Abra sua loja usando os dados desta conta (nome, CPF, e-mail e endereço). Suas compras, favoritos e mensagens
            continuam aqui; a equipe analisa a loja antes de ela aparecer na vitrine.
          </p>
          <button type="button" className="an-btn" onClick={() => setFormOpen(true)}>
            <Store size={16} /> {status ? "Enviar de novo" : "Abrir minha loja"}
          </button>
        </>
      )}

      {canSend && formOpen && (
        <form className="seller-upgrade-form" onSubmit={submit} noValidate>
          <label className="an-field">
            <span>Nome da loja</span>
            <input value={storeName} onChange={(event) => setStoreName(event.target.value)} maxLength={80} required
              placeholder="Ex.: Ateliê da Ana" data-autofocus />
          </label>
          <SpecialtyField value={specialty} onChange={setSpecialty} labelClassName="an-field" label="Especialidade" />
          <label className="an-field">
            <span>História da loja</span>
            <textarea value={story} onChange={(event) => setStory(event.target.value)} rows={4} maxLength={1200} required
              placeholder="Conte como você começou, as técnicas e os materiais que usa (pelo menos 40 caracteres)." />
            <small className="seller-upgrade-count">{story.trim().length} caracteres</small>
          </label>
          {error && <p className="an-field-error" role="alert">{error}</p>}
          <div className="seller-upgrade-actions">
            <button type="button" className="an-btn an-btn--ghost" onClick={() => { setFormOpen(false); setError(""); }} disabled={sending}>Cancelar</button>
            <button type="submit" className="an-btn" disabled={sending} aria-busy={sending}>
              {sending && <LoaderCircle size={16} className="spin" />} Enviar para análise
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
