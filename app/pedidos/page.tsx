"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Box,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  FileText,
  MessageCircle,
  RefreshCw,
  Search,
  Sparkles,
  Truck,
} from "@/components/icons";
import Link from "next/link";
import { getSupabase } from "@/lib/supabase";
import { accessHref } from "@/lib/navigation";
import { useMarketplace } from "@/components/marketplace-state";
import { orderProgress } from "@/lib/order-progress";
import { messagesHref } from "@/lib/navigation";
import "../storefront.css";
import "./orders.css";
import { OptimizedImage } from "@/components/optimized-image";

type AccountType = "client" | "artisan";
type OrderStatus =
  | "payment_confirmed"
  | "preparing"
  | "shipped"
  | "out_for_delivery"
  | "delivered"
  | "delivery_failed"
  | "cancelled"
  | "refunded";
type Filter = "all" | "active" | "shipping" | "delivered" | "cancelled";
type OrderItem = {
  id: string;
  product_id: string | null;
  product_name: string;
  image_url: string | null;
  quantity: number;
  unit_price: number;
  subtotal: number;
};
type HistoryItem = {
  id: string;
  status: OrderStatus;
  description: string | null;
  created_at: string;
};
type Order = {
  id: string;
  order_code: string;
  client_id: string;
  artisan_id: string;
  my_role: AccountType;
  status: OrderStatus;
  payment_status: string;
  product_name: string;
  subtotal: number;
  shipping_amount: number;
  total_amount: number;
  recipient_name: string | null;
  shipping_cep: string | null;
  shipping_address: string | null;
  shipping_number: string | null;
  shipping_complement: string | null;
  shipping_city: string | null;
  shipping_state: string | null;
  carrier: string | null;
  tracking_code: string | null;
  tracking_url: string | null;
  estimated_delivery_date: string | null;
  invoice_number: string | null;
  invoice_url: string | null;
  created_at: string;
  updated_at: string;
  shipped_at: string | null;
  delivered_at: string | null;
  client_name: string;
  artisan_name: string;
  items: OrderItem[];
  history: HistoryItem[];
};

const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
const date = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});
const dateTime = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
const statusLabel: Record<OrderStatus, string> = {
  payment_confirmed: "Pagamento confirmado",
  preparing: "Em preparação",
  shipped: "A caminho",
  out_for_delivery: "Saiu para entrega",
  delivered: "Entregue",
  delivery_failed: "Problema na entrega",
  cancelled: "Cancelado",
  refunded: "Reembolsado",
};

function formatDate(value: string | null, withTime = false) {
  if (!value) return "Não informada";
  const parsed = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  return Number.isNaN(parsed.getTime())
    ? "Não informada"
    : (withTime ? dateTime : date).format(parsed);
}

function cepMask(value: string | null) {
  const digits = value?.replace(/\D/g, "") || "";
  return digits.length === 8
    ? `${digits.slice(0, 5)}-${digits.slice(5)}`
    : value || "";
}

