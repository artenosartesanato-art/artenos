"use client";

// Orçamentos sob encomenda (antes na tela separada /sob-encomenda):
// StoreCustomQuotes fica na página da loja e MyQuoteRequests em Pedidos.
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowRight, Clock3, MessageCircle, Palette } from "@/components/icons";
import { Dialog } from "@/components/ui/dialog";
import { OptimizedImage } from "@/components/optimized-image";
import { useMarketplace } from "@/components/marketplace-state";
import { useStorefrontActions } from "@/components/storefront-actions";
import { getSupabase } from "@/lib/supabase";
import { findBlockedTerm } from "@/lib/moderation";
import "./custom-quotes.css";

type Service = {
  id: string; artisan_id: string; title: string; description: string; image_url: string | null;
  starting_price: number | null; min_production_days: number; max_production_days: number;
};
export type QuoteRequest = {
  id: string; service_id: string; title: string; description: string; quantity: number; budget: number | null;
  desired_date: string | null; status: "pending" | "accepted" | "declined" | "cancelled"; proposed_price: number | null;
  response_message: string | null; estimated_delivery_date: string | null; created_at: string; service_title: string;
  client_name: string; artisan_name: string; my_role: "client" | "artisan";
};

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dateFormatter = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
const statusLabel: Record<QuoteRequest["status"], string> = {
  pending: "Aguardando resposta", accepted: "Aceita", declined: "Recusada", cancelled: "Cancelada",
};

function displayDate(value: string | null) {
  if (!value) return "Não informada";
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? "Não informada" : dateFormatter.format(date);
}

const errorText = (caught: unknown, fallback: string) =>
  caught instanceof Error ? caught.message
    : typeof caught === "object" && caught && "message" in caught ? String((caught as { message: unknown }).message) : fallback;

export async function openQuoteConversation(request: Pick<QuoteRequest, "id" | "my_role">) {
  try {
    const { data, error } = await getSupabase().rpc("open_custom_order_conversation", { p_request_id: request.id });
    if (error) throw error;
    const destination = request.my_role === "artisan" ? "/vendedor/mensagens" : "/mensagens";
    window.location.assign(`${destination}?conversa=${encodeURIComponent(data as string)}`);
  } catch (caught) {
    toast.error(errorText(caught, "Não foi possível abrir a conversa desta encomenda."));
  }
}

/** Opções de orçamento de uma loja, com o formulário de solicitação. */
type PublicService = Service & { store_name: string };

function productionLabel(service: Service) {
  return service.min_production_days === service.max_production_days
    ? `${service.max_production_days} dias` : `${service.min_production_days} a ${service.max_production_days} dias`;
}

/** Link que abre a loja já com o formulário de orçamento daquela opção. */
export function serviceQuoteHref(service: { id: string; artisan_id: string }) {
  return `/loja?id=${encodeURIComponent(service.artisan_id)}&orcamento=${encodeURIComponent(service.id)}#orcamentos`;
}

/**
 * Opções sob encomenda de todas as lojas (home e "Encomendar uma peça").
 * Sem nenhuma opção publicada, não mostra nada.
 */
