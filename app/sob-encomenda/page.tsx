"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Clock3,
  MessageCircle,
  PackageCheck,
  Palette,
  Sparkles,
  Store,
} from "@/components/icons";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { useStorefrontActions } from "@/components/storefront-actions";
import { getSupabase } from "@/lib/supabase";
import "../storefront.css";
import "./custom-orders.css";

type Profile = {
  account_type: "client" | "artisan";
  approval_status: "active" | "pending_review" | "assisted_review";
  cep: string;
  store_name: string | null;
};
type Category = { id: string; name: string };
type Service = {
  id: string;
  artisan_id: string;
  title: string;
  description: string;
  image_url: string | null;
  starting_price: number | null;
  min_production_days: number;
  max_production_days: number;
  category_id: string | null;
  category_name: string | null;
  store_name: string | null;
  city: string | null;
  state: string | null;
  total_count: number;
};
type CustomRequest = {
  id: string;
  service_id: string;
  title: string;
  description: string;
  quantity: number;
  budget: number | null;
  desired_date: string | null;
  status: "pending" | "accepted" | "declined" | "cancelled";
  proposed_price: number | null;
  response_message: string | null;
  estimated_delivery_date: string | null;
  created_at: string;
  service_title: string;
  client_name: string;
  artisan_name: string;
  my_role: "client" | "artisan";
};

const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});
const statusLabel: Record<CustomRequest["status"], string> = {
  pending: "Aguardando resposta",
  accepted: "Aceita",
  declined: "Recusada",
  cancelled: "Cancelada",
};

function displayDate(value: string | null) {
  if (!value) return "Não informada";
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? "Não informada"
    : dateFormatter.format(date);
}