export default function OrdersPage() {
  const { authReady, userId } = useMarketplace();
  const [orders, setOrders] = useState<Order[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  const orderRequest = useRef(0);

  useEffect(() => {
    const request = ++orderRequest.current;
    if (!authReady || !userId) {
      queueMicrotask(() => {
        if (request !== orderRequest.current) return;
        setOrders([]);
        setLoading(!authReady);
      });
      return;
    }
    queueMicrotask(() => { if (request === orderRequest.current) { setLoading(true); setError(""); } });
    void Promise.resolve(getSupabase().rpc("list_my_orders"))
      .then(({ data: rows, error: orderError }) => {
        if (request !== orderRequest.current) return;
        if (orderError) throw orderError;
        setOrders(((rows || []) as Order[]).filter((order) => order.my_role === "client" && order.client_id === userId));
      })
      .catch(() => { if (request === orderRequest.current) setError("Não foi possível carregar seus pedidos agora."); })
      .finally(() => { if (request === orderRequest.current) setLoading(false); });
  }, [authReady, userId, attempt]);

  const groupOf = (order: Order): Filter =>
    ["payment_confirmed", "preparing"].includes(order.status) ? "active"
      : ["shipped", "out_for_delivery", "delivery_failed"].includes(order.status) ? "shipping"
        : order.status === "delivered" ? "delivered" : "cancelled";

  const filteredOrders = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("pt-BR");
    return orders.filter((order) => (filter === "all" || groupOf(order) === filter) && (!term ||
      [order.order_code, order.product_name, order.artisan_name, ...order.items.map((item) => item.product_name)]
        .some((value) => value?.toLocaleLowerCase("pt-BR").includes(term))));
  }, [orders, filter, query]);

  const counts = useMemo(() => {
    const result: Record<Filter, number> = { all: orders.length, active: 0, shipping: 0, delivered: 0, cancelled: 0 };
    orders.forEach((order) => { result[groupOf(order)]++; });
    return result;
  }, [orders]);

  const tabs: [Filter, string][] = [
    ["all", "Todos"], ["active", "Em preparação"], ["shipping", "A caminho"], ["delivered", "Entregues"], ["cancelled", "Cancelados"],
  ];

  return (
    <div className="store-page orders-page">
      <main id="conteudo" tabIndex={-1} className="store-container orders-main">
        <header className="orders-intro">
          <p className="store-eyebrow">Acompanhamento</p>
          <h1>Meus pedidos</h1>
          <p>Acompanhe cada compra do pagamento confirmado até a entrega. Cada loja envia o seu pedido separadamente.</p>
        </header>

        {!authReady || (userId && loading) ? (
          <div className="orders-list" role="status" aria-label="Carregando pedidos">
            {[0, 1, 2].map((index) => <span key={index} className="an-skeleton orders-skeleton" />)}
          </div>
        ) : !userId ? (
          <section className="an-state">
            <Box size={36} />
            <h2>Entre para acompanhar seus pedidos</h2>
            <p>Suas compras e as atualizações de entrega ficam na sua conta.</p>
            <div className="an-state-actions">
              <Link className="an-btn" href={accessHref("/pedidos")}>Entrar ou criar conta <ArrowRight size={16} /></Link>
            </div>
          </section>
        ) : error ? (
          <section className="an-state" role="alert">
            <Box size={36} />
            <h2>{error}</h2>
            <p>Confira sua conexão e tente novamente.</p>
            <div className="an-state-actions">
              <button type="button" className="an-btn" onClick={() => setAttempt((value) => value + 1)}><RefreshCw size={15} /> Tentar novamente</button>
            </div>
          </section>
        ) : orders.length === 0 ? (
          <section className="an-state">
            <Box size={36} />
            <h2>Você ainda não fez nenhum pedido</h2>
            <p>Quando um pagamento for confirmado, o pedido aparece aqui com o andamento da entrega.</p>
            <div className="an-state-actions">
              <Link className="an-btn" href="/categorias">Explorar peças <ArrowRight size={16} /></Link>
            </div>
          </section>
        ) : (
          <>
            <section className="orders-summary" aria-label="Resumo dos pedidos">
              <div><Clock3 size={20} /><span><strong>{counts.active}</strong> em preparação</span></div>
              <div><Truck size={20} /><span><strong>{counts.shipping}</strong> a caminho</span></div>
              <div><CheckCircle2 size={20} /><span><strong>{counts.delivered}</strong> entregues</span></div>
              <div><CircleDollarSign size={20} /><span><strong>{money.format(orders.reduce((sum, item) => sum + Number(item.total_amount || 0), 0))}</strong> em compras</span></div>
            </section>
            <div className="orders-controls">
              <div className="orders-tabs" role="group" aria-label="Filtrar pedidos por situação">
                {tabs.map(([value, label]) => (
                  <button type="button" aria-pressed={filter === value} onClick={() => setFilter(value)} key={value}>
                    {label} <small>{counts[value]}</small>
                  </button>
                ))}
              </div>
              <label className="orders-search">
                <Search size={16} />
                <span className="an-visually-hidden">Buscar nos pedidos</span>
                <input className="an-input" type="search" value={query} onChange={(event) => setQuery(event.target.value)}
                  placeholder="Número, peça ou loja" />
              </label>
            </div>
            {filteredOrders.length ? (
              <section className="orders-list" aria-label="Pedidos">
                {filteredOrders.map((order) => (
                  <OrderCard key={order.id} order={order} expanded={expanded === order.id}
                    onToggle={() => setExpanded(expanded === order.id ? null : order.id)} />
                ))}
              </section>
            ) : (
              <div className="an-state">
                <Box size={34} />
                <h2>Nenhum pedido nesta seleção</h2>
                <p>{query ? "Tente buscar outro número, peça ou loja." : "Escolha outra situação para ver mais pedidos."}</p>
                <div className="an-state-actions">
                  <button type="button" className="an-btn an-btn--secondary" onClick={() => { setFilter("all"); setQuery(""); }}>Ver todos os pedidos</button>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function OrderCard({
  order,
  expanded,
  onToggle,
}: {
  order: Order;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { sellerPanelAvailable } = useMarketplace();
  const firstItem = order.items[0];
  const progress = orderProgress(order.status);
  const units = order.items.reduce((sum, item) => sum + item.quantity, 0);
  return (
    <article className="order-card">
      <div className="order-card-top">
        <div>
          <h2>Pedido {order.order_code}</h2>
          <time dateTime={order.created_at}>
            Feito em {formatDate(order.created_at)}
          </time>
        </div>
        <strong className={`order-status is-${order.status}`}>
          {statusLabel[order.status]}
        </strong>
      </div>
      {progress.steps.length > 0 && (
        <ol className="order-progress" aria-label={`Andamento: ${statusLabel[order.status]}`}>
          {progress.steps.map((step, index) => (
            <li key={step.label} className={index < progress.current ? "is-done" : index === progress.current ? "is-current" : ""}
              aria-current={index === progress.current ? "step" : undefined}>
              <span aria-hidden="true" />
              {step.label}
            </li>
          ))}
        </ol>
      )}
      <div className="order-card-main">
        <div className="order-product-image">
          {firstItem?.image_url ? (
            <OptimizedImage src={firstItem.image_url} alt="" width={96} height={96} sizes="96px" />
          ) : (
            <Sparkles size={27} />
          )}
        </div>
        <div className="order-product-copy">
          <small>{order.artisan_name}</small>
          <h3>{order.product_name}</h3>
          <p>
            {units} {units === 1 ? "unidade" : "unidades"} · Total {money.format(Number(order.total_amount || 0))}
          </p>
          {order.estimated_delivery_date && (
            <span>
              <Truck size={15} /> Previsão:{" "}
              {formatDate(order.estimated_delivery_date)}
            </span>
          )}
        </div>
        <div className="order-card-actions">
          <button
            type="button"
            className="order-details-button"
            onClick={onToggle}
            aria-expanded={expanded}
            aria-controls={`pedido-${order.id}`}
          >
            {expanded ? "Ocultar detalhes" : "Ver detalhes"} <ChevronDown size={16} />
          </button>
        </div>
      </div>
      {expanded && (
        <div className="order-details" id={`pedido-${order.id}`}>
          <div className="order-detail-grid">
            <section>
              <h3>Andamento</h3>
              <ol className="order-timeline">
                {order.history.map((event) => (
                  <li
                    key={event.id}
                    className={event.status === order.status ? "current" : ""}
                  >
                    <span />
                    <div>
                      <strong>{statusLabel[event.status]}</strong>
                      <p>{event.description}</p>
                      <time dateTime={event.created_at}>
                        {formatDate(event.created_at, true)}
                      </time>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
            <section className="order-information">
              <h3>Entrega e documentos</h3>
              <dl>
                <div>
                  <dt>Destinatário</dt>
                  <dd>{order.recipient_name || order.client_name}</dd>
                </div>
                <div>
                  <dt>Endereço</dt>
                  <dd>
                    {order.shipping_address
                      ? `${order.shipping_address}, ${order.shipping_number}${order.shipping_complement ? ` · ${order.shipping_complement}` : ""} · ${order.shipping_city}/${order.shipping_state} · CEP ${cepMask(order.shipping_cep)}`
                      : "Não informado no pedido antigo"}
                  </dd>
                </div>
                <div>
                  <dt>Frete</dt>
                  <dd>{money.format(Number(order.shipping_amount || 0))}</dd>
                </div>
                <div>
                  <dt>Rastreamento</dt>
                  <dd>
                    {order.tracking_code || "Ainda não informado"}
                    {order.tracking_url && (
                      <a
                        href={order.tracking_url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Acompanhar entrega
                      </a>
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Nota fiscal</dt>
                  <dd>
                    {order.invoice_number || "Ainda não emitida"}
                    {order.invoice_url && (
                      <a
                        href={order.invoice_url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <FileText size={14} /> Abrir nota
                      </a>
                    )}
                  </dd>
                </div>
              </dl>
              <Link className="an-btn an-btn--secondary an-btn--sm" href={messagesHref(sellerPanelAvailable)}>
                <MessageCircle size={16} /> Abrir mensagens do pedido
              </Link>
            </section>
          </div>
          <section className="order-items">
            <h3>Itens do pedido</h3>
            {order.items.map((item) => (
              <div key={item.id}>
                <span>
                  {item.quantity}× {item.product_name}
                </span>
                <strong>{money.format(Number(item.subtotal))}</strong>
              </div>
            ))}
            <div>
              <span>Frete</span>
              <strong>{money.format(Number(order.shipping_amount || 0))}</strong>
            </div>
            <div className="order-total">
              <span>Total</span>
              <strong>{money.format(Number(order.total_amount || 0))}</strong>
            </div>
          </section>
        </div>
      )}
    </article>
  );
}
