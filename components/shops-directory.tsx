"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, MapPin, RefreshCw, Search, Store } from "@/components/icons";
import { getSupabase } from "@/lib/supabase";
import "@/app/storefront.css";
import "@/app/lojas/shops.css";

export type Shop = { id: string; store_name: string; specialty: string | null; story: string | null; city: string | null; state: string | null };

function initials(name: string) {
  return name.split(/\s+/).filter((word) => word.length > 2).slice(0, 2).map((word) => word[0]?.toUpperCase()).join("") || "A";
}

/** `initial` vem do servidor (app/lojas/page.tsx); null = buscar no navegador. */
export function ShopsDirectory({ initial }: { initial: Shop[] | null }) {
  const [shops, setShops] = useState<Shop[]>(initial ?? []);
  const [query, setQuery] = useState("");
  const [uf, setUf] = useState("");
  const [loading, setLoading] = useState(!initial);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (initial && attempt === 0) return;
    let active = true;
    void Promise.resolve(getSupabase().rpc("list_storefront_shops", { p_limit: 100 }))
      .then(({ data, error: loadError }) => {
        if (!active) return;
        if (loadError) throw loadError;
        setShops((data || []) as Shop[]);
        setError("");
      })
      .catch(() => { if (active) setError("Não foi possível carregar as lojas agora."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [attempt, initial]);

  // Estados que têm loja de verdade, com a contagem.
  const states = useMemo(() => {
    const counts = new Map<string, number>();
    for (const shop of shops) {
      const state = shop.state?.trim().toUpperCase();
      if (state) counts.set(state, (counts.get(state) ?? 0) + 1);
    }
    return [...counts].sort(([a], [b]) => a.localeCompare(b));
  }, [shops]);

  const visible = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("pt-BR");
    return shops.filter((shop) => (!uf || shop.state?.trim().toUpperCase() === uf) && (!term ||
      [shop.store_name, shop.specialty, shop.city, shop.state, shop.story]
        .some((value) => value?.toLocaleLowerCase("pt-BR").includes(term))));
  }, [query, shops, uf]);

  return (
    <div className="store-page shops-page">
      <main id="conteudo" tabIndex={-1} className="store-container shops-main">
        <header className="shops-intro">
          <p className="store-eyebrow">Quem faz a Artenós</p>
          <h1>Lojas e artesãs</h1>
          <p>Conheça as lojas aprovadas, suas técnicas e as histórias por trás de cada peça.</p>
        </header>
        <div className="shops-filters">
        <label className="shops-search">
          <Search size={18} />
          <span className="an-visually-hidden">Filtrar lojas</span>
          <input className="an-input" type="search" value={query} onChange={(event) => setQuery(event.target.value)}
            placeholder="Filtrar por loja, técnica ou cidade" />
        </label>
        {states.length > 1 && (
          <label className="shops-state">
            <MapPin size={16} />
            <span className="an-visually-hidden">Estado</span>
            <select className="an-input" value={uf} onChange={(event) => setUf(event.target.value)}>
              <option value="">Todos os estados</option>
              {states.map(([state, count]) => <option key={state} value={state}>{state} ({count})</option>)}
            </select>
          </label>
        )}
        </div>
        {!loading && !error && <p className="shops-count" aria-live="polite">{visible.length} {visible.length === 1 ? "loja" : "lojas"}</p>}
        {loading ? (
          <div className="shops-grid" aria-label="Carregando lojas" role="status">
            {Array.from({ length: 6 }, (_, index) => <span key={index} className="an-skeleton shops-skeleton" />)}
          </div>
        ) : error ? (
          <div className="an-state" role="alert">
            <Store size={34} />
            <h2>{error}</h2>
            <div className="an-state-actions">
              <button type="button" className="an-btn" onClick={() => { setLoading(true); setAttempt((value) => value + 1); }}>
                <RefreshCw size={15} /> Tentar novamente
              </button>
            </div>
          </div>
        ) : visible.length ? (
          <section className="shops-grid" aria-label="Lojas">
            {visible.map((shop) => (
              <Link prefetch={false} href={`/loja?id=${encodeURIComponent(shop.id)}`} key={shop.id}>
                <span className="shops-symbol" aria-hidden="true">{initials(shop.store_name)}</span>
                <small>{shop.specialty || "Artesanato autoral"}</small>
                <h2>{shop.store_name}</h2>
                <p>{shop.story || "Conheça as peças e o trabalho desta loja."}</p>
                <span className="shops-card-footer">
                  <em><MapPin size={14} /> {[shop.city, shop.state].filter(Boolean).join(" · ") || "Brasil"}</em>
                  <strong>Visitar <ArrowRight size={15} /></strong>
                </span>
              </Link>
            ))}
          </section>
        ) : (
          <div className="an-state">
            <Store size={34} />
            <h2>Nenhuma loja encontrada</h2>
            <p>{shops.length ? "Tente outro nome, técnica ou cidade." : "As lojas aprovadas aparecerão aqui."}</p>
            {(query || uf) && <div className="an-state-actions"><button type="button" className="an-btn an-btn--secondary" onClick={() => { setQuery(""); setUf(""); }}>Limpar filtro</button></div>}
          </div>
        )}
      </main>
    </div>
  );
}
