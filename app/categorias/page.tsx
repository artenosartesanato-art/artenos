"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Heart,
  PackageOpen,
  SlidersHorizontal,
  Sparkles,
  X,
} from "@/components/icons";
import Link from "next/link";
import { toast } from "sonner";
import type { User } from "@supabase/supabase-js";
import { CustomerHeader } from "@/components/customer-header";
import { CustomerFooter } from "@/components/customer-footer";
import { getSupabase } from "@/lib/supabase";
import { addProductToCart } from "@/lib/cart";
import { MarketplaceProductCard } from "@/components/marketplace-product-card";
import { rememberFavoriteIntent, useMarketplace } from "@/components/marketplace-state";
import { confirmAddedToCart, confirmFavoriteRemoved, confirmFavoriteSaved } from "@/components/marketplace-feedback";
import "../storefront.css";
import "./categories.css";

type Category = {
  id: string;
  name: string;
  slug: string;
  image_url: string | null;
  product_count: number;
};
type Product = {
  id: string;
  name: string;
  price: number;
  image_url: string | null;
  stock: number | null;
  ready_to_ship: boolean;
  category_name: string | null;
  shop_name: string | null;
  total_count: number;
};
type CepStatus = "loading" | "guest" | "account" | "error";
type Sort = "newest" | "price_asc" | "price_desc";
const PAGE_SIZE = 12;

