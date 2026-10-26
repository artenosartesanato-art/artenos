"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Box,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  FileText,
  MapPin,
  MessageCircle,
  PackageCheck,
  Search,
  Sparkles,
  Truck,
} from "@/components/icons";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import { toast } from "sonner";
import { CustomerFooter } from "@/components/customer-footer";
import { CustomerHeader } from "@/components/customer-header";
import { getSupabase } from "@/lib/supabase";
import "../storefront.css";
import "./orders.css";

type CepStatus = "loading" | "guest" | "account" | "error";
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
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [cep, setCep] = useState("");
  const [cepStatus, setCepStatus] = useState<CepStatus>("loading");
  const [cepError, setCepError] = useState("");
  const [cepOpen, setCepOpen] = useState(false);
  const [cepInput, setCepInput] = useState("");
  const sessionRequest = useRef(0);
  const orderRequest = useRef(0);

  const loadOrders = useCallback(async (current: User) => {
    const request = ++orderRequest.current;
    setLoading(true);
    try {
      const { data: rows, error: orderError } =
        await getSupabase().rpc("list_my_orders");
      if (request !== orderRequest.current) return;
      if (orderError) throw orderError;
      setOrders(
        ((rows || []) as Order[]).filter(
          (order) =>
            order.my_role === "client" && order.client_id === current.id,
        ),
      );
      setError("");
    } catch {
      if (request === orderRequest.current)
        setError(
          "Não foi possível carregar os pedidos. Execute o script pedidos.sql no Supabase e tente novamente.",
        );
    } finally {
      if (request === orderRequest.current) setLoading(false);
    }
  }, []);

  const loadSession = useCallback(
    async (current: User | null) => {
      const request = ++sessionRequest.current;
      setUser(current);
      setAuthReady(true);
      setCepOpen(false);
      if (!current) {
        setOrders([]);
        setLoading(false);
        setCep(localStorage.getItem("artenos_guest_cep") || "");
        setCepStatus("guest");
        setCepError("");
        return;
      }
      setCepStatus("loading");
      try {
        const { data: profile, error: profileError } = await getSupabase()
          .from("profiles")
          .select("cep")
          .eq("id", current.id)
          .single();
        if (request !== sessionRequest.current) return;
        if (profileError) throw profileError;
        const digits = profile.cep?.replace(/\D/g, "") || "";
        if (digits.length === 8) {
          setCep(digits);
          setCepStatus("account");
          setCepError("");
        } else {
          setCepStatus("error");
          setCepError("O CEP salvo no cadastro é inválido.");
        }
        await loadOrders(current);
      } catch {
        if (request === sessionRequest.current) {
          setCepStatus("error");
          setCepError("Não foi possível consultar seu perfil.");
          setError("Não foi possível carregar os dados da sua conta.");
          setLoading(false);
        }
      }
    },
    [loadOrders],
  );

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
          ) {
            window.setTimeout(() => {
              if (active) void loadSession(session?.user || null);
            }, 0);
          }
        },
      );
      return () => {
        active = false;
        sessionRequest.current++;
        orderRequest.current++;
        listener.subscription.unsubscribe();
      };
    } catch {
      queueMicrotask(() => {
        setAuthReady(true);
        setLoading(false);
        setCepStatus("error");
        setCepError("Supabase não configurado.");
        setError("Configure as variáveis públicas do Supabase.");
      });
    }
  }, [loadSession]);

  const filteredOrders = useMemo(
    () =>
      orders.filter((order) => {
        const groupMatches =
          filter === "all" ||
          (filter === "active" &&
            ["payment_confirmed", "preparing"].includes(order.status)) ||
          (filter === "shipping" &&
            ["shipped", "out_for_delivery", "delivery_failed"].includes(
              order.status,
            )) ||
          (filter === "delivered" && order.status === "delivered") ||
          (filter === "cancelled" &&
            ["cancelled", "refunded"].includes(order.status));
        const term = query.toLocaleLowerCase("pt-BR");
        const searchMatches =
          !term ||
          [
            order.order_code,
            order.product_name,
            order.client_name,
            order.artisan_name,
          ].some((value) => value?.toLocaleLowerCase("pt-BR").includes(term));
        return groupMatches && searchMatches;
      }),
    [orders, filter, query],
  );

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setQuery(searchInput.trim().slice(0, 100));
  }

  async function saveCep(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (user) return;
    const digits = cepInput.replace(/\D/g, "");
    if (digits.length !== 8) {
      toast.error("Digite um CEP com 8 números.");
      return;
    }
    try {
      const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const address = await response.json();
      if (!response.ok || address.erro) throw new Error();
      localStorage.setItem("artenos_guest_cep", digits);
      setCep(digits);
      setCepOpen(false);
      toast.success(`CEP de ${address.localidade}/${address.uf} selecionado.`);
    } catch {
      toast.error("CEP não encontrado. Confira e tente novamente.");
    }
  }

  const pendingCount = orders.filter((item) =>
    ["payment_confirmed", "preparing"].includes(item.status),
  ).length;
  const shippingCount = orders.filter((item) =>
    ["shipped", "out_for_delivery", "delivery_failed"].includes(item.status),
  ).length;
  const deliveredCount = orders.filter(
    (item) => item.status === "delivered",
  ).length;

  return (
    <div className="store-page orders-page">
      <CustomerHeader
        userSignedIn={!!user}
        cep={cep}
        cepStatus={cepStatus}
        cepError={cepError}
        cepOpen={cepOpen}
        cepInput={cepInput}
        searchInput={searchInput}
        onSearchInput={setSearchInput}
        onSearch={submitSearch}
        onToggleCep={() => setCepOpen(!cepOpen)}
        onCepInput={setCepInput}
        onSaveCep={saveCep}
      />
      <main className="store-container orders-main">
        <section className="orders-intro">
          <div>
            <p className="store-eyebrow">ACOMPANHAMENTO</p>
            <h1>Pedidos</h1>
            <p>Acompanhe suas compras do pagamento confirmado até a entrega.</p>
          </div>
          <PackageCheck size={47} aria-hidden="true" />
        </section>

        {!authReady || loading ? (
          <div className="orders-empty">
            <Clock3 size={36} />
            <p>Carregando pedidos...</p>
          </div>
        ) : !user ? (
          <div className="orders-empty">
            <Box size={40} />
            <h2>Entre para acompanhar seus pedidos</h2>
            <p>
              Suas compras e atualizações de entrega ficam disponíveis na sua
              conta.
            </p>
            <Link href="/acesso">
              Entrar ou criar conta <ArrowRight size={17} />
            </Link>
          </div>
        ) : (
          <>
            <section className="orders-summary" aria-label="Resumo dos pedidos">
              <article>
                <Clock3 size={21} />
                <div>
                  <strong>{pendingCount}</strong>
                  <span>em preparação</span>
                </div>
              </article>
              <article>
                <Truck size={22} />
                <div>
                  <strong>{shippingCount}</strong>
                  <span>a caminho</span>
                </div>
              </article>
              <article>
                <CheckCircle2 size={22} />
                <div>
                  <strong>{deliveredCount}</strong>
                  <span>entregues</span>
                </div>
              </article>
              <article>
                <CircleDollarSign size={22} />
                <div>
                  <strong>
                    {money.format(
                      orders.reduce(
                        (sum, item) => sum + Number(item.total_amount || 0),
                        0,
                      ),
                    )}
                  </strong>
                  <span>em pedidos</span>
                </div>
              </article>
            </section>
            <div className="orders-controls">
              <div className="orders-tabs">
                {(
                  [
                    ["all", "Todos"],
                    ["active", "Preparando"],
                    ["shipping", "A caminho"],
                    ["delivered", "Entregues"],
                    ["cancelled", "Cancelados"],
                  ] as [Filter, string][]
                ).map(([value, label]) => (
                  <button
                    type="button"
                    className={filter === value ? "active" : ""}
                    onClick={() => setFilter(value)}
                    key={value}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {query && (
                <button
                  type="button"
                  className="orders-clear-search"
                  onClick={() => {
                    setSearchInput("");
                    setQuery("");
                  }}
                >
                  Limpar busca
                </button>
              )}
            </div>
            {error && (
              <div className="store-error" role="alert">
                {error}
              </div>
            )}
            {!error &&
              (filteredOrders.length ? (
                <section className="orders-list" aria-live="polite">
                  {filteredOrders.map((order) => (
                    <OrderCard
                      key={order.id}
                      order={order}
                      expanded={expanded === order.id}
                      onToggle={() =>
                        setExpanded(expanded === order.id ? null : order.id)
                      }
                    />
                  ))}
                </section>
              ) : (
                <div className="orders-empty">
                  <Box size={38} />
                  <h2>Nenhum pedido nesta seleção</h2>
                  <p>
                    {query
                      ? "Tente buscar outro número, produto ou nome."
                      : "Quando uma compra for confirmada, ela aparecerá aqui automaticamente."}
                  </p>
                  {!query && (
                    <Link href="/categorias">
                      Explorar peças <ArrowRight size={17} />
                    </Link>
                  )}
                </div>
              ))}
          </>
        )}
      </main>
      <CustomerFooter userSignedIn={!!user} authLoading={!authReady} />
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
  const firstItem = order.items[0];
  return (
    <article className="order-card">
      <div className="order-card-top">
        <div>
          <span>Pedido {order.order_code}</span>
          <time dateTime={order.created_at}>
            Realizado em {formatDate(order.created_at)}
          </time>
        </div>
        <strong className={`order-status is-${order.status}`}>
          {statusLabel[order.status]}
        </strong>
      </div>
      <div className="order-card-main">
        <div className="order-product-image">
          {firstItem?.image_url ? (
            <img src={firstItem.image_url} alt={firstItem.product_name} />
          ) : (
            <Sparkles size={27} />
          )}
        </div>
        <div className="order-product-copy">
          <small>{order.artisan_name}</small>
          <h2>{order.product_name}</h2>
          <p>
            {order.items.reduce((sum, item) => sum + item.quantity, 0)}{" "}
            {order.items.reduce((sum, item) => sum + item.quantity, 0) === 1
              ? "item"
              : "itens"}{" "}
            · Total {money.format(Number(order.total_amount || 0))}
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
          >
            Ver detalhes <ChevronDown size={16} />
          </button>
        </div>
      </div>
      {expanded && (
        <div className="order-details">
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
              <Link href="/mensagens">
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
