"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, MapPin, RefreshCw, Search, Store } from "@/components/icons";
import { getSupabase } from "@/lib/supabase";
import "../storefront.css";
import "./shops.css";

type Shop = { id: string; store_name: string; specialty: string | null; story: string | null; city: string | null; state: string | null };

function initials(name: string) {
  return name.split(/\s+/).filter((word) => word.length > 2).slice(0, 2).map((word) => word[0]?.toUpperCase()).join("") || "A";
}

export default function ShopsPage() {
  const [shops, setShops] = useState<Shop[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
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
  }, [attempt]);

  const visible = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("pt-BR");
    if (!term) return shops;
    return shops.filter((shop) => [shop.store_name, shop.specialty, shop.city, shop.state, shop.story]
      .some((value) => value?.toLocaleLowerCase("pt-BR").includes(term)));
  }, [query, shops]);

  return (
    <div className="store-page shops-page">
      <main id="conteudo" tabIndex={-1} className="store-container shops-main">
        <header className="shops-intro">
          <p className="store-eyebrow">Quem faz a Artenós</p>
          <h1>Lojas e artesãs</h1>
          <p>Conheça as lojas aprovadas, suas técnicas e as histórias por trás de cada peça.</p>
        </header>
        <label className="shops-search">
          <Search size={18} />
          <span className="an-visually-hidden">Filtrar lojas</span>
          <input className="an-input" type="search" value={query} onChange={(event) => setQuery(event.target.value)}
            placeholder="Filtrar por loja, técnica ou cidade" />
        </label>
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
            {query && <div className="an-state-actions"><button type="button" className="an-btn an-btn--secondary" onClick={() => setQuery("")}>Limpar filtro</button></div>}
          </div>
        )}
      </main>
    </div>
  );
}
