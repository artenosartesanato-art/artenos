"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ExternalLink, Loader2, MapPin, Store } from "@/components/icons";
import { Dialog } from "@/components/ui/dialog";
import { useAdmin } from "@/components/admin-shell";
import { SuspensionStatus, useAdminSuspensions } from "@/components/admin-suspensions";
import {
  AdminPageHead, Badge, ColumnChart, FilterChips, LoadState, Pagination, SearchBar, friendlyError,
} from "@/components/admin-ui";
import { OptimizedImage } from "@/components/optimized-image";
import { getSupabase } from "@/lib/supabase";
import {
  ORDER_STATUS_LABEL, PAGE_SIZE, SELLER_STATUS_LABEL, brl, brlShort, formatDate, orderTone, type SellerStatus,
} from "@/lib/admin";

type SellerRow = {
  artisan_id: string; application_id: string | null; seller_status: SellerStatus; store_name: string | null; full_name: string;
  email: string | null; city: string | null; state: string | null; specialty: string | null; joined_at: string;
  products_active: number; orders_total: number; gmv: number; last_order_at: string | null; total_count: number;
};
type SellerDetail = {
  artisan_id: string; store_name: string | null; full_name: string; email: string | null; phone: string | null;
  document: string | null; city: string | null; state: string | null; specialty: string | null; story: string | null;
  joined_at: string;
  application: { id: string; number: number; status: string; decision_reason: string | null; decided_at: string | null } | null;
  metrics: { orders: number; cancelled: number; gmv: number; platform_fee: number; to_ship: number; delivered: number; customers: number; last_order_at: string | null };
  catalog: { active: number; inactive: number; out_of_stock: number };
  payouts: { pending_amount: number; paid_amount: number };
  products: { id: string; name: string; price: number; stock: number | null; active: boolean; image_url: string | null }[];
  recent_orders: { id: string; order_code: string; status: string; total_amount: number; created_at: string; client_name: string | null }[];
  monthly: { month: string; orders: number; gmv: number }[];
};
type Filter = "all" | SellerStatus;

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "Todas" },
  { value: "active", label: "Ativas" },
  { value: "suspended", label: "Suspensas" },
  { value: "in_review", label: "Em análise" },
  { value: "rejected", label: "Recusadas" },
];
const TONE: Record<SellerStatus, "ok" | "wait" | "alert" | "muted"> = { active: "ok", suspended: "alert", in_review: "wait", rejected: "muted" };
const monthShort = new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" });
const monthLong = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });

function maskDocument(value: string | null) {
  const digits = (value ?? "").replace(/\D/g, "");
  if (digits.length === 11) return digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  if (digits.length === 14) return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  return value || "—";
}