export default function CategoriesPage() {
  const { favoriteIds, pendingFavoriteIds, toggleFavorite: saveFavorite } = useMarketplace();
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [appliedMin, setAppliedMin] = useState<number | null>(null);
  const [appliedMax, setAppliedMax] = useState<number | null>(null);
  const [readyOnly, setReadyOnly] = useState(false);
  const [sort, setSort] = useState<Sort>("newest");
  const [products, setProducts] = useState<Product[]>([]);
  const [featuredFallback, setFeaturedFallback] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [authPrompt, setAuthPrompt] = useState(false);
  const [cep, setCep] = useState("");
  const [cepStatus, setCepStatus] = useState<CepStatus>("loading");
  const [cepError, setCepError] = useState("");
  const [cepOpen, setCepOpen] = useState(false);
  const [cepInput, setCepInput] = useState("");
  const profileRequest = useRef(0);
  const cartPending = useRef(new Set<string>());
  const [busyCart, setBusyCart] = useState<ReadonlySet<string>>(new Set());
  const productRequest = useRef(0);
  const selectedCategory = categories.find(
    (category) => category.id === categoryId,
  );

  const loadUser = useCallback(async (current: User | null) => {
    const request = ++profileRequest.current;
    setUser(current);
    setCepOpen(false);
    if (!current) {
      setCep(localStorage.getItem("artenos_guest_cep") || "");
      setCepStatus("guest");
      setCepError("");
      return;
    }
    setCepStatus("loading");
    try {
      const supabase = getSupabase();
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("cep")
        .eq("id", current.id)
        .single();
      if (request !== profileRequest.current) return;
      const registeredCep = profile?.cep?.replace(/\D/g, "") || "";
      if (profileError || registeredCep.length !== 8) {
        setCepStatus("error");
        setCepError(
          profileError
            ? "Não foi possível consultar seu CEP no momento."
            : "O CEP salvo no cadastro é inválido.",
        );
      } else {
        setCep(registeredCep);
        setCepStatus("account");
        setCepError("");
      }
    } catch {
      if (request === profileRequest.current) {
        setCepStatus("error");
        setCepError("Não foi possível conectar ao seu perfil.");
      }
    }
  }, []);

  useEffect(() => {
    let active = true;
    const requestCounter = profileRequest;
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get("categoria");
    const searchFromUrl = (params.get("busca") || "").trim().slice(0, 100);
    queueMicrotask(() => {
      if (active) {
        setCategoryId(
          fromUrl && /^[0-9a-f-]{36}$/i.test(fromUrl) ? fromUrl : null,
        );
        setSearchInput(searchFromUrl);
        setQuery(searchFromUrl);
      }
    });
    try {
      const supabase = getSupabase();
      const { data: listener } = supabase.auth.onAuthStateChange(
        (event, session) => {
          if (
            [
              "INITIAL_SESSION",
              "SIGNED_IN",
              "SIGNED_OUT",
              "USER_UPDATED",
            ].includes(event)
          ) {
            window.setTimeout(() => {
              if (active) void loadUser(session?.user || null);
            }, 0);
          }
        },
      );
      void Promise.resolve(
        supabase.rpc("list_storefront_categories_with_products"),
      )
        .then(({ data, error: categoryError }) => {
          if (!active) return;
          if (categoryError) throw categoryError;
          setCategories((data || []) as Category[]);
        })
        .catch(() => {
          if (active)
            setError(
              "Não foi possível carregar as categorias. Confirme que o script de categorias foi executado no Supabase.",
            );
        });
      return () => {
        active = false;
        requestCounter.current++;
        listener.subscription.unsubscribe();
      };
    } catch {
      queueMicrotask(() => {
        setCepStatus("error");
        setCepError("Supabase não configurado.");
        setError("Configure as variáveis públicas do Supabase.");
        setLoading(false);
      });
    }
  }, [loadUser]);

  useEffect(() => {
    const request = ++productRequest.current;
    queueMicrotask(() => {
      if (request === productRequest.current) {
        setLoading(true);
        setProducts([]);
        setTotal(0);
      }
    });
    void Promise.resolve(
      getSupabase().rpc("browse_storefront_products", {
        p_query: query || null,
        p_category_id: categoryId,
        p_min_price: appliedMin,
        p_max_price: appliedMax,
        p_ready_only: readyOnly,
        p_sort: sort,
        p_limit: PAGE_SIZE,
        p_offset: 0,
      }),
    )
      .then(async ({ data, error: productsError }) => {
        if (request !== productRequest.current) return;
        if (productsError) throw productsError;
        const rows = (data || []) as Product[];
        setProducts(rows);
        setTotal(Number(rows[0]?.total_count || 0));
        if (query && rows.length === 0) {
          const { data: featured } = await getSupabase().rpc("search_storefront_products", {
            p_query: null, p_category_id: null, p_collection_id: null,
            p_section: "featured", p_limit: 8,
          });
          if (request === productRequest.current) setFeaturedFallback((featured || []) as Product[]);
        } else {
          setFeaturedFallback([]);
        }
        setError("");
      })
      .catch(() => {
        if (request === productRequest.current)
          setError(
            "Não foi possível carregar as peças. Confirme que o script de categorias foi executado no Supabase.",
          );
      })
      .finally(() => {
        if (request === productRequest.current) setLoading(false);
      });
  }, [query, categoryId, appliedMin, appliedMax, readyOnly, sort]);

  function chooseCategory(id: string | null) {
    setCategoryId(id);
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("categoria", id);
    else url.searchParams.delete("categoria");
    window.history.replaceState(null, "", url.pathname + url.search);
  }
  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = searchInput.trim().slice(0, 100);
    setQuery(next);
    const url = new URL(window.location.href);
    if (next) url.searchParams.set("busca", next);
    else url.searchParams.delete("busca");
    window.history.replaceState(null, "", url.pathname + url.search);
  }
  function applyPrices(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const minimum = minPrice === "" ? null : Number(minPrice);
    const maximum = maxPrice === "" ? null : Number(maxPrice);
    if (
      (minimum !== null && (!Number.isFinite(minimum) || minimum < 0)) ||
      (maximum !== null && (!Number.isFinite(maximum) || maximum < 0)) ||
      (minimum !== null && maximum !== null && minimum > maximum)
    ) {
      toast.error("Confira os valores mínimo e máximo.");
      return;
    }
    setAppliedMin(minimum);
    setAppliedMax(maximum);
  }
  function clearFilters() {
    chooseCategory(null);
    setQuery("");
    setSearchInput("");
    setMinPrice("");
    setMaxPrice("");
    const url = new URL(window.location.href);
    url.searchParams.delete("busca");
    window.history.replaceState(null, "", url.pathname + url.search);
    setAppliedMin(null);
    setAppliedMax(null);
    setReadyOnly(false);
    setSort("newest");
  }
  async function loadMore() {
    if (loadingMore || products.length >= total) return;
    const request = productRequest.current;
    setLoadingMore(true);
    try {
      const { data, error: moreError } = await getSupabase().rpc(
        "browse_storefront_products",
        {
          p_query: query || null,
          p_category_id: categoryId,
          p_min_price: appliedMin,
          p_max_price: appliedMax,
          p_ready_only: readyOnly,
          p_sort: sort,
          p_limit: PAGE_SIZE,
          p_offset: products.length,
        },
      );
      if (moreError) throw moreError;
      if (request === productRequest.current)
        setProducts((previous) => [
          ...previous,
          ...((data || []) as Product[]),
        ]);
    } catch {
      toast.error("Não foi possível carregar mais peças.");
    } finally {
      setLoadingMore(false);
    }
  }
  async function toggleFavorite(product: Product) {
    if (!user) {
      rememberFavoriteIntent(product.id, product.name);
      setAuthPrompt(true);
      return;
    }
    try {
      const saved = await saveFavorite(product.id);
      if (saved) confirmFavoriteSaved(product.name);
      else confirmFavoriteRemoved(product.name);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível atualizar seus favoritos.");
    }
  }
  async function addToCart(product: Product) {
    if (!user) {
      setAuthPrompt(true);
      return;
    }
    if (cartPending.current.has(product.id)) return;
    cartPending.current.add(product.id);
    setBusyCart(new Set(cartPending.current));
    try {
      await addProductToCart(product.id);
      confirmAddedToCart(product.name);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível adicionar este produto ao carrinho.",
      );
    } finally {
      cartPending.current.delete(product.id);
      setBusyCart(new Set(cartPending.current));
    }
  }
  async function saveCep(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (user) return;
    const digits = cepInput.replace(/\D/g, "");
    if (digits.length !== 8) {
      toast.error("Digite um CEP com 8 números.");
      return;
    }
    try {
      const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const address = await response.json();
      if (!response.ok || address.erro) throw new Error();
      localStorage.setItem("artenos_guest_cep", digits);
      setCep(digits);
      setCepOpen(false);
      toast.success(`CEP de ${address.localidade}/${address.uf} selecionado.`);
    } catch {
      toast.error("CEP não encontrado. Confira e tente novamente.");
    }
  }

  return (
    <div className="store-page category-page">
      <CustomerHeader
        userSignedIn={!!user}
        cep={cep}
        cepStatus={cepStatus}
        cepError={cepError}
        cepOpen={cepOpen}
        cepInput={cepInput}
        searchInput={searchInput}
        onSearchInput={setSearchInput}
        onSearch={submitSearch}
        onToggleCep={() => setCepOpen(!cepOpen)}
        onCepInput={setCepInput}
        onSaveCep={saveCep}
      />
      <main className="store-container category-main">
        <div className="category-intro">
          <div>
            <p className="store-eyebrow">Descubra o feito à mão</p>
            <h1>Categorias de artesanato</h1>
            <p>
              Explore as peças publicadas por nossas artesãs. Cada categoria
              aparece conforme as lojas cadastram seus produtos.
            </p>
          </div>
          <Sparkles size={39} aria-hidden="true" />
        </div>
        <div className="category-chips" aria-label="Categorias disponíveis">
          <button
            type="button"
            className={!categoryId ? "active" : ""}
            onClick={() => chooseCategory(null)}
          >
            Todas as peças
          </button>
          {categories.map((category) => (
            <button
              type="button"
              key={category.id}
              className={categoryId === category.id ? "active" : ""}
              onClick={() => chooseCategory(category.id)}
            >
              {category.name}
              <small>{category.product_count}</small>
            </button>
          ))}
        </div>
        {error && (
          <div className="store-error" role="alert">
            {error}
          </div>
        )}
        <div className="category-layout">
          <aside className="category-filters" aria-label="Filtros de produtos">
            <h2>
              <SlidersHorizontal size={18} /> Filtros
            </h2>
            <div className="category-filter-block">
              <h3>Categorias</h3>
              <button
                type="button"
                className={!categoryId ? "active" : ""}
                onClick={() => chooseCategory(null)}
              >
                Todas as peças
              </button>
              {categories.map((category) => (
                <button
                  type="button"
                  key={category.id}
                  className={categoryId === category.id ? "active" : ""}
                  onClick={() => chooseCategory(category.id)}
                >
                  {category.name}
                  <small>{category.product_count}</small>
                </button>
              ))}
            </div>
            <form className="category-filter-block" onSubmit={applyPrices}>
              <h3>Faixa de preço</h3>
              <div className="category-price-inputs">
                <label>
                  De R$
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={minPrice}
                    onChange={(event) => setMinPrice(event.target.value)}
                  />
                </label>
                <label>
                  Até R$
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={maxPrice}
                    onChange={(event) => setMaxPrice(event.target.value)}
                  />
                </label>
              </div>
              <button type="submit" className="category-apply">
                Aplicar preço
              </button>
            </form>
            <div className="category-filter-block">
              <h3>Disponibilidade</h3>
              <label className="category-check">
                <input
                  type="checkbox"
                  checked={readyOnly}
                  onChange={(event) => setReadyOnly(event.target.checked)}
                />{" "}
                Pronta para envio
              </label>
            </div>
            <button
              type="button"
              className="category-clear"
              onClick={clearFilters}
            >
              Limpar filtros
            </button>
          </aside>
          <section className="category-results" aria-live="polite">
            <div className="category-toolbar">
              <div>
                <h2>{selectedCategory?.name || "Todas as peças"}</h2>
                <p>
                  {loading
                    ? "Buscando peças..."
                    : `${total} ${total === 1 ? "peça encontrada" : "peças encontradas"}`}
                  {query && ` para “${query}”`}
                </p>
              </div>
              <label>
                Ordenar por{" "}
                <select
                  value={sort}
                  onChange={(event) => setSort(event.target.value as Sort)}
                >
                  <option value="newest">Mais recentes</option>
                  <option value="price_asc">Menor preço</option>
                  <option value="price_desc">Maior preço</option>
                </select>
              </label>
            </div>
            {loading ? (
              <div className="category-empty">Carregando peças...</div>
            ) : products.length ? (
              <>
                <div className="category-grid">
                  {products.map((product) => (
                    <MarketplaceProductCard key={product.id} product={product}
                      saved={favoriteIds.has(product.id)}
                      favoritePending={pendingFavoriteIds.has(product.id)}
                      cartPending={busyCart.has(product.id)}
                      onFavorite={() => { void toggleFavorite(product); }}
                      onCart={() => addToCart(product)} />
                  ))}
                </div>
                {products.length < total && (
                  <button
                    type="button"
                    className="category-more"
                    onClick={loadMore}
                    disabled={loadingMore}
                  >
                    {loadingMore ? "Carregando..." : "Carregar mais peças"}{" "}
                    <ArrowRight size={17} />
                  </button>
                )}
              </>
            ) : (
              !error && (
              <><div className="category-empty">
                  <PackageOpen size={38} />
                <h3>{query ? `Não encontramos produtos para “${query}”` : "Ainda não há peças nesta seleção"}</h3>
                <p>{query ? "Confira a escrita ou tente pesquisar com outras palavras." : "As peças aparecerão aqui quando forem publicadas por artesãs aprovadas."}</p>
                  {(categoryId ||
                    query ||
                    readyOnly ||
                    appliedMin !== null ||
                    appliedMax !== null) && (
                    <button type="button" onClick={clearFilters}>
                      Ver todas as peças
                    </button>
                  )}
              </div>
                {query && featuredFallback.length > 0 && (
                  <section className="category-featured-fallback">
                    <div><p className="store-eyebrow">OUTRAS DESCOBERTAS</p><h2>Produtos em destaque</h2></div>
                    <div className="category-grid">
                      {featuredFallback.map((product) => (
                        <MarketplaceProductCard key={product.id} product={product}
                          saved={favoriteIds.has(product.id)}
                          favoritePending={pendingFavoriteIds.has(product.id)}
                          cartPending={busyCart.has(product.id)}
                          onFavorite={() => { void toggleFavorite(product); }}
                          onCart={() => addToCart(product)} />
                      ))}
                    </div>
                  </section>
                )}</>
              )
            )}
          </section>
        </div>
      </main>
      <CustomerFooter
        userSignedIn={!!user}
        authLoading={cepStatus === "loading"}
      />
      {authPrompt && (
        <div
          className="store-modal-backdrop"
          role="presentation"
          onMouseDown={() => setAuthPrompt(false)}
        >
          <div
            className="store-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="category-auth-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="store-modal-close"
              onClick={() => setAuthPrompt(false)}
              aria-label="Fechar"
            >
              <X size={20} />
            </button>
            <div className="store-modal-icon">
              <Heart size={25} />
            </div>
            <h2 id="category-auth-title">Entre para continuar</h2>
            <p>
              Crie sua conta ou entre para salvar favoritos e adicionar produtos
              ao carrinho.
            </p>
            <Link href="/acesso">
              Entrar ou criar conta <ArrowRight size={18} />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
