"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight, Clock3, MapPin, PackageOpen, RefreshCw, Sparkles, Store } from "@/components/icons";
import { CustomerHeader } from "@/components/customer-header";
import { CustomerFooter } from "@/components/customer-footer";
import { getSupabase } from "@/lib/supabase";
import { MarketplaceProductCard, ProductGridSkeleton, type MarketplaceProduct } from "@/components/marketplace-product-card";
import "../storefront.css";
import "./public-store.css";

type PublicStore = {
  artisan_id: string;
  store_name: string;
  specialty: string | null;
  story: string | null;
  city: string | null;
  state: string | null;
  announcement: string | null;
  production_time_days: number;
  accepts_custom_orders: boolean;
  vacation_mode: boolean;
  cover_path: string | null;
  published_products: number;
};

const STORE_BUCKET = "artenos-store-assets";

function initials(name: string) {
  return name.split(/\s+/).filter((word) => word.length > 2).slice(0, 2).map((word) => word[0]?.toUpperCase()).join("") || "A";
}

function PublicStoreContent() {
  const searchParams = useSearchParams();
  const artisanId = searchParams.get("id") || "";
  const [store, setStore] = useState<PublicStore | null>(null);
  const [products, setProducts] = useState<MarketplaceProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<"" | "missing" | "failed">("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    if (!/^[0-9a-f-]{36}$/i.test(artisanId)) {
      queueMicrotask(() => { if (active) { setError("missing"); setLoading(false); } });
      return () => { active = false; };
    }
    queueMicrotask(() => { if (active) { setLoading(true); setError(""); } });
    const supabase = getSupabase();
    void Promise.all([
      supabase.rpc("get_public_artisan_store", { p_artisan_id: artisanId }),
      supabase.rpc("list_public_artisan_products", { p_artisan_id: artisanId, p_limit: 48, p_offset: 0 }),
    ])
      .then(([storeResponse, productResponse]) => {
        if (!active) return;
        if (storeResponse.error || productResponse.error) throw storeResponse.error || productResponse.error;
        const current = (Array.isArray(storeResponse.data) ? storeResponse.data[0] : storeResponse.data) as PublicStore | undefined;
        if (!current) {
          setError("missing");
          return;
        }
        setStore(current);
        setProducts((productResponse.data || []) as MarketplaceProduct[]);
      })
      .catch(() => { if (active) setError("failed"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [artisanId, attempt]);

  const coverUrl = useMemo(() => store?.cover_path
    ? getSupabase().storage.from(STORE_BUCKET).getPublicUrl(store.cover_path).data.publicUrl
    : "", [store]);

  useEffect(() => {
    if (store) document.title = `${store.store_name} | Artenós`;
  }, [store]);

  const location = store ? [store.city, store.state].filter(Boolean).join(" · ") : "";

  return (
    <div className="store-page public-shop-page">
      <CustomerHeader />
      <main id="conteudo" tabIndex={-1}>
        {loading ? (
          <div className="store-container public-shop-loading" role="status" aria-label="Carregando loja">
            <span className="an-skeleton public-shop-cover-skeleton" />
            <span className="an-skeleton" style={{ height: 34, width: "40%", marginTop: 24 }} />
            <span className="an-skeleton" style={{ height: 16, width: "25%", marginTop: 12 }} />
            <ProductGridSkeleton count={4} />
          </div>
        ) : error || !store ? (
          <section className="store-container">
            <div className="an-state" role={error === "failed" ? "alert" : undefined}>
              <Store size={34} />
              <h1>{error === "failed" ? "Não foi possível abrir esta loja" : "Loja não encontrada"}</h1>
              <p>{error === "failed"
                ? "Confira sua conexão e tente novamente."
                : "O endereço pode estar incompleto ou a loja não está mais disponível na Artenós."}</p>
              <div className="an-state-actions">
                {error === "failed" && (
                  <button type="button" className="an-btn" onClick={() => setAttempt((value) => value + 1)}>
                    <RefreshCw size={15} /> Tentar novamente
                  </button>
                )}
                <Link className={`an-btn${error === "failed" ? " an-btn--secondary" : ""}`} href="/lojas">Ver todas as lojas</Link>
              </div>
            </div>
          </section>
        ) : (
          <>
            <section className="public-shop-hero store-container" aria-labelledby="loja-titulo">
              <div className="public-shop-cover">
                {coverUrl
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={coverUrl} alt="" width={1600} height={600} fetchPriority="high" />
                  : <Sparkles size={40} aria-hidden="true" />}
                {store.vacation_mode && <span className="an-badge an-badge--warm public-shop-pause">Loja em pausa: compras temporariamente desativadas</span>}
              </div>
              <div className="public-shop-profile">
                <span className="public-shop-symbol" aria-hidden="true">{initials(store.store_name)}</span>
                <div className="public-shop-identity">
                  <p className="store-eyebrow">{store.specialty || "Artesanato autoral"}</p>
                  <h1 id="loja-titulo">{store.store_name}</h1>
                  {location && <p className="public-shop-location"><MapPin size={15} /> {location}</p>}
                </div>
                <dl className="public-shop-stats">
                  <div><dt>Peças publicadas</dt><dd>{store.published_products}</dd></div>
                  <div><dt>Produção média</dt><dd>até {store.production_time_days} {store.production_time_days === 1 ? "dia" : "dias"}</dd></div>
                  <div><dt>Encomendas</dt><dd>{store.vacation_mode ? "Pausadas" : store.accepts_custom_orders ? "Aceita" : "Não aceita"}</dd></div>
                </dl>
              </div>
            </section>

            <section className="store-container public-shop-about" aria-labelledby="historia-titulo">
              <div>
                <p className="store-eyebrow">Por trás da loja</p>
                <h2 id="historia-titulo">A história de quem faz</h2>
              </div>
              <div>
                {store.announcement && (
                  <p className="public-shop-announcement"><Clock3 size={16} /> <span>{store.announcement}</span></p>
                )}
                <p className="public-shop-story">{store.story || "A loja ainda não publicou a sua história."}</p>
              </div>
            </section>

            <section className="store-container public-shop-products" aria-labelledby="pecas-titulo">
              <div className="store-section-heading">
                <div>
                  <p className="store-eyebrow">Vitrine da loja</p>
                  <h2 id="pecas-titulo">Peças publicadas</h2>
                </div>
                <span className="public-shop-count">{products.length} {products.length === 1 ? "peça" : "peças"}</span>
              </div>
              {products.length ? (
                <div className="store-products">
                  {products.map((product, index) => (
                    <MarketplaceProductCard key={product.id} product={{ ...product, shop_id: store.artisan_id }}
                      shopName={store.store_name} cartDisabled={store.vacation_mode} priority={index < 2} />
                  ))}
                </div>
              ) : (
                <div className="an-state">
                  <PackageOpen size={34} />
                  <h3>Nenhuma peça publicada ainda</h3>
                  <p>As peças aparecerão aqui quando a loja publicá-las no catálogo.</p>
                </div>
              )}
            </section>

            {store.accepts_custom_orders && !store.vacation_mode && (
              <section className="store-container public-shop-custom" aria-labelledby="encomenda-titulo">
                <div>
                  <p className="store-eyebrow">Sob encomenda</p>
                  <h2 id="encomenda-titulo">Quer algo feito do seu jeito?</h2>
                  <p>Esta loja aceita encomendas. Veja as opções personalizadas publicadas na área Sob encomenda.</p>
                </div>
                <Link className="an-btn an-btn--lg" href="/sob-encomenda">Ver opções sob encomenda <ArrowRight size={17} /></Link>
              </section>
            )}
          </>
        )}
      </main>
      <CustomerFooter />
    </div>
  );
}

export default function PublicStorePage() {
  return (
    <Suspense fallback={<div className="store-page" />}>
      <PublicStoreContent />
    </Suspense>
  );
}
