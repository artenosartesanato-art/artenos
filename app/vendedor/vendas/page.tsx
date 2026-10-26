"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BadgePercent,
  Box,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  FileText,
  HandCoins,
  MessageCircle,
  Search,
  Sparkles,
  Truck,
  X,
} from "@/components/icons";
import Link from "next/link";
import { toast } from "sonner";
import { useSellerProfile } from "@/components/seller-shell";
import { getSupabase } from "@/lib/supabase";
import "./seller-sales.css";

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
  my_role: "client" | "artisan";
  status: OrderStatus;
  payment_status: string;
  product_name: string;
  subtotal: number;
  shipping_amount: number;
  total_amount: number;
  platform_fee_percent?: number;
  platform_fee_amount?: number;
  artisan_net_amount?: number;
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
const nextStatus: Partial<Record<OrderStatus, OrderStatus[]>> = {
  payment_confirmed: ["preparing", "cancelled"],
  preparing: ["shipped", "cancelled"],
  shipped: ["out_for_delivery", "delivered", "delivery_failed"],
  out_for_delivery: ["delivered", "delivery_failed"],
  delivery_failed: ["shipped", "out_for_delivery", "cancelled"],
};

function formatDate(value: string | null, withTime = false) {
  if (!value) return "Não informada";
  const parsed = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  return Number.isNaN(parsed.getTime())
    ? "Não informada"
    : (withTime ? dateTime : date).format(parsed);
}

function formatCep(value: string | null) {
  const digits = value?.replace(/\D/g, "") || "";
  return digits.length === 8
    ? `${digits.slice(0, 5)}-${digits.slice(5)}`
    : value || "";
}