function SellerDrawer({ artisanId, onClose, onChanged }: { artisanId: string; onClose: () => void; onChanged: () => void }) {
  const { refreshWaiting } = useAdmin();
  const [detail, setDetail] = useState<SellerDetail | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [publicNote, setPublicNote] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data, error: loadError } = await getSupabase().rpc("admin_seller_detail", { p_artisan_id: artisanId });
    if (loadError) setError(friendlyError(loadError, "Não foi possível abrir esta loja."));
    else setDetail(data as SellerDetail);
    setLoading(false);
  }, [artisanId]);

  useEffect(() => { queueMicrotask(() => void load()); }, [load]);

  const suspended = detail?.application?.status === "suspended";
  const canAct = detail && (suspended || detail.application?.status !== "rejected");

  async function act() {
    if (!detail || saving) return;
    const action = suspended ? "reactivate" : "suspend";
    if (action === "suspend" && !publicNote.trim()) {
      toast.error("Explique o motivo: a orientação fica visível para a artesã.");
      return;
    }
    const name = detail.store_name || detail.full_name;
    if (!window.confirm(action === "suspend"
      ? `Suspender "${name}"? A loja sai da vitrine e o painel da loja fica bloqueado até a reativação.`
      : `Reativar "${name}"? A loja volta para a vitrine.`)) return;
    setSaving(true);
    const { error: actionError } = await getSupabase().rpc("admin_seller_action", {
      p_artisan_id: detail.artisan_id, p_action: action,
      p_public_note: publicNote.trim() || null, p_internal_note: internalNote.trim() || null,
    });
    setSaving(false);
    if (actionError) {
      toast.error(friendlyError(actionError, "Não foi possível registrar a decisão."));
      return;
    }
    toast.success(action === "suspend" ? "Loja suspensa." : "Loja reativada.");
    setPublicNote("");
    setInternalNote("");
    refreshWaiting();
    onChanged();
    void load();
  }

  return (
    <Dialog open onClose={onClose} variant="drawer" labelledBy="vendedor-titulo" className="adm-drawer" closeLabel="Fechar ficha da loja">
      <div className="an-drawer-body adm-drawer-body">
        <LoadState loading={loading && !detail} error={detail ? "" : error} onRetry={() => void load()}>
          {detail && (
            <>
              <header className="adm-drawer-head">
                <p className="seller-eyebrow">Ficha da loja</p>
                <h2 id="vendedor-titulo">{detail.store_name || detail.full_name}</h2>
                <p>
                  {detail.specialty || "Artesanato autoral"} · <MapPin size={13} /> {[detail.city, detail.state].filter(Boolean).join("/") || "—"}
                  {" · "}desde {formatDate(detail.joined_at)}
                </p>
                <div className="adm-drawer-links">
                  <Link href={`/loja?id=${detail.artisan_id}`} target="_blank"><ExternalLink size={14} /> Ver loja na vitrine</Link>
                  {detail.application && <Link href="/administracao/aprovacoes">Solicitação #{detail.application.number}</Link>}
                </div>
              </header>

              <div className="adm-mini-stats">
                <div><span>Vendido</span><strong>{brl(detail.metrics.gmv)}</strong></div>
                <div><span>Pedidos</span><strong>{detail.metrics.orders}</strong></div>
                <div><span>Clientes</span><strong>{detail.metrics.customers}</strong></div>
                <div><span>Tarifa gerada</span><strong>{brl(detail.metrics.platform_fee)}</strong></div>
                <div><span>A enviar</span><strong>{detail.metrics.to_ship}</strong></div>
                <div><span>Peças ativas</span><strong>{detail.catalog.active}</strong><small>{detail.catalog.out_of_stock} esgotada(s)</small></div>
                <div><span>Repasse pendente</span><strong>{brl(detail.payouts.pending_amount)}</strong></div>
                <div><span>Repassado</span><strong>{brl(detail.payouts.paid_amount)}</strong></div>
              </div>

              <section className="adm-drawer-section">
                <h3>Vendas nos últimos 6 meses</h3>
                <ColumnChart height={120} format={brlShort} caption="Valor vendido por mês"
                  data={detail.monthly.map((item) => {
                    const date = new Date(`${item.month}T00:00:00Z`);
                    return { key: item.month, label: monthLong.format(date), short: monthShort.format(date), value: Number(item.gmv),
                      detail: `${item.orders} ${Number(item.orders) === 1 ? "pedido" : "pedidos"}` };
                  })} />
              </section>

              <section className="adm-drawer-section">
                <h3>Responsável</h3>
                <dl className="adm-dl">
                  <div><dt>Nome</dt><dd>{detail.full_name}</dd></div>
                  <div><dt>E-mail</dt><dd>{detail.email || "—"}</dd></div>
                  <div><dt>Telefone</dt><dd>{detail.phone || "—"}</dd></div>
                  <div><dt>CPF/CNPJ</dt><dd>{maskDocument(detail.document)}</dd></div>
                </dl>
              </section>

              <section className="adm-drawer-section">
                <h3>Peças recentes</h3>
                {detail.products.length ? (
                  <ul className="adm-products">
                    {detail.products.map((product) => (
                      <li key={product.id}>
                        {product.image_url
                          ? <OptimizedImage src={product.image_url} alt="" width={44} height={44} sizes="44px" />
                          : <span className="adm-products-ph" aria-hidden="true"><Store size={16} /></span>}
                        <span><strong>{product.name}</strong><small>{brl(product.price)} · estoque {product.stock ?? "—"}</small></span>
                        <Badge tone={product.active ? "ok" : "muted"}>{product.active ? "Publicada" : "Pausada"}</Badge>
                      </li>
                    ))}
                  </ul>
                ) : <p className="adm-empty-line">Nenhuma peça cadastrada.</p>}
              </section>

              <section className="adm-drawer-section">
                <h3>Últimos pedidos</h3>
                {detail.recent_orders.length ? (
                  <ul className="adm-recent">
                    {detail.recent_orders.map((order) => (
                      <li key={order.id}>
                        <div><strong>{order.order_code}</strong><small>{order.client_name || "Cliente"} · {formatDate(order.created_at)}</small></div>
                        <Badge tone={orderTone(order.status)}>{ORDER_STATUS_LABEL[order.status] ?? order.status}</Badge>
                        <span>{brl(order.total_amount)}</span>
                      </li>
                    ))}
                  </ul>
                ) : <p className="adm-empty-line">Nenhum pedido ainda.</p>}
              </section>

              {canAct && (
                <section className="adm-drawer-section adm-decision">
                  <h3>{suspended ? "Reativar loja" : "Suspender loja"}</h3>
                  {suspended && detail.application?.decision_reason && (
                    <p className="adm-note">Motivo da suspensão: {detail.application.decision_reason}</p>
                  )}
                  <label className="adm-field">
                    <span>Orientação para a artesã {suspended ? "(opcional)" : "(obrigatória)"}</span>
                    <textarea rows={3} maxLength={2000} value={publicNote} onChange={(event) => setPublicNote(event.target.value)}
                      placeholder={suspended ? "Ex.: pendência resolvida, loja liberada." : "Ex.: fotos com marca d'água de outra loja."} />
                  </label>
                  <label className="adm-field">
                    <span>Nota interna (só a equipe vê)</span>
                    <textarea rows={2} maxLength={4000} value={internalNote} onChange={(event) => setInternalNote(event.target.value)} />
                  </label>
                  <button type="button" className={`adm-btn${suspended ? "" : " adm-btn--danger"}`} onClick={() => void act()} disabled={saving}>
                    {saving && <Loader2 size={15} className="admin-spin" />}
                    {suspended ? "Reativar loja" : "Suspender loja"}
                  </button>
                </section>
              )}
            </>
          )}
        </LoadState>
      </div>
    </Dialog>
  );
}

