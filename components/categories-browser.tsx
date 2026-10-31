"use client";

import { ServiceCard, useServiceDialog } from "@/components/custom-service";
import { filterServices, type CustomService } from "@/lib/custom-services";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, LoaderCircle, PackageOpen, RefreshCw, SlidersHorizontal, SpriteIcon, X } from "@/components/icons";
import { categoryLook } from "@/lib/category-looks";
import { useHeaderSearchControl } from "@/components/header-search";
import { Dialog } from "@/components/ui/dialog";
import Link from "next/link";
import { getSupabase } from "@/lib/supabase";
import { BUDGETS } from "@/lib/budgets";
import { activeFilterCount, CATALOG_URL_EVENT, catalogHref, EMPTY_FILTERS, parseCatalogQuery, sameFilters, type CatalogFilters, type CatalogSort } from "@/lib/catalog-filters";
import { findCategory, primeStorefrontCategories, useStorefrontCategories } from "@/lib/storefront-categories";
import { MarketplaceProductCard, ProductGridSkeleton, type MarketplaceProduct } from "@/components/marketplace-product-card";
import "@/app/storefront.css";
import "@/app/categorias/categories.css";

export type Category = { id: string; name: string; slug: string; image_url: string | null; product_count: number };
export type Product = MarketplaceProduct & { total_count: number };
/** Primeira página sem filtros, buscada no servidor (app/categorias/page.tsx). */
export type CategoriesInitial = { categories: Category[]; products: Product[] };
type Sort = CatalogSort;
type Filters = CatalogFilters;
export const PAGE_SIZE = 12;
type ShopMatch = { id: string; store_name: string; specialty: string | null; city: string | null; state: string | null };
const fold = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
const SORTS: Record<Sort, string> = { newest: "Mais recentes", rating: "Mais bem avaliados", price_asc: "Menor preço", price_desc: "Maior preço" };
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const emptyFilters = EMPTY_FILTERS;

/** Grava os filtros no endereço. A primeira gravação substitui; as seguintes viram passos do Voltar. */
function writeFilters(filters: Filters, categorySlug: string | null, push: boolean) {
  const href = catalogHref(filters, categorySlug);
  if (href === window.location.pathname + window.location.search) return;
  if (push) window.history.pushState(null, "", href);
  else window.history.replaceState(null, "", href);
}

/** Filtros da gaveta: só preço e disponibilidade (as categorias ficam no menu do cabeçalho). */
function FilterPanel({ filters, onChange, idPrefix }: {
  filters: Filters;
  onChange: (patch: Partial<Filters>) => void;
  idPrefix: string;
}) {
  const [minPrice, setMinPrice] = useState(filters.min?.toString() ?? "");
  const [maxPrice, setMaxPrice] = useState(filters.max?.toString() ?? "");
  const [priceError, setPriceError] = useState("");

  function applyPrices(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const minimum = minPrice === "" ? null : Number(minPrice.replace(",", "."));
    const maximum = maxPrice === "" ? null : Number(maxPrice.replace(",", "."));
    if ((minimum !== null && (!Number.isFinite(minimum) || minimum < 0)) ||
      (maximum !== null && (!Number.isFinite(maximum) || maximum < 0))) {
      setPriceError("Use apenas números positivos.");
      return;
    }
    if (minimum !== null && maximum !== null && minimum > maximum) {
      setPriceError("O valor mínimo precisa ser menor que o máximo.");
      return;
    }
    setPriceError("");
    onChange({ min: minimum, max: maximum });
  }

  return (
    <div className="category-filter-panel">
      <form className="category-filter-block" onSubmit={applyPrices} noValidate>
        <fieldset>
          <legend>Faixa de preço</legend>
          <div className="category-price-presets" role="group" aria-label="Faixas prontas">
            {BUDGETS.map((budget) => {
              const active = filters.min === budget.min && filters.max === budget.max;
              return (
                <button type="button" key={budget.key} aria-pressed={active}
                  onClick={() => onChange(active ? { min: null, max: null } : { min: budget.min, max: budget.max })}>
                  {budget.label}
                </button>
              );
            })}
          </div>
          <div className="category-price-inputs">
            <label className="an-field">
              <span>Mínimo (R$)</span>
              <input type="text" inputMode="decimal" value={minPrice} onChange={(event) => setMinPrice(event.target.value)}
                aria-invalid={priceError ? true : undefined} aria-describedby={priceError ? `${idPrefix}-preco-erro` : undefined}
                placeholder="0" />
            </label>
            <label className="an-field">
              <span>Máximo (R$)</span>
              <input type="text" inputMode="decimal" value={maxPrice} onChange={(event) => setMaxPrice(event.target.value)}
                aria-invalid={priceError ? true : undefined} aria-describedby={priceError ? `${idPrefix}-preco-erro` : undefined}
                placeholder="Sem limite" />
            </label>
          </div>
          {priceError && <p className="an-field-error" id={`${idPrefix}-preco-erro`} role="alert">{priceError}</p>}
          <button type="submit" className="an-btn an-btn--secondary an-btn--sm an-btn--block category-apply">Aplicar preço</button>
        </fieldset>
      </form>
      <fieldset className="category-filter-block">
        <legend>Disponibilidade</legend>
        <label className="category-check">
          <input type="checkbox" checked={filters.readyOnly}
            onChange={(event) => onChange({ readyOnly: event.target.checked, madeToOrderOnly: false })} />
          Só pronta entrega
        </label>
        <label className="category-check">
          <input type="checkbox" checked={filters.madeToOrderOnly}
            onChange={(event) => onChange({ madeToOrderOnly: event.target.checked, readyOnly: false })} />
          Só sob encomenda
        </label>
      </fieldset>
    </div>
  );
}