export default function SellerSalesPage() {
  const profile = useSellerProfile();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [selected, setSelected] = useState<Order | null>(null);
  const [newStatus, setNewStatus] = useState<OrderStatus | "">("");
  const [note, setNote] = useState("");
  const [trackingCode, setTrackingCode] = useState("");
  const [trackingUrl, setTrackingUrl] = useState("");
  const [carrier, setCarrier] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceUrl, setInvoiceUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadOrders = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    try {
      const supabase = getSupabase();
      const [ordersResponse, financialResponse] = await Promise.all([
        supabase.rpc("list_my_orders"),
        supabase.rpc("list_my_sales_financials"),
      ]);
      const { data, error: ordersError } = ordersResponse;
      if (ordersError) throw ordersError;
      const financialByOrder = new Map(
        ((financialResponse.data ?? []) as Array<{
          order_id: string;
          platform_fee_percent: number;
          platform_fee_amount: number;
          artisan_net_amount: number;
        }>).map((financial) => [financial.order_id, financial]),
      );
      setOrders(
        ((data || []) as Order[])
          .filter(
            (order) =>
              order.my_role === "artisan" && order.artisan_id === profile.id,
          )
          .map((order) => ({
            ...order,
            ...financialByOrder.get(order.id),
          })),
      );
      setError("");
    } catch {
      setError(
        "Não foi possível carregar as vendas. Confirme que o arquivo pedidos.sql foi executado no Supabase.",
      );
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  const filteredOrders = useMemo(
    () =>
      orders.filter((order) => {
        const matchesStatus =
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
        const term = search.trim().toLocaleLowerCase("pt-BR");
        const matchesSearch =
          !term ||
          [order.order_code, order.product_name, order.client_name].some(
            (value) => value?.toLocaleLowerCase("pt-BR").includes(term),
          );
        return matchesStatus && matchesSearch;
      }),
    [filter, orders, search],
  );

  const toPrepare = orders.filter((order) =>
    ["payment_confirmed", "preparing"].includes(order.status),
  ).length;
  const shipping = orders.filter((order) =>
    ["shipped", "out_for_delivery", "delivery_failed"].includes(order.status),
  ).length;
  const delivered = orders.filter(
    (order) => order.status === "delivered",
  ).length;
  const total = orders
    .filter((order) => !["cancelled", "refunded"].includes(order.status))
    .reduce((sum, order) => sum + Number(order.total_amount || 0), 0);
  const platformFees = orders
    .filter((order) => !["cancelled", "refunded"].includes(order.status))
    .reduce(
      (sum, order) => sum + Number(order.platform_fee_amount || 0),
      0,
    );
  const netReceivable = orders
    .filter((order) => !["cancelled", "refunded"].includes(order.status))
    .reduce(
      (sum, order) =>
        sum +
        Number(
          order.artisan_net_amount ??
            Number(order.total_amount || 0) -
              Number(order.platform_fee_amount || 0),
        ),
      0,
    );

  function openUpdate(order: Order) {
    const options = nextStatus[order.status] || [];
    setSelected(order);
    setNewStatus(options[0] || "");
    setNote("");
    setTrackingCode(order.tracking_code || "");
    setTrackingUrl(order.tracking_url || "");
    setCarrier(order.carrier || "");
    setDeliveryDate(order.estimated_delivery_date || "");
    setInvoiceNumber(order.invoice_number || "");
    setInvoiceUrl(order.invoice_url || "");
  }

  async function updateOrder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !newStatus || submitting) return;
    setSubmitting(true);
    try {
      const { error: updateError } = await getSupabase().rpc(
        "update_order_fulfillment",
        {
          p_order_id: selected.id,
          p_status: newStatus,
          p_note: note.trim() || null,
          p_tracking_code: trackingCode.trim() || null,
          p_tracking_url: trackingUrl.trim() || null,
          p_carrier: carrier.trim() || null,
          p_estimated_delivery_date: deliveryDate || null,
          p_invoice_number: invoiceNumber.trim() || null,
          p_invoice_url: invoiceUrl.trim() || null,
        },
      );
      if (updateError) throw updateError;
      setSelected(null);
      toast.success("Venda atualizada. O cliente já pode ver o novo status.");
      await loadOrders();
    } catch (caught) {
      toast.error(
        caught instanceof Error
          ? caught.message
          : "Não foi possível atualizar a venda.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="seller-sales">
      <header className="sales-heading">
        <div>
          <p className="seller-eyebrow">Gestão da loja</p>
          <h1>Vendas</h1>
          <p>
            Acompanhe os pedidos pagos e mantenha o cliente informado até a
            entrega.
          </p>
        </div>
      </header>
      <section className="sales-summary" aria-label="Resumo das vendas">
        <article>
          <Clock3 size={21} />
          <div>
            <strong>{toPrepare}</strong>
            <span>para preparar</span>
          </div>
        </article>
        <article>
          <Truck size={21} />
          <div>
            <strong>{shipping}</strong>
            <span>em transporte</span>
          </div>
        </article>
        <article>
          <CheckCircle2 size={21} />
          <div>
            <strong>{delivered}</strong>
            <span>entregues</span>
          </div>
        </article>
        <article>
          <CircleDollarSign size={21} />
          <div>
            <strong>{money.format(total)}</strong>
            <span>em vendas válidas</span>
          </div>
        </article>
        <article>
          <BadgePercent size={21} />
          <div>
            <strong>{money.format(platformFees)}</strong>
            <span>tarifa da plataforma</span>
          </div>
        </article>
        <article>
          <HandCoins size={21} />
          <div>
            <strong>{money.format(netReceivable)}</strong>
            <span>líquido previsto</span>
          </div>
        </article>
      </section>

      <section className="sales-panel">
        <div className="sales-toolbar">
          <div className="sales-tabs">
            {(
              [
                ["all", "Todas"],
                ["active", "Para preparar"],
                ["shipping", "Em transporte"],
                ["delivered", "Entregues"],
                ["cancelled", "Canceladas"],
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
          <label className="sales-search">
            <Search size={17} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Pedido, produto ou cliente"
            />
          </label>
        </div>
        {error && (
          <div className="sales-error" role="alert">
            {error}
          </div>
        )}
        {loading ? (
          <div className="sales-empty">
            <Clock3 className="seller-spin" size={31} />
            <p>Carregando vendas...</p>
          </div>
        ) : (
          !error &&
          (filteredOrders.length ? (
            <div className="sales-list">
              {filteredOrders.map((order) => (
                <SaleCard
                  key={order.id}
                  order={order}
                  expanded={expanded === order.id}
                  onToggle={() =>
                    setExpanded(expanded === order.id ? null : order.id)
                  }
                  onUpdate={() => openUpdate(order)}
                />
              ))}
            </div>
          ) : (
            <div className="sales-empty">
              <Box size={35} />
              <h2>Nenhuma venda nesta seleção</h2>
              <p>
                {search
                  ? "Tente pesquisar outro pedido, produto ou cliente."
                  : "Os pedidos pagos dos clientes aparecerão aqui automaticamente."}
              </p>
            </div>
          ))
        )}
      </section>

      {selected && (
        <div
          className="sales-modal-backdrop"
          onMouseDown={() => setSelected(null)}
        >
          <form
            className="sales-modal"
            onSubmit={updateOrder}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="sales-modal-close"
              onClick={() => setSelected(null)}
              aria-label="Fechar"
            >
              <X size={19} />
            </button>
            <p className="seller-eyebrow">
              Atualizar pedido {selected.order_code}
            </p>
            <h2>{selected.product_name}</h2>
            <label>
              Novo status
              <select
                value={newStatus}
                onChange={(event) =>
                  setNewStatus(event.target.value as OrderStatus)
                }
                required
              >
                {(nextStatus[selected.status] || []).map((status) => (
                  <option value={status} key={status}>
                    {statusLabel[status]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Atualização para o cliente
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                maxLength={1000}
                required={
                  newStatus === "cancelled" || newStatus === "delivery_failed"
                }
                placeholder="Explique o andamento do pedido."
              />
            </label>
            <div className="sales-form-row">
              <label>
                Transportadora
                <input
                  value={carrier}
                  onChange={(event) => setCarrier(event.target.value)}
                  maxLength={100}
                />
              </label>
              <label>
                Código de rastreamento
                <input
                  value={trackingCode}
                  onChange={(event) => setTrackingCode(event.target.value)}
                  maxLength={120}
                />
              </label>
            </div>
            <label>
              Link de rastreamento
              <input
                type="url"
                value={trackingUrl}
                onChange={(event) => setTrackingUrl(event.target.value)}
                placeholder="https://..."
              />
            </label>
            <div className="sales-form-row">
              <label>
                Previsão de entrega
                <input
                  type="date"
                  value={deliveryDate}
                  onChange={(event) => setDeliveryDate(event.target.value)}
                />
              </label>
              <label>
                Número da nota fiscal
                <input
                  value={invoiceNumber}
                  onChange={(event) => setInvoiceNumber(event.target.value)}
                  maxLength={100}
                />
              </label>
            </div>
            <label>
              Link da nota fiscal
              <input
                type="url"
                value={invoiceUrl}
                onChange={(event) => setInvoiceUrl(event.target.value)}
                placeholder="https://..."
              />
            </label>
            <button
              className="sales-submit"
              type="submit"
              disabled={submitting}
            >
              {submitting ? "Atualizando..." : "Salvar atualização"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function SaleCard({
  order,
  expanded,
  onToggle,
  onUpdate,
}: {
  order: Order;
  expanded: boolean;
  onToggle: () => void;
  onUpdate: () => void;
}) {
  const firstItem = order.items[0];
  const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);
  const canUpdate = Boolean(nextStatus[order.status]?.length);
  return (
    <article className="sale-card">
      <div className="sale-card-top">
        <div>
          <span>Pedido {order.order_code}</span>
          <time dateTime={order.created_at}>
            Realizado em {formatDate(order.created_at)}
          </time>
        </div>
        <strong className={`is-${order.status}`}>
          {statusLabel[order.status]}
        </strong>
      </div>
      <div className="sale-card-main">
        <div className="sale-image">
          {firstItem?.image_url ? (
            <img src={firstItem.image_url} alt={firstItem.product_name} />
          ) : (
            <Sparkles size={25} />
          )}
        </div>
        <div className="sale-copy">
          <small>Cliente: {order.client_name}</small>
          <h2>{order.product_name}</h2>
          <p>
            {itemCount} {itemCount === 1 ? "item" : "itens"} ·{" "}
            {money.format(Number(order.total_amount || 0))}
          </p>
          {order.estimated_delivery_date && (
            <span>
              <Truck size={14} /> Previsão:{" "}
              {formatDate(order.estimated_delivery_date)}
            </span>
          )}
        </div>
        <div className="sale-actions">
          {canUpdate && (
            <button type="button" className="sale-update" onClick={onUpdate}>
              Atualizar pedido
            </button>
          )}
          <button type="button" onClick={onToggle} aria-expanded={expanded}>
            Ver detalhes <ChevronDown size={15} />
          </button>
        </div>
      </div>
      {expanded && (
        <div className="sale-details">
          <div className="sale-detail-grid">
            <section>
              <h3>Andamento</h3>
              <ol>
                {order.history.map((event) => (
                  <li
                    key={event.id}
                    className={event.status === order.status ? "current" : ""}
                  >
                    <span />
                    <div>
                      <strong>{statusLabel[event.status]}</strong>
                      {event.description && <p>{event.description}</p>}
                      <time dateTime={event.created_at}>
                        {formatDate(event.created_at, true)}
                      </time>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
            <section className="sale-info">
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
                      ? `${order.shipping_address}, ${order.shipping_number}${order.shipping_complement ? ` · ${order.shipping_complement}` : ""} · ${order.shipping_city}/${order.shipping_state} · CEP ${formatCep(order.shipping_cep)}`
                      : "Não informado no pedido antigo"}
                  </dd>
                </div>
                <div>
                  <dt>Frete</dt>
                  <dd>{money.format(Number(order.shipping_amount || 0))}</dd>
                </div>
                {order.platform_fee_percent !== undefined && (
                  <>
                    <div>
                      <dt>Tarifa Artenós</dt>
                      <dd>
                        {money.format(Number(order.platform_fee_amount || 0))}{" "}
                        ({Number(order.platform_fee_percent).toLocaleString(
                          "pt-BR",
                        )}
                        %)
                      </dd>
                    </div>
                    <div>
                      <dt>Líquido previsto</dt>
                      <dd>
                        {money.format(Number(order.artisan_net_amount || 0))}
                      </dd>
                    </div>
                  </>
                )}
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
                        <FileText size={13} /> Abrir nota
                      </a>
                    )}
                  </dd>
                </div>
              </dl>
              <Link href="/vendedor/mensagens">
                <MessageCircle size={15} /> Abrir mensagens
              </Link>
            </section>
          </div>
          <section className="sale-items">
            <h3>Itens do pedido</h3>
            {order.items.map((item) => (
              <div key={item.id}>
                <span>
                  {item.quantity}× {item.product_name}
                </span>
                <strong>{money.format(Number(item.subtotal))}</strong>
              </div>
            ))}
            <div className="sale-total">
              <span>Total</span>
              <strong>{money.format(Number(order.total_amount || 0))}</strong>
            </div>
          </section>
        </div>
      )}
    </article>
  );
}
