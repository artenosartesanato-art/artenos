"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, LoaderCircle, PackageOpen, RefreshCw, SlidersHorizontal, X } from "@/components/icons";
import { CustomerHeader } from "@/components/customer-header";
import { CustomerFooter } from "@/components/customer-footer";
import { Dialog } from "@/components/ui/dialog";
import { getSupabase } from "@/lib/supabase";
import { MarketplaceProductCard, ProductGridSkeleton, type MarketplaceProduct } from "@/components/marketplace-product-card";
import "../storefront.css";
import "./categories.css";

type Category = { id: string; name: string; slug: string; image_url: string | null; product_count: number };
type Product = MarketplaceProduct & { total_count: number };
type Sort = "newest" | "price_asc" | "price_desc";
type Filters = {
  query: string;
  categoryId: string | null;
  min: number | null;
  max: number | null;
  readyOnly: boolean;
  sort: Sort;
};
const PAGE_SIZE = 12;
const SORTS: Record<Sort, string> = { newest: "Mais recentes", price_asc: "Menor preço", price_desc: "Maior preço" };
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const emptyFilters: Filters = { query: "", categoryId: null, min: null, max: null, readyOnly: false, sort: "newest" };

function readFilters(): Filters {
  const params = new URLSearchParams(window.location.search);
  const category = params.get("categoria");
  const number = (value: string | null) => {
    if (value === null || value === "") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  };
  const sort = params.get("ordem");
  return {
    query: (params.get("busca") || "").trim().slice(0, 100),
    categoryId: category && /^[0-9a-f-]{36}$/i.test(category) ? category : null,
    min: number(params.get("min")),
    max: number(params.get("max")),
    readyOnly: params.get("pronta") === "1",
    sort: sort === "price_asc" || sort === "price_desc" ? sort : "newest",
  };
}

function writeFilters(filters: Filters) {
  const params = new URLSearchParams();
  if (filters.query) params.set("busca", filters.query);
  if (filters.categoryId) params.set("categoria", filters.categoryId);
  if (filters.min !== null) params.set("min", String(filters.min));
  if (filters.max !== null) params.set("max", String(filters.max));
  if (filters.readyOnly) params.set("pronta", "1");
  if (filters.sort !== "newest") params.set("ordem", filters.sort);
  const query = params.toString();
  window.history.replaceState(null, "", query ? `/categorias?${query}` : "/categorias");
}

function FilterPanel({ categories, filters, onChange, onClear, idPrefix }: {
  categories: Category[];
  filters: Filters;
  onChange: (patch: Partial<Filters>) => void;
  onClear: () => void;
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
      <fieldset className="category-filter-block">
        <legend>Categoria</legend>
        <label className="category-option">
          <input type="radio" name={`${idPrefix}-categoria`} checked={!filters.categoryId}
            onChange={() => onChange({ categoryId: null })} />
          <span>Todas as peças</span>
        </label>
        {categories.map((category) => (
          <label className="category-option" key={category.id}>
            <input type="radio" name={`${idPrefix}-categoria`} checked={filters.categoryId === category.id}
              onChange={() => onChange({ categoryId: category.id })} />
            <span>{category.name}</span>
            <small aria-label={`${category.product_count} peças`}>{category.product_count}</small>
          </label>
        ))}
      </fieldset>
      <form className="category-filter-block" onSubmit={applyPrices} noValidate>
        <fieldset>
          <legend>Faixa de preço</legend>
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
          <input type="checkbox" checked={filters.readyOnly} onChange={(event) => onChange({ readyOnly: event.target.checked })} />
          Só pronta entrega
        </label>
      </fieldset>
      <button type="button" className="category-clear" onClick={() => { setMinPrice(""); setMaxPrice(""); setPriceError(""); onClear(); }}>
        Limpar filtros
      </button>
    </div>
  );
}