export function PublicCustomServices({ limit = 8, eyebrow = "Feito sob encomenda", title = "Peça algo feito só para você",
  description = "Opções que as lojas fazem sob medida: escolha uma e peça um orçamento.", className = "" }: {
  limit?: number; eyebrow?: string; title?: string; description?: string; className?: string;
}) {
  const [services, setServices] = useState<PublicService[]>([]);
  useEffect(() => {
    let active = true;
    void Promise.resolve(getSupabase().rpc("list_public_custom_order_services", { p_limit: limit }))
      .then(({ data, error }) => { if (active && !error) setServices((data ?? []) as PublicService[]); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [limit]);

  if (!services.length) return null;
  return (
    <section className={`custom-store-quotes custom-public-services ${className}`.trim()} aria-labelledby="opcoes-encomenda-titulo">
      <div className="store-section-heading">
        <div>
          <p className="store-eyebrow">{eyebrow}</p>
          <h2 id="opcoes-encomenda-titulo">{title}</h2>
          {description && <p className="custom-public-services-lead">{description}</p>}
        </div>
      </div>
      <ul className="custom-store-quotes-list">
        {services.map((service) => (
          <li key={service.id} className="custom-store-quote">
            {service.image_url ? (
              <OptimizedImage src={service.image_url} alt="" width={320} height={240} sizes="(max-width: 760px) 100vw, 320px" />
            ) : (
              <span className="custom-store-quote-noimage" aria-hidden="true"><Palette size={26} /></span>
            )}
            <div>
              <small className="custom-public-services-store">{service.store_name}</small>
              <h3>{service.title}</h3>
              {service.description && <p className="custom-public-services-description">{service.description}</p>}
              <p className="custom-store-quote-meta">
                {service.starting_price ? <>A partir de <strong>{money.format(service.starting_price)}</strong> · </> : null}
                <Clock3 size={13} /> {productionLabel(service)} de produção
              </p>
              <Link className="an-btn an-btn--secondary an-btn--sm" href={serviceQuoteHref(service)} prefetch={false}>
                Pedir orçamento <ArrowRight size={14} />
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function StoreCustomQuotes({ artisanId, storeName }: { artisanId: string; storeName: string }) {
  const { userId, authReady } = useMarketplace();
  const { requireAuth } = useStorefrontActions();
  const [services, setServices] = useState<Service[]>([]);
  const [selected, setSelected] = useState<Service | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [budget, setBudget] = useState("");
  const [date, setDate] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    void Promise.resolve(getSupabase().rpc("list_store_custom_order_services", { p_artisan_id: artisanId }))
      .then(({ data, error }) => { if (active && !error) setServices((data ?? []) as Service[]); });
    return () => { active = false; };
  }, [artisanId]);

  // Veio de "Pedir orçamento" na vitrine (?orcamento=<id>): rola até aqui e,
  // com a conta conectada, já abre o formulário daquela opção (uma vez).
  const handledLink = useRef(false);
  useEffect(() => {
    if (handledLink.current || !services.length || !authReady) return;
    const wanted = new URLSearchParams(window.location.search).get("orcamento");
    if (!wanted) return;
    handledLink.current = true;
    const service = services.find((item) => item.id === wanted);
    document.getElementById("orcamentos")?.scrollIntoView({ block: "start" });
    if (service && userId && userId !== artisanId) queueMicrotask(() => open(service));
  // eslint-disable-next-line react-hooks/exhaustive-deps -- abre uma vez, quando a lista e a sessão estão prontas
  }, [services, authReady, userId, artisanId]);

  function open(service: Service) {
    if (!userId) return requireAuth("generic");
    if (userId === artisanId) return toast.info("Esta é a sua loja.");
    setTitle(service.title);
    setDescription("");
    setQuantity("1");
    setBudget("");
    setDate("");
    setSelected(service);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || submitting) return;
    if (findBlockedTerm(`${title} ${description}`)) return toast.error("O pedido contém termos que não são permitidos na Artenós.");
    setSubmitting(true);
    try {
      const { error } = await getSupabase().rpc("create_custom_order_request", {
        p_service_id: selected.id, p_title: title.trim(), p_description: description.trim(),
        p_quantity: Number(quantity), p_budget: budget ? Number(budget) : null, p_desired_date: date || null,
      });
      if (error) throw error;
      setSelected(null);
      toast.success("Pedido de orçamento enviado. Acompanhe em Pedidos › Orçamentos.");
    } catch (caught) {
      toast.error(errorText(caught, "Não foi possível enviar a solicitação."));
    } finally {
      setSubmitting(false);
    }
  }

  if (!services.length) return null;
  return (
    <section id="orcamentos" className="store-container custom-store-quotes" aria-labelledby="orcamentos-loja-titulo">
      <div className="store-section-heading">
        <div>
          <p className="store-eyebrow">Sob encomenda</p>
          <h2 id="orcamentos-loja-titulo">Peça um orçamento a {storeName}</h2>
        </div>
      </div>
      <ul className="custom-store-quotes-list">
        {services.map((service) => (
          <li key={service.id} className="custom-store-quote">
            {service.image_url ? (
              <OptimizedImage src={service.image_url} alt="" width={320} height={240} sizes="(max-width: 760px) 100vw, 320px" />
            ) : (
              <span className="custom-store-quote-noimage" aria-hidden="true"><Palette size={26} /></span>
            )}
            <div>
              <h3>{service.title}</h3>
              <p>{service.description}</p>
              <p className="custom-store-quote-meta">
                {service.starting_price ? <>A partir de <strong>{money.format(service.starting_price)}</strong> · </> : null}
                <Clock3 size={13} /> {service.min_production_days === service.max_production_days
                  ? `${service.max_production_days} dias` : `${service.min_production_days} a ${service.max_production_days} dias`} de produção
              </p>
              <button type="button" className="an-btn an-btn--secondary an-btn--sm" onClick={() => open(service)}>Pedir orçamento</button>
            </div>
          </li>
        ))}
      </ul>

      <Dialog open={selected !== null} onClose={() => setSelected(null)} labelledBy="orcamento-titulo"
        className="custom-request-dialog" closeLabel="Fechar solicitação">
        {selected && (
          <form className="custom-modal" onSubmit={submit}>
            <p className="store-eyebrow">Solicitar orçamento</p>
            <h2 id="orcamento-titulo">{selected.title}</h2>
            <p className="custom-modal-lead">Sua solicitação será enviada para {storeName}.</p>
            <label>
              Título da encomenda
              <input data-autofocus value={title} onChange={(event) => setTitle(event.target.value)} minLength={3} maxLength={120} required />
            </label>
            <label>
              Conte como você imagina a peça
              <small>Cores, tamanho, materiais e para que a peça será usada (mínimo de 20 caracteres).</small>
              <textarea value={description} onChange={(event) => setDescription(event.target.value)} minLength={20} maxLength={3000} required />
            </label>
            <div className="custom-form-row">
              <label>
                Quantidade
                <input type="number" min="1" max="999" value={quantity} onChange={(event) => setQuantity(event.target.value)} required />
              </label>
              <label>
                Orçamento disponível
                <input type="number" min="0.01" step="0.01" value={budget} onChange={(event) => setBudget(event.target.value)} placeholder="Opcional" />
              </label>
            </div>
            <label>
              Data desejada
              <input type="date" min={new Date().toISOString().slice(0, 10)} value={date} onChange={(event) => setDate(event.target.value)} />
            </label>
            <p className="custom-modal-note">Nada é cobrado nesta etapa: a loja responde com uma proposta de valor e prazo.</p>
            <button className="an-btn an-btn--lg an-btn--block" type="submit" disabled={submitting} aria-busy={submitting}>
              {submitting ? "Enviando…" : "Enviar solicitação"}
            </button>
          </form>
        )}
      </Dialog>
    </section>
  );
}

function RequestCard({ request, onCancel }: { request: QuoteRequest; onCancel?: () => void }) {
  return (
    <article className="custom-request-card">
      <div className="custom-request-top">
        <span className={`custom-status is-${request.status}`}>{statusLabel[request.status]}</span>
        <time dateTime={request.created_at}>{dateFormatter.format(new Date(request.created_at))}</time>
      </div>
      <h4>{request.title}</h4>
      <p>{request.description}</p>
      <dl>
        <div><dt>Referência</dt><dd>{request.service_title}</dd></div>
        <div><dt>Loja</dt><dd>{request.artisan_name}</dd></div>
        <div><dt>Quantidade</dt><dd>{request.quantity}</dd></div>
        <div><dt>Orçamento</dt><dd>{request.budget ? money.format(request.budget) : "Não informado"}</dd></div>
        <div><dt>Data desejada</dt><dd>{displayDate(request.desired_date)}</dd></div>
        {request.proposed_price && <div><dt>Proposta</dt><dd>{money.format(request.proposed_price)}</dd></div>}
        {request.estimated_delivery_date && <div><dt>Previsão</dt><dd>{displayDate(request.estimated_delivery_date)}</dd></div>}
      </dl>
      {request.response_message && <blockquote>{request.response_message}</blockquote>}
      {request.status === "accepted" && (
        <p className="custom-proposal-note">A proposta foi enviada. Converse com a loja para acertar os próximos passos; este aceite ainda não gera cobrança nem pedido de compra.</p>
      )}
      <button type="button" className="custom-card-message" onClick={() => void openQuoteConversation(request)}>
        <MessageCircle size={16} /> Abrir conversa
      </button>
      {onCancel && <button type="button" className="custom-card-cancel" onClick={onCancel}>Cancelar solicitação</button>}
    </article>
  );
}

/** "Meus orçamentos" em Pedidos: solicitações enviadas, respostas e conversa. */
export function MyQuoteRequests() {
  const { authReady, userId } = useMarketplace();
  const [requests, setRequests] = useState<QuoteRequest[]>([]);

  const load = useCallback(async () => {
    const { data, error } = await getSupabase().rpc("list_my_custom_order_requests");
    if (!error) setRequests(((data ?? []) as QuoteRequest[]).filter((request) => request.my_role === "client"));
  }, []);

  useEffect(() => {
    if (authReady && userId) queueMicrotask(() => void load());
  }, [authReady, userId, load]);

  async function cancel(requestId: string) {
    const { error } = await getSupabase().rpc("cancel_custom_order_request", { p_request_id: requestId });
    if (error) return toast.error("Não foi possível cancelar a solicitação.");
    toast.success("Solicitação cancelada.");
    void load();
  }

  if (!requests.length) return null;
  return (
    <section className="custom-requests-section" aria-labelledby="orcamentos-titulo">
      <h2 id="orcamentos-titulo">Orçamentos sob encomenda</h2>
      <p>Pedidos de orçamento que você enviou às lojas. A proposta aceita é combinada pela conversa.</p>
      <div className="custom-requests-grid">
        {requests.map((request) => (
          <RequestCard key={request.id} request={request}
            onCancel={request.status === "pending" ? () => void cancel(request.id) : undefined} />
        ))}
      </div>
    </section>
  );
}