// Só enviado quando o filtro está ligado: funciona antes e depois da migração 20261029_status_encomenda.
const availabilityParam = (filters: Filters) => (filters.madeToOrderOnly ? { p_availability: "made_to_order" } : {});

export function CategoriesBrowser({ initial }: { initial: CategoriesInitial | null }) {
  // Os dados do servidor valem só para a visão sem filtros e só uma vez.
  const initialUnused = useRef(Boolean(initial));
  const [ready, setReady] = useState(false);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  if (initial?.categories.length) primeStorefrontCategories(initial.categories);
  const { categories: loadedCategories, failed: categoriesFailed } = useStorefrontCategories();
  const categories = useMemo(() => (loadedCategories ?? initial?.categories ?? []) as Category[], [loadedCategories, initial]);
  // Primeira gravação no endereço substitui; mudanças vindas do Voltar/menu não gravam de novo.
  const urlWrites = useRef(0);
  const fromHistory = useRef(false);
  const [products, setProducts] = useState<Product[]>(initial?.products ?? []);
  const [featuredFallback, setFeaturedFallback] = useState<Product[]>([]);
  const [total, setTotal] = useState(Number(initial?.products[0]?.total_count || 0));
  const [loading, setLoading] = useState(!initial);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [moreError, setMoreError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [panelKey, setPanelKey] = useState(0);
  const [shops, setShops] = useState<ShopMatch[] | null>(null);
  const productRequest = useRef(0);
  const resultsHeading = useRef<HTMLHeadingElement>(null);
  // A busca do cabeçalho único filtra esta página sem recarregar.
  const search = useCallback((query: string) => {
    setFilters((current) => ({ ...current, query }));
    window.requestAnimationFrame(() => resultsHeading.current?.focus({ preventScroll: false }));
  }, []);
  const [, setSearchInput] = useHeaderSearchControl(search);

  useEffect(() => {
    const fromUrl = parseCatalogQuery(window.location.search);
    queueMicrotask(() => {
      setFilters(fromUrl);
      setSearchInput(fromUrl.query);
      setReady(true);
    });
    // Voltar/avançar do navegador e o menu de categorias (mesma página) mudam o endereço: relê.
    const reread = () => {
      const next = parseCatalogQuery(window.location.search);
      fromHistory.current = true;
      setFilters((current) => (sameFilters(current, next) ? current : next));
      setSearchInput(next.query);
    };
    window.addEventListener("popstate", reread);
    window.addEventListener(CATALOG_URL_EVENT, reread);
    return () => {
      window.removeEventListener("popstate", reread);
      window.removeEventListener(CATALOG_URL_EVENT, reread);
    };
  }, [setSearchInput]);

  useEffect(() => {
    if (categoriesFailed) queueMicrotask(() => setError("Não foi possível carregar as categorias."));
  }, [categoriesFailed]);

  const selectedCategory = findCategory(categories, filters.category);

  // Opções sob encomenda (orçamento) das lojas: entram na mesma grade, antes
  // das peças, e seguem os mesmos filtros (lib/custom-services.ts).
  const [allServices, setAllServices] = useState<CustomService[]>([]);
  const { open: openService, dialog: serviceDialog } = useServiceDialog();
  useEffect(() => {
    let active = true;
    void Promise.resolve(getSupabase().rpc("list_public_custom_order_services", { p_limit: 48 }))
      .then(({ data, error: servicesError }) => { if (active && !servicesError) setAllServices((data ?? []) as CustomService[]); })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);
  // Categoria pelo nome só é resolvida depois que a lista chega.
  const categoryPending = Boolean(filters.category && !selectedCategory && !loadedCategories && !categoriesFailed);
  const categoryId = selectedCategory?.id ?? null;

  useEffect(() => {
    if (!ready || categoryPending) return;
    const request = ++productRequest.current;
    writeFilters(filters, selectedCategory?.slug ?? null, urlWrites.current++ > 0 && !fromHistory.current);
    fromHistory.current = false;
    const useServerData = initialUnused.current && sameFilters(filters, emptyFilters);
    initialUnused.current = false;
    if (useServerData) return;
    queueMicrotask(() => {
      if (request !== productRequest.current) return;
      setLoading(true);
      setMoreError("");
    });
    const supabase = getSupabase();
    void Promise.resolve(supabase.rpc("browse_storefront_products", {
      p_query: filters.query || null, p_category_id: categoryId, p_min_price: filters.min,
      p_max_price: filters.max, p_ready_only: filters.readyOnly, p_sort: filters.sort,
      p_limit: PAGE_SIZE, p_offset: 0, ...availabilityParam(filters),
    }))
      .then(async ({ data, error: productsError }) => {
        if (request !== productRequest.current) return;
        if (productsError) throw productsError;
        const rows = (data || []) as Product[];
        setProducts(rows);
        setTotal(Number(rows[0]?.total_count || 0));
        if (filters.query && rows.length === 0) {
          const { data: featured } = await supabase.rpc("search_storefront_products", {
            p_query: null, p_category_id: null, p_collection_id: null, p_section: "featured", p_limit: 8,
          });
          if (request === productRequest.current) setFeaturedFallback((featured || []) as Product[]);
        } else {
          setFeaturedFallback([]);
        }
        setError("");
      })
      .catch(() => {
        if (request === productRequest.current) {
          setProducts([]);
          setTotal(0);
          setError("Não foi possível carregar as peças agora.");
        }
      })
      .finally(() => { if (request === productRequest.current) setLoading(false); });
  // eslint-disable-next-line react-hooks/exhaustive-deps -- a categoria resolvida já depende de filters.category
  }, [filters, ready, attempt, categoryId, categoryPending]);

  // Busca também por lojas (nome, técnica ou cidade): lista pública, buscada uma vez.
  useEffect(() => {
    if (!filters.query || shops !== null) return;
    let active = true;
    void Promise.resolve(getSupabase().rpc("list_storefront_shops", { p_limit: 100 }))
      .then(({ data }) => { if (active) setShops((data || []) as ShopMatch[]); })
      .catch(() => { if (active) setShops([]); });
    return () => { active = false; };
  }, [filters.query, shops]);
  const matchingShops = useMemo(() => {
    if (!filters.query || !shops) return [];
    const term = fold(filters.query);
    return shops.filter((shop) => [shop.store_name, shop.specialty, shop.city, shop.state]
      .some((value) => value && fold(value).includes(term))).slice(0, 6);
  }, [filters.query, shops]);

  function update(patch: Partial<Filters>) {
    setFilters((current) => ({ ...current, ...patch }));
  }
  /** "Limpar" da gaveta: só preço e disponibilidade (mantém busca e categoria). */
  function clearPanelFilters() {
    setPanelKey((value) => value + 1);
    update({ min: null, max: null, readyOnly: false, madeToOrderOnly: false });
  }
  function clearFilters() {
    setSearchInput("");
    setPanelKey((value) => value + 1);
    setFilters(emptyFilters);
  }

  async function loadMore() {
    if (loadingMore || products.length >= total) return;
    const request = productRequest.current;
    setLoadingMore(true);
    setMoreError("");
    try {
      const { data, error: loadError } = await getSupabase().rpc("browse_storefront_products", {
        p_query: filters.query || null, p_category_id: categoryId, p_min_price: filters.min,
        p_max_price: filters.max, p_ready_only: filters.readyOnly, p_sort: filters.sort,
        p_limit: PAGE_SIZE, p_offset: products.length, ...availabilityParam(filters),
      });
      if (loadError) throw loadError;
      if (request === productRequest.current) {
        setProducts((previous) => {
          const known = new Set(previous.map((product) => product.id));
          return [...previous, ...((data || []) as Product[]).filter((product) => !known.has(product.id))];
        });
      }
    } catch {
      setMoreError("Não foi possível carregar mais peças.");
    } finally {
      setLoadingMore(false);
    }
  }

  const activeChips = useMemo(() => {
    const chips: { key: string; label: string; clear: Partial<Filters> }[] = [];
    if (filters.query) chips.push({ key: "q", label: `“${filters.query}”`, clear: { query: "" } });
    if (selectedCategory) chips.push({ key: "c", label: selectedCategory.name, clear: { category: null } });
    if (filters.min !== null || filters.max !== null) {
      const label = filters.min !== null && filters.max !== null
        ? `${money.format(filters.min)} a ${money.format(filters.max)}`
        : filters.min !== null ? `A partir de ${money.format(filters.min)}` : `Até ${money.format(filters.max!)}`;
      chips.push({ key: "p", label, clear: { min: null, max: null } });
    }
    if (filters.readyOnly) chips.push({ key: "r", label: "Pronta entrega", clear: { readyOnly: false } });
    if (filters.madeToOrderOnly) chips.push({ key: "e", label: "Sob encomenda", clear: { madeToOrderOnly: false } });
    return chips;
  }, [filters, selectedCategory]);
  const filterCount = activeFilterCount(filters);

  const selectedCategoryId = selectedCategory?.id ?? null;
  const services = filters.category && !selectedCategoryId ? [] : filterServices(allServices, {
    query: filters.query, categoryId: selectedCategoryId, min: filters.min, max: filters.max,
    readyOnly: filters.readyOnly, madeToOrderOnly: filters.madeToOrderOnly,
  });
  const resultsLabel = (() => {
    const pieces = `${total} ${total === 1 ? "peça" : "peças"}`;
    if (!services.length) return `${pieces} ${total === 1 ? "encontrada" : "encontradas"}`;
    const options = `${services.length} ${services.length === 1 ? "opção sob encomenda" : "opções sob encomenda"}`;
    return total ? `${pieces} e ${options}` : options;
  })();

  return (
    <div className="store-page category-page">
      <main id="conteudo" tabIndex={-1} className="store-container category-main">
        <header className="category-intro">
          <nav className="category-breadcrumb" aria-label="Você está em">
            <ol>
              <li><Link href="/">Início</Link></li>
              {selectedCategory ? (
                <>
                  <li><Link href="/categorias" onClick={(event) => { event.preventDefault(); update({ category: null }); }}>Categorias</Link></li>
                  <li aria-current="page">{selectedCategory.name}</li>
                </>
              ) : (
                <li aria-current="page">Todas as peças</li>
              )}
            </ol>
          </nav>
          <p className="store-eyebrow">Descubra o feito à mão</p>
          <h1>
            {!filters.query && selectedCategory && (
              <span className="category-title-icon" aria-hidden="true"><SpriteIcon name={categoryLook(selectedCategory).icon} size={22} /></span>
            )}
            {filters.query ? `Resultados para “${filters.query}”` : selectedCategory?.name || "Todas as peças"}
          </h1>
          <p>Peças publicadas por lojas aprovadas na Artenós. Use os filtros para encontrar pronta entrega, faixas de preço e técnicas.</p>
        </header>

        <div className="category-layout">
          <section className="category-results" aria-labelledby="resultados-titulo">
            <div className="category-toolbar">
              <div>
                <h2 id="resultados-titulo" ref={resultsHeading} tabIndex={-1}>
                  {loading ? "Buscando peças…" : resultsLabel}
                </h2>
                <p aria-live="polite" className="an-visually-hidden">
                  {loading ? "" : resultsLabel}
                </p>
              </div>
              <div className="category-toolbar-actions">
                <button type="button" className="an-btn an-btn--secondary category-filter-button" onClick={() => setFiltersOpen(true)}
                  aria-haspopup="dialog" aria-expanded={filtersOpen} aria-controls="filtros-gaveta">
                  <SlidersHorizontal size={16} /> Filtros{filterCount ? ` · ${filterCount}` : ""}
                </button>
                <label className="category-sort">
                  <span>Ordenar</span>
                  <select className="an-input" value={filters.sort} onChange={(event) => update({ sort: event.target.value as Sort })}>
                    {Object.entries(SORTS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
              </div>
            </div>

            {activeChips.length > 0 && (
              <ul className="category-active" aria-label="Filtros aplicados">
                {activeChips.map((chip) => (
                  <li key={chip.key}>
                    <button type="button" onClick={() => { if (chip.key === "q") setSearchInput(""); if (chip.key === "p") setPanelKey((v) => v + 1); update(chip.clear); }}
                      aria-label={`Remover filtro ${chip.label}`}>
                      {chip.label} <X size={11} />
                    </button>
                  </li>
                ))}
                <li><button type="button" className="category-active-clear" onClick={clearFilters}>Limpar tudo</button></li>
              </ul>
            )}

            {matchingShops.length > 0 && (
              <section className="category-shop-matches" aria-labelledby="lojas-busca-titulo">
                <h3 id="lojas-busca-titulo">Lojas com “{filters.query}”</h3>
                <ul>
                  {matchingShops.map((shop) => (
                    <li key={shop.id}>
                      <Link prefetch={false} href={`/loja?id=${encodeURIComponent(shop.id)}`}>
                        <strong>{shop.store_name}</strong>
                        <small>{[shop.specialty, [shop.city, shop.state].filter(Boolean).join(" · ")].filter(Boolean).join(" — ")}</small>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {error ? (
              <div className="an-state" role="alert">
                <PackageOpen size={36} />
                <h2>{error}</h2>
                <p>Confira sua conexão. Seus filtros foram mantidos.</p>
                <div className="an-state-actions">
                  <button type="button" className="an-btn" onClick={() => setAttempt((value) => value + 1)}>
                    <RefreshCw size={15} /> Tentar novamente
                  </button>
                </div>
              </div>
            ) : loading ? (
              <ProductGridSkeleton count={8} className="category-grid" />
            ) : products.length || services.length ? (
              <>
                <div className="category-grid">
                  {services.map((service, index) => (
                    <ServiceCard key={`opcao-${service.id}`} service={service} onOpen={() => openService(service)} priority={index < 2} />
                  ))}
                  {products.map((product, index) => <MarketplaceProductCard key={product.id} product={product} priority={index < 4} />)}
                </div>
                {products.length < total && (
                  <div className="category-more-wrap">
                    <p>Mostrando {products.length} de {total}</p>
                    <button type="button" className="an-btn an-btn--secondary" onClick={() => void loadMore()} disabled={loadingMore} aria-busy={loadingMore}>
                      {loadingMore ? <LoaderCircle size={16} className="spin" /> : null}
                      {loadingMore ? "Carregando…" : "Carregar mais peças"} {!loadingMore && <ArrowRight size={16} />}
                    </button>
                    {moreError && <p className="an-field-error" role="alert">{moreError}</p>}
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="an-state">
                  <PackageOpen size={38} />
                  <h2>{filters.query ? `Nada encontrado para “${filters.query}”` : "Nenhuma peça com esses filtros"}</h2>
                  <p>{filters.query ? "Confira a escrita ou tente palavras mais gerais, como “vaso” ou “crochê”." : "Tente remover algum filtro para ver mais peças."}</p>
                  {activeChips.length > 0 && (
                    <div className="an-state-actions">
                      <button type="button" className="an-btn" onClick={clearFilters}>Ver todas as peças</button>
                    </div>
                  )}
                </div>
                {filters.query && featuredFallback.length > 0 && (
                  <section className="category-featured-fallback" aria-labelledby="sugestoes-titulo">
                    <p className="store-eyebrow">Outras descobertas</p>
                    <h2 id="sugestoes-titulo">Peças em destaque</h2>
                    <div className="category-grid">
                      {featuredFallback.map((product) => <MarketplaceProductCard key={product.id} product={product} />)}
                    </div>
                  </section>
                )}
              </>
            )}
          </section>
        </div>
        {serviceDialog}
      </main>

      <Dialog open={filtersOpen} onClose={() => setFiltersOpen(false)} variant="drawer-left" labelledBy="filtros-titulo"
        className="category-filter-drawer" closeLabel="Fechar filtros">
        <div id="filtros-gaveta" className="category-filter-sheet">
          <header className="an-drawer-header">
            <h2 id="filtros-titulo">Filtros</h2>
          </header>
          <div className="an-drawer-body">
            <FilterPanel key={`panel-${panelKey}-${filters.min}-${filters.max}`} filters={filters} onChange={update} idPrefix="gaveta" />
          </div>
          <footer className="an-drawer-footer category-filter-footer">
            <button type="button" className="an-btn an-btn--ghost" onClick={clearPanelFilters} disabled={filterCount === 0}>Limpar</button>
            <button type="button" className="an-btn an-btn--lg" onClick={() => setFiltersOpen(false)} disabled={loading} aria-live="polite">
              {loading ? "Atualizando…" : `Ver ${total} ${total === 1 ? "peça" : "peças"}`}
            </button>
          </footer>
        </div>
      </Dialog>
    </div>
  );
}
