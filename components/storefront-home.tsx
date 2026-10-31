"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  MessageCircle,
  RefreshCw,
  CircleDollarSign,
  ShieldCheck,
  Sparkles,
  SpriteIcon,
  Truck,
} from "@/components/icons";
import { getSupabase } from "@/lib/supabase";
import { categoryHref } from "@/lib/category-utils";
import { categoryLook } from "@/lib/category-looks";
import { MarketplaceProductCard, ProductGridSkeleton, type MarketplaceProduct } from "@/components/marketplace-product-card";
import { budgetHref, loadBudgets, type Budget } from "@/lib/budgets";
import { loadBestSellers, type BestSeller } from "@/lib/best-seller";
import { HeroCarousel } from "@/components/hero-carousel";
import { PublicCustomServices } from "@/components/custom-quotes";
import "@/app/storefront.css";
import { OptimizedImage } from "@/components/optimized-image";

export type Category = { id: string; name: string; slug: string; image_url: string | null };
export type Collection = { id: string; title: string; description: string | null; image_url: string | null };
export type Banner = { id: string; title: string; subtitle: string | null; image_url: string; collection_id: string | null };
export type Product = MarketplaceProduct & { featured?: boolean };
export type Shop = { id: string; store_name: string; specialty: string | null; story: string | null; city: string | null; state: string | null };
type CollectionFilter = { id: string; title: string };

function initials(name: string) {
  return name.split(/\s+/).filter((word) => word.length > 2 || /^[A-ZÀ-Ú]/.test(word)).slice(0, 2)
    .map((word) => word[0]?.toUpperCase()).join("") || "A";
}

function ProductSection({ id, eyebrow, title, products, loading, href = "/categorias", hrefLabel = "Ver todas as peças", empty }: {
  id?: string;
  eyebrow: string;
  title: string;
  products: Product[];
  loading: boolean;
  href?: string;
  hrefLabel?: string;
  empty: string;
}) {
  const headingId = `${id ?? title.replace(/\W+/g, "-").toLowerCase()}-titulo`;
  return (
    <section id={id} className="store-section store-container" aria-labelledby={headingId}>
      <div className="store-section-heading">
        <div>
          <p className="store-eyebrow">{eyebrow}</p>
          <h2 id={headingId}>{title}</h2>
        </div>
        <Link href={href} prefetch={false} className="store-see-all">
          {hrefLabel} <ArrowRight size={16} />
        </Link>
      </div>
      {loading ? (
        <ProductGridSkeleton count={4} />
      ) : products.length ? (
        <div className="store-products">
          {products.map((product, index) => (
            <MarketplaceProductCard key={product.id} product={product} priority={index < 2} />
          ))}
        </div>
      ) : (
        <p className="store-empty">{empty} <Link href="/categorias">Ver todas as categorias</Link></p>
      )}
    </section>
  );
}

/** Vitrine já carregada no servidor (app/page.tsx); null = buscar no navegador. */
const MOBILE_CATEGORIES = 9;

export type HomeData = {
  categories: Category[];
  collections: Collection[];
  banners: Banner[];
  shops: Shop[];
  featured: Product[];
  ready: Product[];
  latest: Product[];
  budgets?: Budget[] | null;
  bestSellers?: BestSeller[];
};