export default function CustomOrdersPage() {
  const { requireAuth } = useStorefrontActions();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [requests, setRequests] = useState<CustomRequest[]>([]);
  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [requestTitle, setRequestTitle] = useState("");
  const [requestDescription, setRequestDescription] = useState("");
  const [requestQuantity, setRequestQuantity] = useState("1");
  const [requestBudget, setRequestBudget] = useState("");
  const [requestDate, setRequestDate] = useState("");
  const profileRequest = useRef(0);
  const serviceRequest = useRef(0);

  const refreshAccountData = useCallback(
    async (current: User, loadedProfile?: Profile) => {
      const supabase = getSupabase();
      const currentProfile =
        loadedProfile ||
        ((
          await supabase
            .from("profiles")
            .select("account_type,approval_status,cep,store_name")
            .eq("id", current.id)
            .single()
        ).data as Profile | null);
      if (!currentProfile) return;
      const { data: requestRows, error: requestError } = await supabase.rpc(
        "list_my_custom_order_requests",
      );
      if (requestError) throw requestError;
      setRequests((requestRows || []) as CustomRequest[]);
    },
    [],
  );

  const loadSession = useCallback(
    async (current: User | null) => {
      const request = ++profileRequest.current;
      setUser(current);
      setProfile(null);
      setRequests([]);
      if (!current) return;
      try {
        const { data, error: profileError } = await getSupabase()
          .from("profiles")
          .select("account_type,approval_status,cep,store_name")
          .eq("id", current.id)
          .single();
        if (request !== profileRequest.current) return;
        if (profileError || !data)
          throw profileError || new Error("Perfil não encontrado");
        const loaded = data as Profile;
        setProfile(loaded);
        await refreshAccountData(current, loaded);
      } catch {
        if (request === profileRequest.current) setRequests([]);
      }
    },
    [refreshAccountData],
  );

  const loadServices = useCallback(async () => {
    const request = ++serviceRequest.current;
    setLoading(true);
    try {
      const { data, error: serviceError } = await getSupabase().rpc(
        "list_custom_order_services",
        {
          p_query: query || null,
          p_category_id: categoryId,
          p_limit: 48,
          p_offset: 0,
        },
      );
      if (serviceError) throw serviceError;
      if (request === serviceRequest.current) {
        setServices((data || []) as Service[]);
        setError("");
      }
    } catch {
      if (request === serviceRequest.current)
        setError(
          "Não foi possível carregar as opções sob encomenda agora.",
        );
    } finally {
      if (request === serviceRequest.current) setLoading(false);
    }
  }, [query, categoryId]);

  useEffect(() => {
    let active = true;
    try {
      const supabase = getSupabase();
      const { data: listener } = supabase.auth.onAuthStateChange(
        (event, session) => {
          if (
            [
              "INITIAL_SESSION",
              "SIGNED_IN",
              "SIGNED_OUT",
              "USER_UPDATED",
            ].includes(event)
          )
            window.setTimeout(() => {
              if (active) void loadSession(session?.user || null);
            }, 0);
        },
      );
      void Promise.resolve(
        supabase
          .from("storefront_categories")
          .select("id,name")
          .order("sort_order"),
      ).then(({ data }) => {
        if (active) setCategories((data || []) as Category[]);
      });
      return () => {
        active = false;
        profileRequest.current++;
        serviceRequest.current++;
        listener.subscription.unsubscribe();
      };
    } catch {
      queueMicrotask(() => {
        setError("As encomendas estão temporariamente indisponíveis.");
        setLoading(false);
      });
    }
  }, [loadSession]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadServices(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadServices]);

  function openRequest(service: Service) {
    if (!user) {
      requireAuth("generic");
      return;
    }
    if (service.artisan_id === user.id) {
      toast.info("Este serviço pertence à sua loja.");
      return;
    }
    setSelectedService(service);
    setRequestTitle("");
    setRequestDescription("");
    setRequestQuantity("1");
    setRequestBudget("");
    setRequestDate("");
  }

  async function createRequest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedService || !user || submitting) return;
    setSubmitting(true);
    try {
      const { error: createError } = await getSupabase().rpc(
        "create_custom_order_request",
        {
          p_service_id: selectedService.id,
          p_title: requestTitle.trim(),
          p_description: requestDescription.trim(),
          p_quantity: Number(requestQuantity),
          p_budget: requestBudget ? Number(requestBudget) : null,
          p_desired_date: requestDate || null,
        },
      );
      if (createError) throw createError;
      setSelectedService(null);
      await refreshAccountData(user);
      toast.success("Solicitação enviada para a artesã.");
    } catch (caught) {
      toast.error(
        caught instanceof Error
          ? caught.message
          : "Não foi possível enviar a solicitação.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function cancelRequest(requestId: string) {
    if (!user || !profile) return;
    const { error: cancelError } = await getSupabase().rpc(
      "cancel_custom_order_request",
      { p_request_id: requestId },
    );
    if (cancelError) {
      toast.error("Não foi possível cancelar a solicitação.");
      return;
    }
    await refreshAccountData(user, profile);
    toast.success("Solicitação cancelada.");
  }

  async function openConversation(request: CustomRequest) {
    try {
      const { data: conversationId, error: conversationError } =
        await getSupabase().rpc("open_custom_order_conversation", {
          p_request_id: request.id,
        });
      if (conversationError) throw conversationError;
      const destination =
        request.my_role === "artisan" ? "/vendedor/mensagens" : "/mensagens";
      window.location.assign(
        `${destination}?conversa=${encodeURIComponent(conversationId as string)}`,
      );
    } catch (caught) {
      toast.error(
        caught instanceof Error
          ? caught.message
          : "Não foi possível abrir a conversa desta encomenda.",
      );
    }
  }

  const isArtisan = profile?.account_type === "artisan";
  const outgoingRequests = requests.filter(
    (request) => request.my_role === "client",
  );
  return (
    <div className="store-page custom-page">
      <main id="conteudo" tabIndex={-1}>
        <section className="custom-hero">
          <div className="store-container custom-hero-inner">
            <div>
              <p className="store-eyebrow">Sua ideia, feita à mão</p>
              <h1>Peças sob encomenda</h1>
              <p>
                A artesã publica o tipo de peça que aceita criar. Você escolhe
                uma opção abaixo, descreve sua ideia e envia o pedido de orçamento.
                Nada é comprado nesta etapa.
              </p>
              <a href="#opcoes">
                Conhecer opções <ArrowRight size={18} />
              </a>
            </div>
            <div className="custom-hero-symbol" aria-hidden="true">
              <Palette size={76} />
              <span>
                <Sparkles size={24} />
              </span>
            </div>
          </div>
        </section>
        <section className="store-container custom-steps">
          <article>
            <span>1</span>
            <div>
              <strong>Escolha uma artesã</strong>
              <p>Encontre uma opção publicada por uma loja aprovada.</p>
            </div>
          </article>
          <article>
            <span>2</span>
            <div>
              <strong>Descreva sua ideia</strong>
              <p>Informe detalhes, quantidade, orçamento e prazo.</p>
            </div>
          </article>
          <article>
            <span>3</span>
            <div>
              <strong>Receba a proposta</strong>
              <p>A artesã avalia e responde com valor e previsão. Acompanhe em Minhas solicitações e converse pelo chat.</p>
            </div>
          </article>
        </section>

        {isArtisan && (
          <section className="store-container custom-dashboard">
            <div className="custom-section-heading">
              <div>
                <p className="store-eyebrow">ÁREA DA ARTESÃ</p>
                <h2>Suas encomendas ficam no painel da loja</h2>
              </div>
              <Link href="/vendedor/encomendas" className="custom-panel-link">
                Gerenciar encomendas <ArrowRight size={18} />
              </Link>
            </div>
          </section>
        )}

        {user && (
          <section className="store-container custom-my-requests">
            <div className="custom-section-heading">
              <div>
                <p className="store-eyebrow">ACOMPANHAMENTO</p>
                <h2>Minhas solicitações</h2>
              </div>
            </div>
            {outgoingRequests.length ? (
              <div className="custom-request-grid">
                {outgoingRequests.map((request) => (
                  <RequestCard
                    key={request.id}
                    request={request}
                    onMessage={() => void openConversation(request)}
                    onCancel={
                      request.status === "pending"
                        ? () => cancelRequest(request.id)
                        : undefined
                    }
                  />
                ))}
              </div>
            ) : (
              <div className="custom-empty-small">
                Você ainda não enviou uma solicitação sob encomenda.
              </div>
            )}
          </section>
        )}

        <section id="opcoes" className="store-container custom-catalog">
          <div className="custom-section-heading">
            <div>
              <p className="store-eyebrow">FEITO ESPECIALMENTE PARA VOCÊ</p>
              <h2>Opções sob encomenda</h2>
            </div>
            <span>
              {loading
                ? "Carregando..."
                : `${services.length} ${services.length === 1 ? "opção" : "opções"}`}
            </span>
          </div>
          <form className="custom-search" role="search" onSubmit={(event) => { event.preventDefault(); setQuery(searchInput.trim().slice(0, 100)); }}>
            <label htmlFor="busca-encomenda" className="an-visually-hidden">Buscar opções sob encomenda</label>
            <input id="busca-encomenda" className="an-input" type="search" value={searchInput}
              onChange={(event) => { setSearchInput(event.target.value); if (!event.target.value) setQuery(""); }}
              placeholder="Buscar por peça ou técnica" />
            <button type="submit" className="an-btn an-btn--secondary">Buscar</button>
          </form>
          <div className="custom-category-chips">
            <button
              type="button"
              className={!categoryId ? "active" : ""}
              aria-pressed={!categoryId}
              onClick={() => setCategoryId(null)}
            >
              Todas
            </button>
            {categories.map((category) => (
              <button
                type="button"
                className={categoryId === category.id ? "active" : ""}
                aria-pressed={categoryId === category.id}
                onClick={() => setCategoryId(category.id)}
                key={category.id}
              >
                {category.name}
              </button>
            ))}
          </div>
          {error && (
            <div className="store-error" role="alert">
              {error}
            </div>
          )}
          {loading ? (
            <div className="custom-service-grid" role="status" aria-label="Carregando opções">
              {[0, 1, 2].map((index) => <span key={index} className="an-skeleton custom-service-skeleton" />)}
            </div>
          ) : services.length ? (
            <div className="custom-service-grid">
              {services.map((service) => (
                <article className="custom-service-card" key={service.id}>
                  {service.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={service.image_url}
                      alt=""
                      loading="lazy"
                      width={480}
                      height={360}
                    />
                  ) : (
                    <div className="custom-service-image">
                      <Palette size={36} />
                    </div>
                  )}
                  <div className="custom-service-body">
                    <p className="custom-shop">
                      <Store size={14} /> {service.store_name || "Loja Artenós"}
                    </p>
                    <h3>{service.title}</h3>
                    <p>{service.description}</p>
                    <div className="custom-service-meta">
                      <span>
                        <Clock3 size={15} /> {service.min_production_days}–
                        {service.max_production_days} dias
                      </span>
                      <span>
                        {service.starting_price !== null
                          ? `A partir de ${money.format(service.starting_price)}`
                          : "Preço sob consulta"}
                      </span>
                    </div>
                    <button type="button" onClick={() => openRequest(service)}>
                      Solicitar orçamento <ArrowRight size={16} />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            !error && (
              <div className="custom-empty">
                <PackageCheck size={40} />
                <h3>Nenhuma opção publicada ainda</h3>
                <p>
                  As opções aparecerão quando artesãs aprovadas disponibilizarem
                  trabalhos sob encomenda.
                </p>
              </div>
            )
          )}
        </section>
      </main>

      <Dialog open={selectedService !== null} onClose={() => setSelectedService(null)} labelledBy="orcamento-titulo"
        className="custom-request-dialog" closeLabel="Fechar solicitação">
        {selectedService && (
          <form className="custom-modal" onSubmit={createRequest}>
            <p className="store-eyebrow">Solicitar orçamento</p>
            <h2 id="orcamento-titulo">{selectedService.title}</h2>
            <p className="custom-modal-lead">
              Sua solicitação será enviada para{" "}
              {selectedService.store_name || "a artesã"}.
            </p>
            <label>
              Título da encomenda
              <input
                data-autofocus
                value={requestTitle}
                onChange={(event) => setRequestTitle(event.target.value)}
                minLength={3}
                maxLength={120}
                required
              />
            </label>
            <label>
              Conte como você imagina a peça
              <small>Cores, tamanho, materiais e para que a peça será usada (mínimo de 20 caracteres).</small>
              <textarea
                value={requestDescription}
                onChange={(event) => setRequestDescription(event.target.value)}
                minLength={20}
                maxLength={3000}
                required
              />
            </label>
            <div className="custom-form-row">
              <label>
                Quantidade
                <input
                  type="number"
                  min="1"
                  max="999"
                  value={requestQuantity}
                  onChange={(event) => setRequestQuantity(event.target.value)}
                  required
                />
              </label>
              <label>
                Orçamento disponível
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={requestBudget}
                  onChange={(event) => setRequestBudget(event.target.value)}
                  placeholder="Opcional"
                />
              </label>
            </div>
            <label>
              Data desejada
              <input
                type="date"
                min={new Date().toISOString().slice(0, 10)}
                value={requestDate}
                onChange={(event) => setRequestDate(event.target.value)}
              />
            </label>
            <p className="custom-modal-note">Nada é cobrado nesta etapa: a loja responde com uma proposta de valor e prazo.</p>
            <button
              className="an-btn an-btn--lg an-btn--block"
              type="submit"
              disabled={submitting}
              aria-busy={submitting}
            >
              {submitting ? "Enviando…" : "Enviar solicitação"}
            </button>
          </form>
        )}
      </Dialog>

    </div>
  );
}

function RequestCard({
  request,
  onMessage,
  onCancel,
}: {
  request: CustomRequest;
  onMessage: () => void;
  onCancel?: () => void;
}) {
  return (
    <article className="custom-request-card">
      <div className="custom-request-top">
        <span className={`custom-status is-${request.status}`}>
          {statusLabel[request.status]}
        </span>
        <time dateTime={request.created_at}>
          {dateFormatter.format(new Date(request.created_at))}
        </time>
      </div>
      <h4>{request.title}</h4>
      <p>{request.description}</p>
      <dl>
        <div>
          <dt>Referência</dt>
          <dd>{request.service_title}</dd>
        </div>
        <div>
          <dt>{request.my_role === "artisan" ? "Cliente" : "Artesã"}</dt>
          <dd>
            {request.my_role === "artisan"
              ? request.client_name
              : request.artisan_name}
          </dd>
        </div>
        <div>
          <dt>Quantidade</dt>
          <dd>{request.quantity}</dd>
        </div>
        <div>
          <dt>Orçamento</dt>
          <dd>
            {request.budget ? money.format(request.budget) : "Não informado"}
          </dd>
        </div>
        <div>
          <dt>Data desejada</dt>
          <dd>{displayDate(request.desired_date)}</dd>
        </div>
        {request.proposed_price && (
          <div>
            <dt>Proposta</dt>
            <dd>{money.format(request.proposed_price)}</dd>
          </div>
        )}
        {request.estimated_delivery_date && (
          <div>
            <dt>Previsão</dt>
            <dd>{displayDate(request.estimated_delivery_date)}</dd>
          </div>
        )}
      </dl>
      {request.response_message && (
        <blockquote>{request.response_message}</blockquote>
      )}
      {request.status === "accepted" && <p className="custom-proposal-note">A proposta foi enviada. Converse com a artesã para acertar os próximos passos; este aceite ainda não gera cobrança nem pedido de compra.</p>}
      <button type="button" className="custom-card-message" onClick={onMessage}>
        <MessageCircle size={16} /> Abrir conversa
      </button>
      {onCancel && (
        <button type="button" className="custom-card-cancel" onClick={onCancel}>
          Cancelar solicitação
        </button>
      )}
    </article>
  );
}