function SellersPage() {
  const params = useSearchParams();
  const [filter, setFilter] = useState<Filter>("active");
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [rows, setRows] = useState<SellerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState<string | null>(params.get("loja"));
  const { suspensions, reloadSuspensions } = useAdminSuspensions();

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data, error: loadError } = await getSupabase().rpc("admin_list_sellers", {
      p_status: filter === "all" ? null : filter, p_query: query || null, p_limit: PAGE_SIZE, p_offset: offset,
    });
    if (loadError) setError(friendlyError(loadError, "Não foi possível carregar os vendedores."));
    else setRows((data ?? []) as SellerRow[]);
    setLoading(false);
  }, [filter, query, offset]);

  useEffect(() => { queueMicrotask(() => void load()); }, [load]);

  const total = Number(rows[0]?.total_count ?? 0);
  return (
    <div className="adm-page">
      <AdminPageHead eyebrow="Operação" title="Vendedores"
        description="Todas as lojas da plataforma, com vendas, peças e situação. Abra uma loja para ver a ficha completa." />
      <div className="adm-toolbar">
        <SearchBar label="Buscar vendedores" value={input} onChange={setInput} placeholder="Loja, nome, e-mail ou cidade"
          onSubmit={() => { setOffset(0); setQuery(input.trim()); }} />
        <FilterChips label="Situação" value={filter} options={FILTERS} onChange={(value) => { setFilter(value); setOffset(0); }} />
      </div>
      <LoadState loading={loading} error={error} onRetry={() => void load()}>
        {rows.length ? (
          <>
            <p className="adm-count" aria-live="polite">{total} {total === 1 ? "loja" : "lojas"}</p>
            <div className="adm-table-wrap" tabIndex={0} role="region" aria-label="Tabela de lojas">
              <table className="adm-table">
                <thead>
                  <tr>
                    <th scope="col">Loja</th>
                    <th scope="col">Situação</th>
                    <th scope="col" className="is-num">Peças</th>
                    <th scope="col" className="is-num">Pedidos</th>
                    <th scope="col" className="is-num">Vendido</th>
                    <th scope="col">Última venda</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.artisan_id}>
                      <th scope="row">
                        <button type="button" className="adm-row-link" onClick={() => setOpenId(row.artisan_id)}>
                          <strong>{row.store_name || row.full_name}</strong>
                          <small>{row.full_name} · {[row.city, row.state].filter(Boolean).join("/") || "—"}</small>
                        </button>
                      </th>
                      <td>
                        {row.seller_status === "active" && suspensions.get(row.artisan_id)
                          ? <SuspensionStatus userId={row.artisan_id} until={suspensions.get(row.artisan_id)!} onChanged={() => void reloadSuspensions()} />
                          : <Badge tone={TONE[row.seller_status]}>{SELLER_STATUS_LABEL[row.seller_status]}</Badge>}
                      </td>
                      <td className="is-num">{row.products_active}</td>
                      <td className="is-num">{row.orders_total}</td>
                      <td className="is-num">{brl(row.gmv)}</td>
                      <td>{row.last_order_at ? formatDate(row.last_order_at) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination offset={offset} total={total} pageSize={PAGE_SIZE} onChange={setOffset} />
          </>
        ) : (
          <div className="adm-state"><Store size={26} /><p>Nenhuma loja encontrada com estes filtros.</p></div>
        )}
      </LoadState>
      {openId && <SellerDrawer artisanId={openId} onClose={() => setOpenId(null)} onChanged={() => void load()} />}
    </div>
  );
}

export default function Page() {
  return <Suspense fallback={null}><SellersPage /></Suspense>;
}
