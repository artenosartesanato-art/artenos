"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Camera,
  CheckCircle2,
  Heart,
  LoaderCircle,
  Mail,
  PackageCheck,
  RefreshCw,
  ShoppingBag,
  Sparkles,
  Store,
  Tags,
} from "@/components/icons";
import { useSellerProfile } from "@/components/seller-shell";
import { getSupabase } from "@/lib/supabase";

type Overview = {
  total_products: number;
  published_products: number;
  paused_products: number;
  out_of_stock_products: number;
  ready_to_ship_products: number;
  favorite_count: number;
};
type Snapshot = {
  overview: Overview | null;
  ordersToPrepare: number;
  ordersInTransit: number;
  pendingRequests: number;
  hasCover: boolean;
  hasStory: boolean;
};

export default function SellerHomePage() {
  const profile = useSellerProfile();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!profile) return;
    let active = true;
    const supabase = getSupabase();
    void Promise.all([
      supabase.rpc("get_my_store_overview"),
      supabase.rpc("list_my_orders"),
      supabase.rpc("list_my_custom_order_requests"),
      supabase.rpc("get_my_artisan_store"),
    ])
      .then(([overview, orders, requests, store]) => {
        if (!active) return;
        if (overview.error || orders.error) throw overview.error || orders.error;
        const sales = ((orders.data ?? []) as { my_role: string; status: string }[]).filter((order) => order.my_role === "artisan");
        const storeRow = (Array.isArray(store.data) ? store.data[0] : store.data) as { cover_path?: string | null; story?: string | null } | null;
        setSnapshot({
          overview: (Array.isArray(overview.data) ? overview.data[0] : overview.data) as Overview | null,
          ordersToPrepare: sales.filter((order) => ["payment_confirmed", "preparing"].includes(order.status)).length,
          ordersInTransit: sales.filter((order) => ["shipped", "out_for_delivery"].includes(order.status)).length,
          pendingRequests: requests.error ? 0 : ((requests.data ?? []) as { my_role: string; status: string }[])
            .filter((request) => request.my_role === "artisan" && request.status === "pending").length,
          hasCover: Boolean(storeRow?.cover_path),
          hasStory: Boolean(storeRow?.story && storeRow.story.trim().length >= 40),
        });
        setError(false);
      })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [profile, attempt]);

  if (!profile)
    return (
      <section className="seller-gate" role="status">
        <LoaderCircle className="seller-spin" size={30} />
        <strong>Preparando o painel da sua loja…</strong>
      </section>
    );
  const firstName = profile.full_name.trim().split(/\s+/)[0] || "artesã";
  const overview = snapshot?.overview;
  const steps = snapshot ? [
    {
      done: (overview?.total_products ?? 0) > 0,
      href: "/vendedor/catalogo",
      icon: Tags,
      title: (overview?.total_products ?? 0) > 0 ? "Peças cadastradas" : "Cadastre sua primeira peça",
      text: (overview?.total_products ?? 0) > 0
        ? `${overview?.published_products ?? 0} publicada(s) na vitrine.`
        : "Fotos, preço, estoque e medidas para o frete.",
    },
    {
      done: snapshot.ordersToPrepare === 0,
      href: "/vendedor/vendas",
      icon: ShoppingBag,
      title: snapshot.ordersToPrepare ? `Prepare ${snapshot.ordersToPrepare} ${snapshot.ordersToPrepare === 1 ? "venda" : "vendas"}` : "Nenhuma venda aguardando preparo",
      text: snapshot.ordersToPrepare ? "Atualize o status e informe o rastreio ao postar." : "Novas vendas pagas aparecem aqui.",
    },
    {
      done: snapshot.pendingRequests === 0,
      href: "/vendedor/encomendas",
      icon: PackageCheck,
      title: snapshot.pendingRequests ? `Responda ${snapshot.pendingRequests} ${snapshot.pendingRequests === 1 ? "pedido de orçamento" : "pedidos de orçamento"}` : "Encomendas em dia",
      text: snapshot.pendingRequests ? "Envie uma proposta de valor e prazo." : "Nenhuma solicitação esperando resposta.",
    },
    {
      done: snapshot.hasCover && snapshot.hasStory,
      href: "/vendedor/minha-loja",
      icon: Camera,
      title: snapshot.hasCover && snapshot.hasStory ? "Vitrine da loja completa" : "Complete a apresentação da loja",
      text: snapshot.hasCover && snapshot.hasStory ? "Capa e história publicadas." : [!snapshot.hasCover && "adicione uma capa", !snapshot.hasStory && "conte sua história"].filter(Boolean).join(" e ") + ".",
    },
  ].sort((a, b) => Number(a.done) - Number(b.done)) : [];

  return (
    <>
      <section className="seller-welcome">
        <div>
          <p className="seller-eyebrow">Área da artesã</p>
          <h1>Olá, {firstName}.<br />Sua loja começa aqui.</h1>
          <p>
            Este é o espaço de gestão de <strong>{profile.store_name || "sua loja"}</strong>. Cadastre peças,
            responda encomendas e acompanhe suas vendas.
          </p>
          <Link className="seller-welcome-link" href="/vendedor/catalogo">Cadastrar uma peça <ArrowRight size={17} /></Link>
        </div>
        <span className="seller-welcome-art" aria-hidden="true"><Sparkles size={42} /></span>
      </section>

      <section className="seller-section" aria-labelledby="seller-overview-title">
        <div className="seller-section-heading">
          <div>
            <p className="seller-eyebrow">Hoje na sua loja</p>
            <h2 id="seller-overview-title">Visão geral</h2>
          </div>
        </div>
        {error ? (
          <div className="an-alert an-alert--error" role="alert">
            <span>Não foi possível carregar os números da loja agora.</span>
            <button type="button" className="an-btn an-btn--secondary an-btn--sm" onClick={() => { setError(false); setAttempt((value) => value + 1); }}>
              <RefreshCw size={14} /> Tentar novamente
            </button>
          </div>
        ) : !snapshot ? (
          <div className="seller-metrics" role="status" aria-label="Carregando números da loja">
            {[0, 1, 2, 3].map((index) => <span key={index} className="an-skeleton seller-metric-skeleton" />)}
          </div>
        ) : (
          <div className="seller-metrics">
            <Link className={`seller-metric${snapshot.ordersToPrepare ? " is-attention" : ""}`} href="/vendedor/vendas">
              <span className="seller-metric-label">Vendas a preparar</span>
              <strong className="seller-metric-value">{snapshot.ordersToPrepare}</strong>
              <small>{snapshot.ordersInTransit} a caminho do cliente</small>
            </Link>
            <Link className={`seller-metric${snapshot.pendingRequests ? " is-attention" : ""}`} href="/vendedor/encomendas">
              <span className="seller-metric-label">Orçamentos pendentes</span>
              <strong className="seller-metric-value">{snapshot.pendingRequests}</strong>
              <small>{snapshot.pendingRequests ? "Aguardando sua resposta" : "Tudo respondido"}</small>
            </Link>
            <Link className="seller-metric" href="/vendedor/catalogo">
              <span className="seller-metric-label">Peças publicadas</span>
              <strong className="seller-metric-value">{overview?.published_products ?? 0}</strong>
              <small>{overview?.paused_products ?? 0} pausadas · {overview?.out_of_stock_products ?? 0} esgotadas</small>
            </Link>
            <div className="seller-metric">
              <span className="seller-metric-label">Salvas como favoritas</span>
              <strong className="seller-metric-value">{overview?.favorite_count ?? 0}</strong>
              <small><Heart size={12} /> por clientes da vitrine</small>
            </div>
          </div>
        )}
      </section>

      {snapshot && (
        <section className="seller-section" aria-labelledby="seller-next-title">
          <div className="seller-section-heading">
            <div>
              <p className="seller-eyebrow">Próximas ações</p>
              <h2 id="seller-next-title">O que pede sua atenção</h2>
            </div>
          </div>
          <ul className="seller-next-steps">
            {steps.map((step) => (
              <li key={step.href} className={step.done ? "is-done" : ""}>
                <Link href={step.href}>
                  <span aria-hidden="true">{step.done ? <CheckCircle2 size={20} /> : <step.icon size={19} />}</span>
                  <div>
                    <strong>{step.title}</strong>
                    <small>{step.text}</small>
                  </div>
                  <ArrowRight size={18} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="seller-section seller-quick-section" aria-labelledby="seller-quick-title">
        <div className="seller-section-heading">
          <div>
            <p className="seller-eyebrow">Atalhos</p>
            <h2 id="seller-quick-title">Continue pela Artenós</h2>
          </div>
        </div>
        <div className="seller-quick-grid">
          <Link href="/vendedor/mensagens">
            <span><Mail size={21} /></span>
            <div><strong>Mensagens</strong><small>Converse com seus clientes</small></div>
            <ArrowRight size={18} />
          </Link>
          <Link href="/vendedor/minha-loja">
            <span><Store size={21} /></span>
            <div><strong>Minha loja</strong><small>Capa, história e prazos</small></div>
            <ArrowRight size={18} />
          </Link>
          <Link href="/">
            <span><Sparkles size={21} /></span>
            <div><strong>Vitrine Artenós</strong><small>Veja a loja como o cliente vê</small></div>
            <ArrowRight size={18} />
          </Link>
        </div>
      </section>
    </>
  );
}
