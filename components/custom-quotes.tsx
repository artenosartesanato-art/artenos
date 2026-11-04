"use client";

// Orçamentos sob encomenda (antes na tela separada /sob-encomenda):
// StoreCustomQuotes fica na página da loja e MyQuoteRequests em Pedidos.
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { MessageCircle } from "@/components/icons";
import { useMarketplace } from "@/components/marketplace-state";
import { getSupabase } from "@/lib/supabase";
import { ServiceCard, useServiceDialog } from "@/components/custom-service";
import type { CustomService } from "@/lib/custom-services";
import "./custom-quotes.css";

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
/** Link que abre a loja já com o detalhe daquela opção (?orcamento=<id>). */
export function serviceQuoteHref(service: { id: string; artisan_id: string }) {
  return `/loja?id=${encodeURIComponent(service.artisan_id)}&orcamento=${encodeURIComponent(service.id)}#orcamentos`;
}

/**
 * Opções sob encomenda de todas as lojas (home). Mesmo cartão das peças;
 * clicar abre o detalhe com o pedido de orçamento. Sem opções, não mostra nada.
 */
export function PublicCustomServices({ limit = 8, eyebrow = "Feito sob encomenda", title = "Peça algo feito só para você",
  description = "Opções que as lojas fazem sob medida: escolha uma e peça um orçamento.", className = "" }: {
  limit?: number; eyebrow?: string; title?: string; description?: string; className?: string;
}) {
  const [services, setServices] = useState<CustomService[]>([]);
  const { open, dialog } = useServiceDialog();
  useEffect(() => {
    let active = true;
    void Promise.resolve(getSupabase().rpc("list_public_custom_order_services", { p_limit: limit }))
      .then(({ data, error }) => { if (active && !error) setServices((data ?? []) as CustomService[]); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [limit]);

  if (!services.length) return null;
  return (
    <section className={`custom-public-services ${className}`.trim()} aria-labelledby="opcoes-encomenda-titulo">
      <div className="store-section-heading">
        <div>
          <p className="store-eyebrow">{eyebrow}</p>
          <h2 id="opcoes-encomenda-titulo">{title}</h2>
          {description && <p className="custom-public-services-lead">{description}</p>}
        </div>
      </div>
      <div className="store-products">
        {services.map((service) => <ServiceCard key={service.id} service={service} onOpen={() => open(service)} />)}
      </div>
      {dialog}
    </section>
  );
}

export function StoreCustomQuotes({ artisanId, storeName }: { artisanId: string; storeName: string }) {
  const { authReady } = useMarketplace();
  const [services, setServices] = useState<CustomService[]>([]);
  const { open, dialog } = useServiceDialog();

  useEffect(() => {
    let active = true;
    void Promise.resolve(getSupabase().rpc("list_store_custom_order_services", { p_artisan_id: artisanId }))
      .then(({ data, error }) => {
        if (active && !error) setServices(((data ?? []) as CustomService[]).map((service) => ({ ...service, store_name: storeName })));
      });
    return () => { active = false; };
  }, [artisanId, storeName]);

  // Veio de "Pedir orçamento" (?orcamento=<id>): rola até aqui e abre o
  // detalhe daquela opção já no formulário (uma vez).
  const handledLink = useRef(false);
  useEffect(() => {
    if (handledLink.current || !services.length || !authReady) return;
    const wanted = new URLSearchParams(window.location.search).get("orcamento");
    if (!wanted) return;
    handledLink.current = true;
    const service = services.find((item) => item.id === wanted);
    document.getElementById("orcamentos")?.scrollIntoView({ block: "start" });
    if (service) queueMicrotask(() => open(service, true));
  }, [services, authReady, open]);

  if (!services.length) return null;
  return (
    <section id="orcamentos" className="store-container custom-store-quotes" aria-labelledby="orcamentos-loja-titulo">
      <div className="store-section-heading">
        <div>
          <p className="store-eyebrow">Sob encomenda</p>
          <h2 id="orcamentos-loja-titulo">Peça um orçamento a {storeName}</h2>
        </div>
      </div>
      <div className="store-products">
        {services.map((service) => <ServiceCard key={service.id} service={service} onOpen={() => open(service)} />)}
      </div>
      {dialog}
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