export default function CategoriesPage() {
  const [ready, setReady] = useState(false);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [searchInput, setSearchInput] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [featuredFallback, setFeaturedFallback] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [moreError, setMoreError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [panelKey, setPanelKey] = useState(0);
  const productRequest = useRef(0);
  const resultsHeading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const initial = readFilters();
    queueMicrotask(() => {
      setFilters(initial);
      setSearchInput(initial.query);
      setReady(true);
    });
    let active = true;
    void Promise.resolve(getSupabase().rpc("list_storefront_categories_with_products"))
      .then(({ data, error: categoryError }) => {
        if (!active) return;
        if (categoryError) throw categoryError;
        setCategories((data || []) as Category[]);
      })
      .catch(() => { if (active) setError("Não foi possível carregar as categorias."); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const request = ++productRequest.current;
    writeFilters(filters);
    queueMicrotask(() => {
      if (request !== productRequest.current) return;
      setLoading(true);
      setMoreError("");
    });
    const supabase = getSupabase();
    void Promise.resolve(supabase.rpc("browse_storefront_products", {
      p_query: filters.query || null, p_category_id: filters.categoryId, p_min_price: filters.min,
      p_max_price: filters.max, p_ready_only: filters.readyOnly, p_sort: filters.sort,
      p_limit: PAGE_SIZE, p_offset: 0,
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
  }, [filters, ready, attempt]);

  function update(patch: Partial<Filters>) {
    setFilters((current) => ({ ...current, ...patch }));
  }
  function clearFilters() {
    setSearchInput("");
    setPanelKey((value) => value + 1);
    setFilters(emptyFilters);
  }
  function search(query: string) {
    update({ query });
    window.requestAnimationFrame(() => resultsHeading.current?.focus({ preventScroll: false }));
  }

  async function loadMore() {
    if (loadingMore || products.length >= total) return;
    const request = productRequest.current;
    setLoadingMore(true);
    setMoreError("");
    try {
      const { data, error: loadError } = await getSupabase().rpc("browse_storefront_products", {
        p_query: filters.query || null, p_category_id: filters.categoryId, p_min_price: filters.min,
        p_max_price: filters.max, p_ready_only: filters.readyOnly, p_sort: filters.sort,
        p_limit: PAGE_SIZE, p_offset: products.length,
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

  const selectedCategory = categories.find((category) => category.id === filters.categoryId);
  const activeChips = useMemo(() => {
    const chips: { key: string; label: string; clear: Partial<Filters> }[] = [];
    if (filters.query) chips.push({ key: "q", label: `“${filters.query}”`, clear: { query: "" } });
    if (selectedCategory) chips.push({ key: "c", label: selectedCategory.name, clear: { categoryId: null } });
    if (filters.min !== null || filters.max !== null) {
      const label = filters.min !== null && filters.max !== null
        ? `${money.format(filters.min)} a ${money.format(filters.max)}`
        : filters.min !== null ? `A partir de ${money.format(filters.min)}` : `Até ${money.format(filters.max!)}`;
      chips.push({ key: "p", label, clear: { min: null, max: null } });
    }
    if (filters.readyOnly) chips.push({ key: "r", label: "Pronta entrega", clear: { readyOnly: false } });
    return chips;
  }, [filters, selectedCategory]);
  const filterCount = activeChips.filter((chip) => chip.key !== "q").length;

  return (
    <div className="store-page category-page">
      <CustomerHeader searchValue={searchInput} onSearchValueChange={setSearchInput} onSearch={search} />
      <main id="conteudo" tabIndex={-1} className="store-container category-main">
        <header className="category-intro">
          <p className="store-eyebrow">Descubra o feito à mão</p>
          <h1>{filters.query ? `Resultados para “${filters.query}”` : selectedCategory?.name || "Todas as peças"}</h1>
          <p>Peças publicadas por lojas aprovadas na Artenós. Use os filtros para encontrar pronta entrega, faixas de preço e técnicas.</p>
        </header>

        <nav className="category-chips" aria-label="Categorias">
          <button type="button" aria-pressed={!filters.categoryId} onClick={() => update({ categoryId: null })}>Todas</button>
          {categories.map((category) => (
            <button type="button" key={category.id} aria-pressed={filters.categoryId === category.id}
              onClick={() => update({ categoryId: category.id })}>
              {category.name}
              <small aria-hidden="true">{category.product_count}</small>
            </button>
          ))}
        </nav>

        <div className="category-layout">
          <aside className="category-filters" aria-labelledby="filtros-titulo">
            <h2 id="filtros-titulo"><SlidersHorizontal size={17} /> Filtros</h2>
            <FilterPanel key={`desk-${panelKey}-${filters.min}-${filters.max}`} categories={categories} filters={filters}
              onChange={update} onClear={clearFilters} idPrefix="desk" />
          </aside>

          <section className="category-results" aria-labelledby="resultados-titulo">
            <div className="category-toolbar">
              <div>
                <h2 id="resultados-titulo" ref={resultsHeading} tabIndex={-1}>
                  {loading ? "Buscando peças…" : `${total} ${total === 1 ? "peça encontrada" : "peças encontradas"}`}
                </h2>
                <p aria-live="polite" className="an-visually-hidden">
                  {loading ? "" : `${total} ${total === 1 ? "peça encontrada" : "peças encontradas"}`}
                </p>
              </div>
              <div className="category-toolbar-actions">
                <button type="button" className="an-btn an-btn--secondary category-filter-button" onClick={() => setFiltersOpen(true)}
                  aria-haspopup="dialog">
                  <SlidersHorizontal size={16} /> Filtros{filterCount ? ` (${filterCount})` : ""}
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
            ) : products.length ? (
              <>
                <div className="category-grid">
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
      </main>
      <CustomerFooter />

      <Dialog open={filtersOpen} onClose={() => setFiltersOpen(false)} variant="drawer-left" labelledBy="filtros-mobile-titulo"
        className="category-filter-drawer" closeLabel="Fechar filtros">
        <header className="an-drawer-header">
          <h2 id="filtros-mobile-titulo">Filtros</h2>
        </header>
        <div className="an-drawer-body">
          <FilterPanel key={`mob-${panelKey}-${filters.min}-${filters.max}`} categories={categories} filters={filters}
            onChange={update} onClear={clearFilters} idPrefix="mob" />
        </div>
        <footer className="an-drawer-footer">
          <button type="button" className="an-btn an-btn--lg an-btn--block" onClick={() => setFiltersOpen(false)} disabled={loading}>
            {loading ? "Atualizando…" : `Ver ${total} ${total === 1 ? "peça" : "peças"}`}
          </button>
        </footer>
      </Dialog>
    </div>
  );
}
