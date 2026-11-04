"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle, ArrowRight, HandCoins, MessageCircle, Package, PackageCheck, Palette, Percent, RefreshCw,
  ShoppingBag, Store, Tags, Truck, UserRound, UserRoundCheck,
} from "@/components/icons";
import { useAdmin } from "@/components/admin-shell";
import {
  AdminPageHead, Badge, ColumnChart, FilterChips, LoadState, RankBars, StatCard, friendlyError, type BarDatum,
} from "@/components/admin-ui";
import { getSupabase } from "@/lib/supabase";
import { ORDER_STATUS_LABEL, brl, brlShort, change, formatDate, orderTone } from "@/lib/admin";
import { normalizeDashboard, type Dashboard } from "@/lib/admin-dashboard";

type RecentOrder = { order_id: string; order_code: string; status: string; created_at: string; total_amount: number; store_name: string; client_name: string };

const PERIODS = [
  { value: "7", label: "7 dias" },
  { value: "30", label: "30 dias" },
  { value: "90", label: "90 dias" },
  { value: "365", label: "12 meses" },
] as const;
type Period = (typeof PERIODS)[number]["value"];

const dayShort = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
const dayLong = new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "short", timeZone: "UTC" });
const monthShort = new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" });
const monthLong = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });

/** Até 90 dias: uma coluna por dia. 12 meses: soma por mês. */
function chartData(daily: Dashboard["daily"], days: number): BarDatum[] {
  if (days <= 90) {
    return daily.map((item) => {
      const date = new Date(`${item.day}T00:00:00Z`);
      return {
        key: item.day, label: dayLong.format(date), short: dayShort.format(date), value: Number(item.gmv),
        detail: `${item.orders} ${Number(item.orders) === 1 ? "pedido" : "pedidos"}`,
      };
    });
  }
  const months = new Map<string, { gmv: number; orders: number }>();
  for (const item of daily) {
    const key = item.day.slice(0, 7);
    const entry = months.get(key) ?? { gmv: 0, orders: 0 };
    entry.gmv += Number(item.gmv);
    entry.orders += Number(item.orders);
    months.set(key, entry);
  }
  return [...months].map(([key, entry]) => {
    const date = new Date(`${key}-01T00:00:00Z`);
    return { key, label: monthLong.format(date), short: monthShort.format(date), value: entry.gmv,
      detail: `${entry.orders} ${entry.orders === 1 ? "pedido" : "pedidos"}` };
  });
}

