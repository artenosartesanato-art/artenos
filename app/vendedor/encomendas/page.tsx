"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Clock3,
  Eye,
  EyeOff,
  MessageCircle,
  PackageCheck,
  Plus,
  Search,
  Sparkles,
  X,
  XCircle,
} from "@/components/icons";
import { toast } from "sonner";
import { useSellerProfile } from "@/components/seller-shell";
import { getSupabase } from "@/lib/supabase";
import "./seller-custom-orders.css";

type RequestStatus = "pending" | "accepted" | "declined" | "cancelled";
type Filter = "all" | RequestStatus;
type Category = { id: string; name: string };
type Service = {
  id: string;
  title: string;
  description: string;
  image_url: string | null;
  starting_price: number | null;
  min_production_days: number;
  max_production_days: number;
  category_id: string | null;
  active: boolean;
};
type CustomRequest = {
  id: string;
  service_id: string;
  title: string;
  description: string;
  quantity: number;
  budget: number | null;
  desired_date: string | null;
  status: RequestStatus;
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
const statusLabel: Record<RequestStatus, string> = {
  pending: "Aguardando resposta",
  accepted: "Aceita",
  declined: "Recusada",
  cancelled: "Cancelada",
};

function formatDate(value: string | null) {
  if (!value) return "Não informada";
  const parsed = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  return Number.isNaN(parsed.getTime())
    ? "Não informada"
    : dateFormatter.format(parsed);
}

export default function SellerCustomOrdersPage() {
  const profile = useSellerProfile();
  const [requests, setRequests] = useState<CustomRequest[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<CustomRequest | null>(null);
  const [serviceFormOpen, setServiceFormOpen] = useState(false);
  const [action, setAction] = useState<"accepted" | "declined">("accepted");
  const [proposalPrice, setProposalPrice] = useState("");
  const [proposalDate, setProposalDate] = useState("");
  const [responseMessage, setResponseMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [serviceTitle, setServiceTitle] = useState("");
  const [serviceDescription, setServiceDescription] = useState("");
  const [serviceCategory, setServiceCategory] = useState("");
  const [servicePrice, setServicePrice] = useState("");
  const [serviceMinDays, setServiceMinDays] = useState("");
  const [serviceMaxDays, setServiceMaxDays] = useState("");
  const [serviceImage, setServiceImage] = useState("");

  const loadData = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    try {
      const supabase = getSupabase();
      const [requestsResult, servicesResult, categoriesResult] =
        await Promise.all([
          supabase.rpc("list_my_custom_order_requests"),
          supabase
            .from("custom_order_services")
            .select(
              "id,title,description,image_url,starting_price,min_production_days,max_production_days,category_id,active",
            )
            .eq("artisan_id", profile.id)
            .order("created_at", { ascending: false }),
          supabase
            .from("storefront_categories")
            .select("id,name")
            .eq("active", true)
            .order("sort_order"),
        ]);
      if (requestsResult.error) throw requestsResult.error;
      if (servicesResult.error) throw servicesResult.error;
      if (categoriesResult.error) throw categoriesResult.error;
      setRequests(
        ((requestsResult.data || []) as CustomRequest[]).filter(
          (item) => item.my_role === "artisan",
        ),
      );
      setServices((servicesResult.data || []) as Service[]);
      setCategories((categoriesResult.data || []) as Category[]);
      setError("");
    } catch {
      setError(
        "Não foi possível carregar as encomendas agora. Confira sua conexão e tente novamente.",
      );
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadData(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  const filteredRequests = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return requests.filter((request) => {
      const matchesStatus = filter === "all" || request.status === filter;
      const matchesSearch =
        !term ||
        [request.title, request.service_title, request.client_name].some(
          (value) => value.toLocaleLowerCase("pt-BR").includes(term),
        );
      return matchesStatus && matchesSearch;
    });
  }, [filter, requests, search]);

  const pendingCount = requests.filter(
    (item) => item.status === "pending",
  ).length;
  const acceptedCount = requests.filter(
    (item) => item.status === "accepted",
  ).length;

  function openResponse(
    request: CustomRequest,
    nextAction: "accepted" | "declined",
  ) {
    setSelected(request);
    setAction(nextAction);
    setProposalPrice(request.proposed_price?.toString() || "");
    setProposalDate(request.estimated_delivery_date || "");
    setResponseMessage(request.response_message || "");
  }

  async function respond(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || submitting) return;
    setSubmitting(true);
    try {
      const { error: responseError } = await getSupabase().rpc(
        "respond_custom_order_request",
        {
          p_request_id: selected.id,
          p_action: action,
          p_proposed_price:
            action === "accepted" ? Number(proposalPrice) : null,
          p_response_message: responseMessage.trim() || null,
          p_estimated_delivery_date:
            action === "accepted" && proposalDate ? proposalDate : null,
        },
      );
      if (responseError) throw responseError;
      toast.success(
        action === "accepted"
          ? "Encomenda aceita e proposta enviada."
          : "Solicitação recusada.",
      );
      setSelected(null);
      await loadData();
    } catch (caught) {
      toast.error(
        caught instanceof Error
          ? caught.message
          : "Não foi possível responder à encomenda.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function createService(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile || submitting) return;
    const minDays = Number(serviceMinDays);
    const maxDays = Number(serviceMaxDays);
    if (maxDays < minDays) {
      toast.error("O prazo máximo não pode ser menor que o mínimo.");
      return;
    }
    setSubmitting(true);
    try {
      const { error: insertError } = await getSupabase()
        .from("custom_order_services")
        .insert({
          artisan_id: profile.id,
          title: serviceTitle.trim(),
          description: serviceDescription.trim(),
          category_id: serviceCategory || null,
          starting_price: servicePrice ? Number(servicePrice) : null,
          min_production_days: minDays,
          max_production_days: maxDays,
          image_url: serviceImage.trim() || null,
          active: true,
        });
      if (insertError) throw insertError;
      setServiceTitle("");
      setServiceDescription("");
      setServiceCategory("");
      setServicePrice("");
      setServiceMinDays("");
      setServiceMaxDays("");
      setServiceImage("");
      setServiceFormOpen(false);
      toast.success("Opção sob encomenda publicada.");
      await loadData();
    } catch (caught) {
      toast.error(
        caught instanceof Error
          ? caught.message
          : "Não foi possível publicar a opção.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleService(service: Service) {
    try {
      const { error: updateError } = await getSupabase()
        .from("custom_order_services")
        .update({ active: !service.active })
        .eq("id", service.id)
        .eq("artisan_id", profile?.id || "");
      if (updateError) throw updateError;
      toast.success(
        service.active ? "Opção pausada." : "Opção publicada novamente.",
      );
      await loadData();
    } catch {
      toast.error("Não foi possível alterar a publicação.");
    }
  }

  async function openConversation(request: CustomRequest) {
    try {
      const { data: conversationId, error: conversationError } =
        await getSupabase().rpc("open_custom_order_conversation", {
          p_request_id: request.id,
        });
      if (conversationError) throw conversationError;
      window.location.assign(
        `/vendedor/mensagens?conversa=${encodeURIComponent(conversationId as string)}`,
      );
    } catch (caught) {
      toast.error(
        caught instanceof Error
          ? caught.message
          : "Não foi possível abrir a conversa desta encomenda.",
      );
    }
  }

  return (
    <div className="seller-custom-orders">
      <header className="seller-page-heading">
        <div>
          <p className="seller-eyebrow">Gestão da loja</p>
          <h1>Encomendas</h1>
          <p>
            Primeiro publique uma opção em “Nova opção”. Ela aparecerá na vitrine
            Sob encomenda; o cliente escolhe a sua opção e envia uma solicitação.
            Aqui você responde com preço, prazo e mensagem.
          </p>
        </div>
        <button type="button" onClick={() => setServiceFormOpen(true)}>
          <Plus size={18} /> Nova opção
        </button>
      </header>

      <section className="custom-flow-note" aria-label="Como funcionam as encomendas">
        <strong>Fluxo da encomenda</strong>
        <span>1. Você publica uma opção → 2. O cliente solicita orçamento → 3. Você responde → 4. Ambos acompanham pelo chat.</span>
        <small>A proposta aceita ainda não cria automaticamente uma venda nem uma cobrança.</small>
        {profile && <a href={`/loja?id=${encodeURIComponent(profile.id)}`}>Ver como o cliente encontra suas opções (página da loja)</a>}
      </section>

      <section className="custom-summary" aria-label="Resumo das encomendas">
        <article>
          <Clock3 size={21} />
          <div>
            <strong>{pendingCount}</strong>
            <span>aguardando resposta</span>
          </div>
        </article>
        <article>
          <CheckCircle2 size={21} />
          <div>
            <strong>{acceptedCount}</strong>
            <span>encomendas aceitas</span>
          </div>
        </article>
        <article>
          <Sparkles size={21} />
          <div>
            <strong>{services.filter((item) => item.active).length}</strong>
            <span>opções publicadas</span>
          </div>
        </article>
      </section>

      <section className="custom-section">
        <div className="custom-section-title">
          <div>
            <h2>Solicitações recebidas</h2>
            <p>Pedidos personalizados enviados pelos clientes.</p>
          </div>
          <label className="custom-search">
            <Search size={17} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar cliente ou encomenda"
            />
          </label>
        </div>
        <div className="custom-tabs">
          {(
            ["all", "pending", "accepted", "declined", "cancelled"] as Filter[]
          ).map((value) => (
            <button
              type="button"
              key={value}
              className={filter === value ? "active" : ""}
              onClick={() => setFilter(value)}
            >
              {value === "all" ? "Todas" : statusLabel[value]}
            </button>
          ))}
        </div>
        {error && (
          <div className="custom-error" role="alert">
            {error}
          </div>
        )}
        {loading ? (
          <div className="custom-empty">
            <Clock3 className="seller-spin" size={30} />
            <p>Carregando encomendas...</p>
          </div>
        ) : (
          !error &&
          (filteredRequests.length ? (
            <div className="custom-request-list">
              {filteredRequests.map((request) => (
                <article className="custom-request-card" key={request.id}>
                  <div className="custom-request-head">
                    <div>
                      <small>{request.service_title}</small>
                      <h3>{request.title}</h3>
                      <span>
                        Cliente: {request.client_name} · recebido em{" "}
                        {formatDate(request.created_at)}
                      </span>
                    </div>
                    <strong className={`is-${request.status}`}>
                      {statusLabel[request.status]}
                    </strong>
                  </div>
                  <p>{request.description}</p>
                  <dl>
                    <div>
                      <dt>Quantidade</dt>
                      <dd>{request.quantity}</dd>
                    </div>
                    <div>
                      <dt>Orçamento do cliente</dt>
                      <dd>
                        {request.budget
                          ? money.format(request.budget)
                          : "Não informado"}
                      </dd>
                    </div>
                    <div>
                      <dt>Data desejada</dt>
                      <dd>{formatDate(request.desired_date)}</dd>
                    </div>
                    {request.proposed_price && (
                      <div>
                        <dt>Valor proposto</dt>
                        <dd>{money.format(request.proposed_price)}</dd>
                      </div>
                    )}
                  </dl>
                  {request.response_message && (
                    <blockquote>{request.response_message}</blockquote>
                  )}
                  <footer>
                    <button
                      type="button"
                      className="message"
                      onClick={() => void openConversation(request)}
                    >
                      <MessageCircle size={17} /> Conversar
                    </button>
                    {request.status === "pending" && (
                      <>
                        <button
                          type="button"
                          className="decline"
                          onClick={() => openResponse(request, "declined")}
                        >
                          <XCircle size={17} /> Recusar
                        </button>
                        <button
                          type="button"
                          onClick={() => openResponse(request, "accepted")}
                        >
                          <CheckCircle2 size={17} /> Aceitar e propor
                        </button>
                      </>
                    )}
                  </footer>
                </article>
              ))}
            </div>
          ) : (
            <div className="custom-empty">
              <PackageCheck size={35} />
              <h3>Nenhuma solicitação nesta seleção</h3>
              <p>
                Novos pedidos personalizados aparecerão aqui automaticamente.
              </p>
            </div>
          ))
        )}
      </section>

      <section className="custom-section">
        <div className="custom-section-title">
          <div>
            <h2>Opções sob encomenda</h2>
            <p>Serviços que os clientes podem solicitar na vitrine.</p>
          </div>
        </div>
        {services.length ? (
          <div className="custom-service-grid">
            {services.map((service) => (
              <article
                key={service.id}
                className={!service.active ? "is-paused" : ""}
              >
                <div className="custom-service-image">
                  {service.image_url ? (
                    <img src={service.image_url} alt="" />
                  ) : (
                    <Sparkles size={25} />
                  )}
                </div>
                <div>
                  <span>{service.active ? "Publicada" : "Pausada"}</span>
                  <h3>{service.title}</h3>
                  <p>
                    {service.starting_price
                      ? `A partir de ${money.format(service.starting_price)}`
                      : "Preço definido na proposta"}
                  </p>
                  <small>
                    {service.min_production_days} a{" "}
                    {service.max_production_days} dias de produção
                  </small>
                </div>
                <button
                  type="button"
                  onClick={() => void toggleService(service)}
                >
                  {service.active ? <EyeOff size={16} /> : <Eye size={16} />}
                  {service.active ? "Pausar" : "Publicar"}
                </button>
              </article>
            ))}
          </div>
        ) : (
          !loading &&
          !error && (
            <div className="custom-empty compact">
              <Sparkles size={30} />
              <h3>Nenhuma opção publicada</h3>
              <p>
                Crie uma opção para começar a receber solicitações
                personalizadas.
              </p>
            </div>
          )
        )}
      </section>

      {selected && (
        <div
          className="custom-modal-backdrop"
          onMouseDown={() => setSelected(null)}
        >
          <form
            className="custom-modal"
            onSubmit={respond}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="custom-modal-close"
              onClick={() => setSelected(null)}
              aria-label="Fechar"
            >
              <X size={19} />
            </button>
            <p className="seller-eyebrow">Responder solicitação</p>
            <h2>{selected.title}</h2>
            <div className="custom-choice">
              <button
                type="button"
                className={action === "accepted" ? "active" : ""}
                onClick={() => setAction("accepted")}
              >
                Aceitar e enviar proposta
              </button>
              <button
                type="button"
                className={action === "declined" ? "active" : ""}
                onClick={() => setAction("declined")}
              >
                Recusar
              </button>
            </div>
            {action === "accepted" && (
              <div className="custom-form-row">
                <label>
                  Valor proposto
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={proposalPrice}
                    onChange={(event) => setProposalPrice(event.target.value)}
                    required
                  />
                </label>
                <label>
                  Previsão de entrega
                  <input
                    type="date"
                    value={proposalDate}
                    min={new Date().toISOString().slice(0, 10)}
                    onChange={(event) => setProposalDate(event.target.value)}
                  />
                </label>
              </div>
            )}
            <label>
              {action === "accepted"
                ? "Mensagem ao cliente"
                : "Motivo da recusa"}
              <textarea
                value={responseMessage}
                onChange={(event) => setResponseMessage(event.target.value)}
                maxLength={1000}
                required={action === "declined"}
                placeholder="Explique os próximos passos com clareza."
              />
            </label>
            <button
              className="custom-submit"
              type="submit"
              disabled={submitting}
            >
              {submitting
                ? "Salvando..."
                : action === "accepted"
                  ? "Enviar proposta"
                  : "Confirmar recusa"}
            </button>
          </form>
        </div>
      )}

      {serviceFormOpen && (
        <div
          className="custom-modal-backdrop"
          onMouseDown={() => setServiceFormOpen(false)}
        >
          <form
            className="custom-modal"
            onSubmit={createService}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="custom-modal-close"
              onClick={() => setServiceFormOpen(false)}
              aria-label="Fechar"
            >
              <X size={19} />
            </button>
            <p className="seller-eyebrow">Nova publicação</p>
            <h2>Opção sob encomenda</h2>
            <label>
              Título
              <input
                value={serviceTitle}
                onChange={(event) => setServiceTitle(event.target.value)}
                minLength={3}
                maxLength={120}
                required
              />
            </label>
            <label>
              Descrição
              <textarea
                value={serviceDescription}
                onChange={(event) => setServiceDescription(event.target.value)}
                minLength={20}
                maxLength={2000}
                required
              />
            </label>
            <div className="custom-form-row">
              <label>
                Categoria
                <select
                  value={serviceCategory}
                  onChange={(event) => setServiceCategory(event.target.value)}
                >
                  <option value="">Sem categoria</option>
                  {categories.map((category) => (
                    <option value={category.id} key={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Preço inicial
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={servicePrice}
                  onChange={(event) => setServicePrice(event.target.value)}
                />
              </label>
            </div>
            <div className="custom-form-row">
              <label>
                Prazo mínimo (dias)
                <input
                  type="number"
                  min="1"
                  max="3650"
                  value={serviceMinDays}
                  onChange={(event) => setServiceMinDays(event.target.value)}
                  required
                />
              </label>
              <label>
                Prazo máximo (dias)
                <input
                  type="number"
                  min="1"
                  max="3650"
                  value={serviceMaxDays}
                  onChange={(event) => setServiceMaxDays(event.target.value)}
                  required
                />
              </label>
            </div>
            <label>
              URL da imagem (opcional)
              <input
                type="url"
                value={serviceImage}
                onChange={(event) => setServiceImage(event.target.value)}
                placeholder="https://..."
              />
            </label>
            <button
              className="custom-submit"
              type="submit"
              disabled={submitting}
            >
              {submitting ? "Publicando..." : "Publicar opção"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
