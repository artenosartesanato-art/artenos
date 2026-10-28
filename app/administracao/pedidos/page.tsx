"use client";

import { Fragment, Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Package } from "@/components/icons";
import {
  AdminPageHead, Badge, FilterChips, LoadState, Pagination, SearchBar, friendlyError,
} from "@/components/admin-ui";
import { getSupabase } from "@/lib/supabase";
import { ORDER_STATUS_LABEL, PAGE_SIZE, brl, formatDate, orderTone } from "@/lib/admin";

type OrderRow = {
  order_id: string; order_code: string; status: string; created_at: string; product_name: string; items_count: number;
  subtotal: number; shipping_amount: number; total_amount: number; platform_fee_amount: number | null;
  client_name: string | null; client_email: string | null; artisan_id: string; store_name: string | null;
  shipping_city: string | null; shipping_state: string | null; carrier: string | null; tracking_code: string | null; total_count: number;
};

const FILTERS = [
  { value: "all", label: "Todos" },
  { value: "open", label: "Em andamento" },
  { value: "payment_confirmed", label: "Pagos" },
  { value: "preparing", label: "Em preparação" },
  { value: "shipped", label: "A caminho" },
  { value: "delivered", label: "Entregues" },
  { value: "delivery_failed", label: "Problema na entrega" },
  { value: "cancelled", label: "Cancelados" },
  { value: "refunded", label: "Reembolsados" },
];

function OrdersPage() {
  const params = useSearchParams();
  const initial = FILTERS.some((item) => item.value === params.get("status")) ? params.get("status")! : "all";
  const [filter, setFilter] = useState(initial);
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data, error: loadError } = await getSupabase().rpc("admin_list_orders", {
      p_status: filter === "all" ? null : filter, p_query: query || null, p_limit: PAGE_SIZE, p_offset: offset,
    });
    if (loadError) setError(friendlyError(loadError, "Não foi possível carregar os pedidos."));
    else setRows((data ?? []) as OrderRow[]);
    setLoading(false);
  }, [filter, query, offset]);

  useEffect(() => { queueMicrotask(() => void load()); }, [load]);

  const total = Number(rows[0]?.total_count ?? 0);
  const pageSum = rows.filter((row) => !["cancelled", "refunded"].includes(row.status))
    .reduce((sum, row) => sum + Number(row.total_amount), 0);

  return (
    <div className="adm-page">
      <AdminPageHead eyebrow="Operação" title="Pedidos"
        description="Todos os pedidos da plataforma. Cada loja atualiza o envio no próprio painel; aqui você acompanha e encontra qualquer pedido." />
      <div className="adm-toolbar">
        <SearchBar label="Buscar pedidos" value={input} onChange={setInput} placeholder="Código, peça, cliente, loja ou rastreio"
          onSubmit={() => { setOffset(0); setQuery(input.trim()); }} />
        <FilterChips label="Situação do pedido" value={filter} options={FILTERS}
          onChange={(value) => { setFilter(value); setOffset(0); }} />
      </div>
      <LoadState loading={loading} error={error} onRetry={() => void load()}>
        {rows.length ? (
          <>
            <p className="adm-count" aria-live="polite">
              {total} {total === 1 ? "pedido" : "pedidos"} · {brl(pageSum)} nesta página (sem cancelados)
            </p>
            <div className="adm-table-wrap" tabIndex={0} role="region" aria-label="Tabela de pedidos">
              <table className="adm-table">
                <thead>
                  <tr>
                    <th scope="col">Pedido</th>
                    <th scope="col">Loja</th>
                    <th scope="col">Cliente</th>
                    <th scope="col">Situação</th>
                    <th scope="col" className="is-num">Total</th>
                    <th scope="col">Data</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <Fragment key={row.order_id}>
                      <tr>
                        <th scope="row">
                          <button type="button" className="adm-row-link" aria-expanded={open === row.order_id}
                            onClick={() => setOpen(open === row.order_id ? null : row.order_id)}>
                            <strong>{row.order_code}</strong>
                            <small>{row.product_name}{Number(row.items_count) > 1 ? ` + ${Number(row.items_count) - 1}` : ""}</small>
                          </button>
                        </th>
                        <td><Link href={`/administracao/vendedores?loja=${row.artisan_id}`}>{row.store_name || "Loja"}</Link></td>
                        <td>{row.client_name || "—"}</td>
                        <td><Badge tone={orderTone(row.status)}>{ORDER_STATUS_LABEL[row.status] ?? row.status}</Badge></td>
                        <td className="is-num">{brl(row.total_amount)}</td>
                        <td>{formatDate(row.created_at, true)}</td>
                      </tr>
                      {open === row.order_id && (
                        <tr className="adm-row-detail">
                          <td colSpan={6}>
                            <dl className="adm-dl adm-dl--row">
                              <div><dt>Peças</dt><dd>{brl(row.subtotal)} ({row.items_count} un.)</dd></div>
                              <div><dt>Frete</dt><dd>{brl(row.shipping_amount)}</dd></div>
                              <div><dt>Tarifa da plataforma</dt><dd>{row.platform_fee_amount === null ? "—" : brl(row.platform_fee_amount)}</dd></div>
                              <div><dt>Destino</dt><dd>{[row.shipping_city, row.shipping_state].filter(Boolean).join("/") || "—"}</dd></div>
                              <div><dt>Envio</dt><dd>{row.carrier || "—"}{row.tracking_code ? ` · ${row.tracking_code}` : ""}</dd></div>
                              <div><dt>E-mail do cliente</dt><dd>{row.client_email || "—"}</dd></div>
                            </dl>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination offset={offset} total={total} pageSize={PAGE_SIZE} onChange={setOffset} />
          </>
        ) : (
          <div className="adm-state"><Package size={26} /><p>Nenhum pedido com estes filtros.</p></div>
        )}
      </LoadState>
    </div>
  );
}

export default function Page() {
  return <Suspense fallback={null}><OrdersPage /></Suspense>;
}