export default function AdminDashboardPage() {
  const { account, waiting } = useAdmin();
  const [period, setPeriod] = useState<Period>("30");
  const [data, setData] = useState<Dashboard | null>(null);
  const [recent, setRecent] = useState<RecentOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const supabase = getSupabase();
      const [dashboard, orders] = await Promise.all([
        supabase.rpc("admin_dashboard", { p_days: Number(period) }),
        supabase.rpc("admin_list_orders", { p_status: null, p_query: null, p_limit: 6, p_offset: 0 }),
      ]);
      if (dashboard.error) throw dashboard.error;
      const normalized = normalizeDashboard(dashboard.data);
      if (!normalized) throw new Error("Resposta vazia do painel");
      setData(normalized);
      setRecent((orders.data ?? []) as RecentOrder[]);
      setUpdatedAt(new Date());
    } catch (loadError) {
      setError(friendlyError(loadError, "Não foi possível carregar os números agora."));
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { queueMicrotask(() => void load()); }, [load]);

  const first = account.name.split(/\s+/)[0];
  const periodLabel = PERIODS.find((item) => item.value === period)?.label ?? "";
  const ticket = data && Number(data.sales.orders) ? Number(data.sales.gmv) / Number(data.sales.orders) : 0;

  return (
    <div className="adm-page">
      <AdminPageHead eyebrow="Administração" title={first ? `Olá, ${first}` : "Visão geral"}
        description="Números calculados agora, direto dos pedidos, lojas e cadastros da plataforma."
        actions={<>
          <FilterChips label="Período" value={period} onChange={setPeriod}
            options={PERIODS.map((item) => ({ value: item.value, label: item.label }))} />
          <button type="button" className="adm-btn adm-btn--ghost" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={15} className={loading ? "admin-spin" : ""} /> Atualizar
          </button>
        </>} />

      {(waiting > 0 || (data && (data.to_ship > 0 || data.delivery_problems > 0 || data.payouts.failed_count > 0))) && (
        <section className="adm-alerts" aria-label="Precisa de atenção">
          {waiting > 0 && (
            <Link href="/administracao/aprovacoes"><UserRoundCheck size={18} />
              <span><strong>{waiting}</strong> {waiting === 1 ? "cadastro de loja aguarda" : "cadastros de loja aguardam"} decisão</span>
              <ArrowRight size={15} /></Link>
          )}
          {data && data.to_ship > 0 && (
            <Link href="/administracao/pedidos?status=open"><PackageCheck size={18} />
              <span><strong>{data.to_ship}</strong> {data.to_ship === 1 ? "pedido pago aguarda" : "pedidos pagos aguardam"} envio da loja</span>
              <ArrowRight size={15} /></Link>
          )}
          {data && data.delivery_problems > 0 && (
            <Link href="/administracao/pedidos?status=delivery_failed" className="is-alert"><AlertTriangle size={18} />
              <span><strong>{data.delivery_problems}</strong> com problema na entrega</span>
              <ArrowRight size={15} /></Link>
          )}
          {data && data.payouts.failed_count > 0 && (
            <div className="is-alert"><AlertTriangle size={18} />
              <span><strong>{data.payouts.failed_count}</strong> {data.payouts.failed_count === 1 ? "repasse falhou" : "repasses falharam"}</span></div>
          )}
        </section>
      )}

      <LoadState loading={loading && !data} error={data ? "" : error} onRetry={() => void load()}>
        {data && (
          <>
            {error && <p className="adm-inline-error" role="alert">{error}</p>}
            <section aria-labelledby="vendas-titulo" className="adm-section">
              <div className="adm-section-head">
                <h2 id="vendas-titulo">Vendas · últimos {periodLabel}</h2>
                {updatedAt && <small>Atualizado às {updatedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</small>}
              </div>
              <div className="adm-stats">
                <StatCard icon={ShoppingBag} label="Vendido (com frete)" value={brl(data.sales.gmv)}
                  delta={change(Number(data.sales.gmv), Number(data.sales_previous.gmv))}
                  hint={`${brl(data.sales.products_amount)} em peças`} />
                <StatCard icon={Package} label="Pedidos" value={String(data.sales.orders)}
                  delta={change(Number(data.sales.orders), Number(data.sales_previous.orders))}
                  hint={data.cancelled ? `${data.cancelled} cancelado(s) fora da conta` : "nenhum cancelado"} href="/administracao/pedidos" />
                <StatCard icon={Percent} label="Receita da plataforma" value={brl(data.sales.platform_fee)}
                  delta={change(Number(data.sales.platform_fee), Number(data.sales_previous.platform_fee))} hint="tarifa sobre as peças" />
                <StatCard icon={Tags} label="Ticket médio" value={data.sales.orders ? brl(ticket) : "—"}
                  hint={`${data.sales.buyers} ${Number(data.sales.buyers) === 1 ? "comprador" : "compradores"} · ${data.sales.sellers} ${Number(data.sales.sellers) === 1 ? "loja vendeu" : "lojas venderam"}`} />
              </div>
              <div className="adm-card">
                <ColumnChart data={chartData(data.daily, data.period_days)} format={brlShort}
                  caption={`Valor vendido por ${data.period_days > 90 ? "mês" : "dia"} (pedidos não cancelados)`} />
              </div>
            </section>

            <div className="adm-grid-2">
              <section className="adm-card" aria-labelledby="lojas-top-titulo">
                <div className="adm-section-head">
                  <h2 id="lojas-top-titulo">Lojas que mais venderam</h2>
                  <Link href="/administracao/vendedores">Ver vendedores</Link>
                </div>
                <RankBars format={brl} empty="Nenhuma venda no período."
                  items={data.top_sellers.map((item) => ({
                    key: item.artisan_id, label: item.store_name, value: Number(item.gmv),
                    detail: `${item.orders} ${Number(item.orders) === 1 ? "pedido" : "pedidos"}`,
                    href: `/administracao/vendedores?loja=${item.artisan_id}`,
                  }))} />
              </section>
              <section className="adm-card" aria-labelledby="status-titulo">
                <div className="adm-section-head">
                  <h2 id="status-titulo">Pedidos por situação</h2>
                  <Link href="/administracao/pedidos">Ver pedidos</Link>
                </div>
                <RankBars format={(value) => String(value)} empty="Nenhum pedido no período."
                  items={data.orders_by_status.map((item) => ({
                    key: item.status, label: ORDER_STATUS_LABEL[item.status] ?? item.status, value: Number(item.total),
                    href: `/administracao/pedidos?status=${item.status}`,
                  }))} />
              </section>
            </div>

            <section className="adm-section" aria-labelledby="base-titulo">
              <div className="adm-section-head"><h2 id="base-titulo">Plataforma</h2></div>
              <div className="adm-stats adm-stats--compact">
                <StatCard icon={Store} label="Lojas ativas" value={String(data.sellers.active)}
                  hint={`${data.products.shops_with_products} com peças publicadas`} href="/administracao/vendedores" />
                <StatCard icon={UserRoundCheck} label="Lojas em análise" value={String(data.applications.waiting)}
                  hint={data.applications.suspended ? `${data.applications.suspended} suspensa(s)` : "nenhuma suspensa"} href="/administracao/aprovacoes" />
                <StatCard icon={UserRound} label="Clientes" value={String(data.clients.total)}
                  hint={`${data.clients.new} novo(s) no período`} href="/administracao/clientes" />
                <StatCard icon={Palette} label="Peças publicadas" value={String(data.products.active)}
                  hint={`${data.products.out_of_stock} esgotada(s) · ${data.products.new} nova(s)`} />
                <StatCard icon={HandCoins} label="Repasses pendentes" value={brl(data.payouts.pending_amount)}
                  hint={`${data.payouts.pending_count} repasse(s) · ${brl(data.payouts.paid_amount)} pagos no período`} />
                <StatCard icon={Truck} label="Aguardando envio" value={String(data.to_ship)} hint="pedidos pagos ainda não enviados"
                  href="/administracao/pedidos?status=open" />
                <StatCard icon={MessageCircle} label="Mensagens" value={String(data.messages)} hint="trocadas no período" />
                <StatCard icon={Palette} label="Encomendas" value={String(data.custom_orders)} hint="pedidos sob medida no período" />
              </div>
            </section>

            <div className="adm-grid-2">
              <section className="adm-card" aria-labelledby="categorias-top-titulo">
                <div className="adm-section-head">
                  <h2 id="categorias-top-titulo">Categorias que mais venderam</h2>
                  <Link href="/administracao/categorias">Ver categorias</Link>
                </div>
                <RankBars format={brl} empty="Sem itens vendidos no período."
                  items={data.top_categories.map((item) => ({
                    key: item.name, label: item.name, value: Number(item.amount),
                    detail: `${item.units} ${Number(item.units) === 1 ? "unidade" : "unidades"}`,
                  }))} />
              </section>
              <section className="adm-card" aria-labelledby="recentes-titulo">
                <div className="adm-section-head">
                  <h2 id="recentes-titulo">Últimos pedidos</h2>
                  <Link href="/administracao/pedidos">Ver todos</Link>
                </div>
                {recent.length ? (
                  <ul className="adm-recent">
                    {recent.map((order) => (
                      <li key={order.order_id}>
                        <div>
                          <strong>{order.order_code}</strong>
                          <small>{order.store_name} · {order.client_name || "Cliente"} · {formatDate(order.created_at, true)}</small>
                        </div>
                        <Badge tone={orderTone(order.status)}>{ORDER_STATUS_LABEL[order.status] ?? order.status}</Badge>
                        <span>{brl(order.total_amount)}</span>
                      </li>
                    ))}
                  </ul>
                ) : <p className="adm-empty-line">Nenhum pedido ainda.</p>}
              </section>
            </div>
          </>
        )}
      </LoadState>
    </div>
  );
}