export function StorefrontHome({ initial }: { initial: HomeData | null }) {
  const [categories, setCategories] = useState<Category[]>(initial?.categories ?? []);
  const [collections, setCollections] = useState<Collection[]>(initial?.collections ?? []);
  const [banners, setBanners] = useState<Banner[]>(initial?.banners ?? []);
  const [shops, setShops] = useState<Shop[]>(initial?.shops ?? []);
  const [featured, setFeatured] = useState<Product[]>(initial?.featured ?? []);
  const [ready, setReady] = useState<Product[]>(initial?.ready ?? []);
  const [latest, setLatest] = useState<Product[]>(initial?.latest ?? []);
  const [budgets, setBudgets] = useState<Budget[]>(initial?.budgets ?? []);
  const [bestSellers, setBestSellers] = useState<BestSeller[]>(initial?.bestSellers ?? []);
  const [collection, setCollection] = useState<CollectionFilter | null>(null);
  const [collectionProducts, setCollectionProducts] = useState<Product[]>([]);
  const [collectionLoading, setCollectionLoading] = useState(false);
  const [loading, setLoading] = useState(!initial);
  const [showAllCategories, setShowAllCategories] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const resultsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Primeira visita já veio com os dados do servidor: nada a buscar.
    if (initial && attempt === 0) return;
    let active = true;
    try {
      const supabase = getSupabase();
      void Promise.all([
        supabase.from("storefront_categories").select("id,name,slug,image_url").order("sort_order"),
        supabase.from("storefront_collections").select("id,title,description,image_url").order("sort_order"),
        supabase.from("storefront_banners").select("id,title,subtitle,image_url,collection_id").order("sort_order"),
        supabase.rpc("list_storefront_shops", { p_limit: 8 }),
        supabase.rpc("search_storefront_products", { p_section: "featured", p_limit: 8 }),
        supabase.rpc("search_storefront_products", { p_section: "ready", p_limit: 8 }),
        supabase.rpc("search_storefront_products", { p_section: "new", p_limit: 8 }),
      ])
        .then((responses) => {
          if (!active) return;
          const failure = responses.find((response) => response.error)?.error;
          if (failure) throw failure;
          setCategories((responses[0].data || []) as Category[]);
          setCollections((responses[1].data || []) as Collection[]);
          setBanners((responses[2].data || []) as Banner[]);
          setShops((responses[3].data || []) as Shop[]);
          setFeatured((responses[4].data || []) as Product[]);
          setReady((responses[5].data || []) as Product[]);
          setLatest((responses[6].data || []) as Product[]);
          setError("");
          // Atalhos de orçamento são um extra: se falharem, a seção some.
          void loadBudgets(supabase).then((rows) => { if (active) setBudgets(rows ?? []); }).catch(() => undefined);
          void loadBestSellers(supabase).then((rows) => { if (active) setBestSellers(rows); });
        })
        .catch(() => {
          if (active) setError("Não conseguimos carregar a vitrine agora. Confira sua conexão e tente novamente.");
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    } catch {
      queueMicrotask(() => {
        if (!active) return;
        setError("A vitrine está temporariamente indisponível.");
        setLoading(false);
      });
    }
    return () => { active = false; };
  }, [attempt, initial]);

  useEffect(() => {
    if (!collection) return;
    let active = true;
    void (async () => {
      setCollectionLoading(true);
      try {
        const { data, error: queryError } = await getSupabase().rpc("search_storefront_products", {
          p_query: null, p_category_id: null, p_collection_id: collection.id, p_section: "all", p_limit: 40,
        });
        if (queryError) throw queryError;
        if (active) setCollectionProducts((data || []) as Product[]);
      } catch {
        if (active) setCollectionProducts([]);
      } finally {
        if (active) setCollectionLoading(false);
      }
    })();
    return () => { active = false; };
  }, [collection]);

  const chooseCollection = useCallback((next: CollectionFilter) => {
    setCollection(next);
    window.requestAnimationFrame(() => {
      resultsRef.current?.scrollIntoView({ block: "start" });
      resultsRef.current?.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
    });
  }, []);

  function retry() {
    setLoading(true);
    setError("");
    setAttempt((value) => value + 1);
  }

  const banner = banners[0];
  const firstProducts = featured.length ? featured : latest.length ? latest : ready;
  const heroImages = [banner?.image_url, ...firstProducts.map((product) => product.image_url)]
    .filter((url): url is string => Boolean(url)).slice(0, 3);

  return (
    <div className="store-page">

      <main id="conteudo" tabIndex={-1}>
        <section className="store-hero" aria-labelledby="hero-title">
          <div className="store-container store-hero-inner">
            <div className="store-hero-copy">
              <p className="store-eyebrow">O encontro com o feito à mão</p>
              <h1 id="hero-title">{banner?.title || "Histórias que ganham forma em cada detalhe."}</h1>
              <p>{banner?.subtitle || "Peças autorais de artesãs e artesãos de todo o Brasil — escolha pronta entrega ou encomende algo só seu."}</p>
              <div className="store-hero-actions">
                <Link className="an-btn an-btn--lg store-hero-primary" href="/categorias">
                  Explorar peças <ArrowRight size={18} />
                </Link>
                {banner?.collection_id ? (
                  <button type="button" className="an-btn an-btn--lg store-hero-secondary"
                    onClick={() => chooseCollection({ id: banner.collection_id!, title: banner.title })}>
                    Ver a coleção
                  </button>
                ) : (
                  <Link className="an-btn an-btn--lg store-hero-secondary" href="/categorias?encomenda=1">
                    Encomendar uma peça
                  </Link>
                )}
              </div>
            </div>
            <div className="store-hero-art">
              {loading ? (
                <span className="an-skeleton store-hero-art-skeleton" />
              ) : bestSellers.length ? (
                <HeroCarousel products={bestSellers} />
              ) : heroImages.length ? (
                heroImages.map((url, index) => (
                  <OptimizedImage key={url + index} src={url} alt="" className={`store-hero-photo photo-${index + 1}`}
                    priority={index === 0} width={600} height={750}
                    sizes={index === 0 ? "(max-width: 900px) 100vw, 620px" : "200px"} />
                ))
              ) : (
                <div className="store-hero-art-fallback" aria-hidden="true">
                  <Sparkles size={36} />
                  <strong>Feito à mão tem história.</strong>
                </div>
              )}
            </div>
          </div>
        </section>

        <ul className="store-trust store-container" aria-label="Como a Artenós funciona">
          <li><ShieldCheck size={20} /><span><strong>Lojas aprovadas</strong> pela equipe Artenós antes de vender</span></li>
          <li><Truck size={20} /><span><strong>Frete por loja</strong>, calculado com o seu CEP no carrinho</span></li>
          <li><CircleDollarSign size={20} /><span><strong>Pagamento</strong> por Pix ou cartão via Mercado Pago</span></li>
          <li><MessageCircle size={20} /><span><strong>Converse com quem fez</strong> pelas mensagens do pedido</span></li>
        </ul>

        {error && (
          <div className="store-container">
            <div className="an-alert an-alert--error store-error" role="alert">
              <span>{error}</span>
              <button type="button" className="an-btn an-btn--secondary an-btn--sm" onClick={retry}>
                <RefreshCw size={14} /> Tentar novamente
              </button>
            </div>
          </div>
        )}

        <ProductSection id="explorar-produtos" eyebrow="Escolhidas na vitrine" title="Explore o feito à mão"
          products={firstProducts} loading={loading} empty="Ainda não há peças publicadas nesta seleção." />

        {collection && (
          <div ref={resultsRef} className="store-collection-results">
            <section className="store-section store-container" aria-labelledby="colecao-titulo">
              <div className="store-section-heading">
                <div>
                  <p className="store-eyebrow">Coleção</p>
                  <h2 id="colecao-titulo" tabIndex={-1}>{collection.title}</h2>
                </div>
                <button type="button" className="store-see-all" onClick={() => setCollection(null)}>Fechar coleção</button>
              </div>
              {collectionLoading ? <ProductGridSkeleton count={4} /> : collectionProducts.length ? (
                <div className="store-products">
                  {collectionProducts.map((product) => <MarketplaceProductCard key={product.id} product={product} />)}
                </div>
              ) : <p className="store-empty">Esta coleção ainda não tem peças publicadas.</p>}
            </section>
          </div>
        )}

        <section id="categorias" className="store-section store-container" aria-labelledby="categorias-titulo">
          <div className="store-section-heading">
            <div>
              <p className="store-eyebrow">Encontre seu estilo</p>
              <h2 id="categorias-titulo">Categorias de artesanato</h2>
            </div>
          </div>
          {loading ? (
            <div className="store-categories" aria-hidden="true">
              {Array.from({ length: 6 }, (_, index) => <span key={index} className="an-skeleton store-category-skeleton" />)}
            </div>
          ) : categories.length ? (
            <>
            <div id="lista-categorias" className={`store-categories${showAllCategories ? " is-expanded" : ""}`}>
              {categories.map((category, index) => {
                // Sem foto (enviada pela administração): padrão e ícone da técnica.
                const look = categoryLook(category, index);
                return (
                  <Link key={category.id} prefetch={false} href={categoryHref(category)} className="store-category-tile">
                    <span className={`store-category-art${category.image_url ? " has-photo" : ` cat-pattern-${look.pattern}`}`}>
                      {category.image_url ? (
                        <OptimizedImage src={category.image_url} alt="" width={480} height={210}
                          sizes="(max-width: 640px) 33vw, (max-width: 1280px) 25vw, 360px" />
                      ) : (
                        <span className="store-category-icon" aria-hidden="true"><SpriteIcon name={look.icon} size={18} /></span>
                      )}
                    </span>
                    <span className="store-category-name">{category.name}</span>
                  </Link>
                );
              })}
            </div>
            {/* Celular: grade de 3 colunas com 9 categorias; o resto abre aqui (sem arrastar). */}
            {categories.length > MOBILE_CATEGORIES && (
              <button type="button" className="an-btn an-btn--secondary an-btn--block store-categories-toggle"
                aria-expanded={showAllCategories} aria-controls="lista-categorias"
                onClick={() => setShowAllCategories((open) => !open)}>
                {showAllCategories ? "Ver menos categorias" : `Ver todas as categorias (${categories.length})`}
              </button>
            )}
            </>
          ) : (
            <p className="store-empty">As categorias aparecerão aqui assim que forem publicadas.</p>
          )}
        </section>

        <div className="store-warm-band">
          <ProductSection eyebrow="Para receber em breve" title="Peças prontas para envio" products={ready}
            loading={loading} href="/categorias?pronta=1" hrefLabel="Ver pronta entrega"
            empty="Nenhuma peça pronta para envio no momento." />
        </div>

        {/* Opções sob encomenda das lojas (orçamento): antes só na página de cada loja. */}
        <PublicCustomServices className="store-section store-container" />

        {budgets.some((budget) => budget.count > 0) && (
          <section className="store-section store-container" aria-labelledby="orcamento-titulo">
            <div className="store-section-heading">
              <div>
                <p className="store-eyebrow">Presente certo, preço certo</p>
                <h2 id="orcamento-titulo">Escolha pelo orçamento</h2>
              </div>
            </div>
            <ul className="store-budgets">
              {budgets.map((budget) => (
                <li key={budget.key}>
                  {budget.count > 0 ? (
                    <Link prefetch={false} href={budgetHref(budget)}>
                      <strong>{budget.label}</strong>
                      <small>{budget.hint}</small>
                      <span>{budget.count} {budget.count === 1 ? "peça" : "peças"} <ArrowRight size={14} /></span>
                    </Link>
                  ) : (
                    <div aria-disabled="true">
                      <strong>{budget.label}</strong>
                      <small>{budget.hint}</small>
                      <span>Nenhuma peça agora</span>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {(loading || collections.length > 0) && (
          <section className="store-section store-container" aria-labelledby="colecoes-titulo">
            <div className="store-section-heading">
              <div>
                <p className="store-eyebrow">Inspiração para explorar</p>
                <h2 id="colecoes-titulo">Coleções e temas</h2>
              </div>
            </div>
            <div className="store-collections">
              {loading
                ? Array.from({ length: 3 }, (_, index) => <span key={index} className="an-skeleton store-collection" aria-hidden="true" />)
                : collections.map((item) => (
                  <button key={item.id} className="store-collection" type="button"
                    onClick={() => chooseCollection({ id: item.id, title: item.title })}>
                    {item.image_url && <OptimizedImage src={item.image_url} alt="" width={600} height={400}
                      sizes="(max-width: 640px) 100vw, 400px" />}
                    <span>
                      <strong>{item.title}</strong>
                      {item.description && <small>{item.description}</small>}
                      <em>Ver peças da coleção <ArrowRight size={16} /></em>
                    </span>
                  </button>
                ))}
            </div>
          </section>
        )}

        <section id="lojas" className="store-section store-container" aria-labelledby="lojas-titulo">
          <div className="store-section-heading">
            <div>
              <p className="store-eyebrow">Por trás de cada peça</p>
              <h2 id="lojas-titulo">Quem faz a Artenós</h2>
            </div>
            <Link href="/lojas" className="store-see-all">Ver todas as lojas <ArrowRight size={16} /></Link>
          </div>
          {loading ? (
            <div className="store-shops" aria-hidden="true">
              {Array.from({ length: 4 }, (_, index) => <span key={index} className="an-skeleton store-shop-skeleton" />)}
            </div>
          ) : shops.length ? (
            <div className="store-shops">
              {shops.map((shop) => (
                <Link prefetch={false} href={`/loja?id=${encodeURIComponent(shop.id)}`} key={shop.id}>
                  <span className="store-shop-symbol" aria-hidden="true">{initials(shop.store_name)}</span>
                  <small>{shop.specialty || "Artesanato autoral"}</small>
                  <h3>{shop.store_name}</h3>
                  {shop.story && <p>{shop.story}</p>}
                  <span className="store-shop-footer">
                    <em>{[shop.city, shop.state].filter(Boolean).join(" · ") || "Brasil"}</em>
                    <span>Conhecer <ArrowRight size={14} /></span>
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="store-empty">As lojas aprovadas aparecerão aqui.</p>
          )}
        </section>

        <section className="store-story-band store-container" aria-labelledby="como-titulo">
          <div>
            <p className="store-eyebrow">Para quem cria</p>
            <h2 id="como-titulo">Seu trabalho merece uma vitrine à altura.</h2>
            <p>Abra sua loja na Artenós: a equipe analisa cada cadastro e você publica peças prontas e opções sob encomenda.</p>
          </div>
          <Link className="an-btn an-btn--lg" prefetch={false} href="/acesso?aba=artesa">Quero vender na Artenós <ArrowRight size={18} /></Link>
        </section>

        <ProductSection eyebrow="Sempre algo novo" title="Chegaram agora" products={latest} loading={loading}
          empty="Novas peças aparecerão aqui." />
      </main>

    </div>
  );
}
