"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Heart, PackageOpen, RefreshCw, Search } from "@/components/icons";
import { CustomerHeader } from "@/components/customer-header";
import { CustomerFooter } from "@/components/customer-footer";
import { useMarketplace } from "@/components/marketplace-state";
import { getSupabase } from "@/lib/supabase";
import { accessHref } from "@/lib/navigation";
import { MarketplaceProductCard, ProductGridSkeleton, type MarketplaceProduct } from "@/components/marketplace-product-card";
import "../storefront.css";
import "./favorites.css";

type FavoriteProduct = MarketplaceProduct & { favorite_created_at: string; total_count: number };

export default function FavoritesPage() {
  const { authReady, userId, favoriteIds, favoritesReady } = useMarketplace();
  const [products, setProducts] = useState<FavoriteProduct[]>([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const request = useRef(0);

  useEffect(() => {
    const current = ++request.current;
    if (!authReady || !userId) {
      queueMicrotask(() => {
        if (current !== request.current) return;
        setProducts([]);
        setLoading(!authReady);
      });
      return;
    }
    queueMicrotask(() => { if (current === request.current) { setLoading(true); setError(""); } });
    void Promise.resolve(getSupabase().rpc("list_my_favorite_products", { p_query: null, p_limit: 100, p_offset: 0 }))
      .then(({ data, error: favoriteError }) => {
        if (current !== request.current) return;
        if (favoriteError) throw favoriteError;
        setProducts((data || []) as FavoriteProduct[]);
      })
      .catch(() => { if (current === request.current) setError("Não foi possível carregar seus favoritos agora."); })
      .finally(() => { if (current === request.current) setLoading(false); });
  }, [authReady, userId, attempt]);

  // Um favorito removido pelo coração sai da lista na hora (depois que os
  // favoritos da conta já foram lidos pelo provedor global).
  const isSaved = (id: string) => !favoritesReady || favoriteIds.has(id);
  const visible = useMemo(() => {
    const term = filter.trim().toLocaleLowerCase("pt-BR");
    return products.filter((product) => isSaved(product.id) && (!term ||
      [product.name, product.shop_name, product.category_name].some((value) => value?.toLocaleLowerCase("pt-BR").includes(term))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, favoriteIds, favoritesReady, filter]);
  const savedCount = products.filter((product) => isSaved(product.id)).length;

  return (
    <div className="store-page favorites-page">
      <CustomerHeader />
      <main id="conteudo" tabIndex={-1} className="store-container favorites-main">
        <header className="favorites-intro">
          <div>
            <p className="store-eyebrow">Suas escolhas</p>
            <h1>Meus favoritos</h1>
            <p>As peças que conquistaram você ficam guardadas aqui. Toque no coração para tirar uma peça da lista.</p>
          </div>
          <span className="favorites-intro-icon" aria-hidden="true"><Heart size={34} fill="currentColor" /></span>
        </header>

        {!authReady || (userId && loading) ? (
          <ProductGridSkeleton count={4} className="favorites-grid" />
        ) : !userId ? (
          <section className="an-state">
            <Heart size={34} />
            <h2>Entre para ver seus favoritos</h2>
            <p>Ao entrar, as peças marcadas com o coração ficam salvas na sua conta, em qualquer aparelho.</p>
            <div className="an-state-actions">
              <Link className="an-btn" href={accessHref("/favoritos")}>Entrar ou criar conta <ArrowRight size={16} /></Link>
              <Link className="an-btn an-btn--secondary" href="/categorias">Explorar peças</Link>
            </div>
          </section>
        ) : error ? (
          <section className="an-state" role="alert">
            <PackageOpen size={34} />
            <h2>{error}</h2>
            <p>Seus favoritos continuam salvos. Confira a conexão e tente de novo.</p>
            <div className="an-state-actions">
              <button type="button" className="an-btn" onClick={() => setAttempt((value) => value + 1)}><RefreshCw size={15} /> Tentar novamente</button>
            </div>
          </section>
        ) : savedCount === 0 ? (
          <section className="an-state">
            <Heart size={34} />
            <h2>Você ainda não salvou nenhuma peça</h2>
            <p>Explore o catálogo e toque no coração das peças que mais gostar.</p>
            <div className="an-state-actions">
              <Link className="an-btn" href="/categorias">Explorar peças <ArrowRight size={16} /></Link>
            </div>
          </section>
        ) : (
          <>
            <div className="favorites-toolbar">
              <p aria-live="polite"><strong>{savedCount}</strong> {savedCount === 1 ? "peça salva" : "peças salvas"}</p>
              <label className="favorites-filter">
                <Search size={16} />
                <span className="an-visually-hidden">Filtrar favoritos</span>
                <input className="an-input" type="search" value={filter} onChange={(event) => setFilter(event.target.value)}
                  placeholder="Filtrar por nome ou loja" />
              </label>
            </div>
            {visible.length ? (
              <section className="favorites-grid" aria-label="Peças favoritas">
                {visible.map((product) => <MarketplaceProductCard key={product.id} product={product} />)}
              </section>
            ) : (
              <section className="an-state">
                <PackageOpen size={32} />
                <h2>Nenhum favorito com “{filter}”</h2>
                <div className="an-state-actions">
                  <button type="button" className="an-btn an-btn--secondary" onClick={() => setFilter("")}>Limpar filtro</button>
                </div>
              </section>
            )}
          </>
        )}
      </main>
      <CustomerFooter />
    </div>
  );
}
