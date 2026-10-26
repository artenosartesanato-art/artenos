"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Heart, Sparkles, X } from "@/components/icons";
import { toast } from "sonner";
import type { User } from "@supabase/supabase-js";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import { addProductToCart } from "@/lib/cart";
import { CustomerHeader } from "@/components/customer-header";
import { CustomerFooter } from "@/components/customer-footer";
import { MarketplaceProductCard } from "@/components/marketplace-product-card";
import { rememberFavoriteIntent, useMarketplace } from "@/components/marketplace-state";
import { confirmAddedToCart, confirmFavoriteRemoved, confirmFavoriteSaved } from "@/components/marketplace-feedback";
import "./storefront.css";

type Category = {
  id: string;
  name: string;
  slug: string;
  image_url: string | null;
};
type Collection = {
  id: string;
  title: string;
  description: string | null;
  image_url: string | null;
};
type Banner = {
  id: string;
  title: string;
  subtitle: string | null;
  image_url: string;
  collection_id: string | null;
};
type Product = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  stock: number | null;
  ready_to_ship: boolean;
  featured: boolean;
  category_name: string | null;
  shop_name: string | null;
};
type Shop = {
  id: string;
  store_name: string;
  specialty: string | null;
  story: string | null;
  city: string | null;
  state: string | null;
};
type Filter = {
  query: string;
  categoryId: string | null;
  collectionId: string | null;
  label: string;
};
type CepStatus = "loading" | "guest" | "account" | "error";
const emptyFilter: Filter = {
  query: "",
  categoryId: null,
  collectionId: null,
  label: "",
};

function ProductSection({
  id,
  eyebrow,
  title,
  products,
  saved,
  pendingFavorites,
  onFavorite,
  onCart,
  loading,
}: {
  id?: string;
  eyebrow: string;
  title: string;
  products: Product[];
  saved: ReadonlySet<string>;
  pendingFavorites: ReadonlySet<string>;
  onFavorite: (p: Product) => void;
  onCart: (p: Product) => Promise<void>;
  loading: boolean;
}) {
  return (
    <section id={id} className="store-section store-container">
      <div className="store-section-heading">
        <div>
          <p className="store-eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
        </div>
        <Link href="/categorias" className="store-see-all">
          Ver todos <ArrowRight size={16} />
        </Link>
      </div>
      {loading ? (
        <p className="store-empty">Carregando peças...</p>
      ) : products.length ? (
        <div className="store-products">
          {products.map((product) => (
            <MarketplaceProductCard
              key={product.id}
              product={product}
              saved={saved.has(product.id)}
              favoritePending={pendingFavorites.has(product.id)}
              onFavorite={() => onFavorite(product)}
              onCart={() => onCart(product)}
            />
          ))}
        </div>
      ) : (
        <p className="store-empty">
          Ainda não há peças publicadas nesta seleção. <Link href="/categorias">Ver todas as categorias</Link>
        </p>
      )}
    </section>
  );
}

export default function StorefrontPage() {
  const router = useRouter();
  const { favoriteIds, pendingFavoriteIds, toggleFavorite: saveFavorite } = useMarketplace();
  const [searchInput, setSearchInput] = useState("");
  const [filter, setFilter] = useState<Filter>(emptyFilter);
  const [categories, setCategories] = useState<Category[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [featured, setFeatured] = useState<Product[]>([]);
  const [ready, setReady] = useState<Product[]>([]);
  const [latest, setLatest] = useState<Product[]>([]);
  const [results, setResults] = useState<Product[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [cep, setCep] = useState("");
  const [cepStatus, setCepStatus] = useState<CepStatus>("loading");
  const [cepError, setCepError] = useState("");
  const [cepOpen, setCepOpen] = useState(false);
  const [cepInput, setCepInput] = useState("");
  const [authPrompt, setAuthPrompt] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const profileRequest = useRef(0);
  const cartPending = useRef(new Set<string>());

  const loadUserData = useCallback(async (current: User | null) => {
    const request = ++profileRequest.current;
    setUser(current);
    setCepOpen(false);
    if (!current) {
      setCep(localStorage.getItem("artenos_guest_cep") || "");
      setCepStatus("guest");
      setCepError("");
      return;
    }
    setCep("");
    setCepStatus("loading");
    setCepError("");
    try {
      const supabase = getSupabase();
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("cep")
        .eq("id", current.id)
        .single();
      if (request !== profileRequest.current) return;
      const registeredCep = profile?.cep?.replace(/\D/g, "") || "";
      if (profileError) {
        console.error("Falha ao ler CEP em profiles", {
          code: profileError.code,
          message: profileError.message,
        });
        setCepError(
          profileError.code === "42501"
            ? "Sem permissão para consultar o CEP do seu cadastro."
            : profileError.code === "PGRST116"
              ? "Seu perfil não foi encontrado. Verifique seu cadastro."
              : "Não foi possível consultar seu CEP no momento.",
        );
        setCepStatus("error");
      } else if (registeredCep.length !== 8) {
        setCepError("O CEP salvo no seu cadastro está incompleto ou inválido.");
        setCepStatus("error");
      } else {
        setCep(registeredCep);
        setCepStatus("account");
      }
    } catch {
      if (request === profileRequest.current) {
        setCepError(
          "Não foi possível conectar ao seu perfil. Confira a internet e tente novamente.",
        );
        setCepStatus("error");
      }
    }
  }, []);

  useEffect(() => {
    let active = true;
    const requestCounter = profileRequest;
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
              if (active) void loadUserData(session?.user || null);
            }, 0);
          }
        },
      );
      void Promise.all([
        supabase
          .from("storefront_categories")
          .select("id,name,slug,image_url")
          .order("sort_order"),
        supabase
          .from("storefront_collections")
          .select("id,title,description,image_url")
          .order("sort_order"),
        supabase
          .from("storefront_banners")
          .select("id,title,subtitle,image_url,collection_id")
          .order("sort_order"),
        supabase.rpc("list_storefront_shops", { p_limit: 8 }),
        supabase.rpc("search_storefront_products", {
          p_section: "featured",
          p_limit: 8,
        }),
        supabase.rpc("search_storefront_products", {
          p_section: "ready",
          p_limit: 8,
        }),
        supabase.rpc("search_storefront_products", {
          p_section: "new",
          p_limit: 8,
        }),
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
        })
        .catch(() => {
          if (active)
            setError(
              "Não foi possível carregar a vitrine. Confirme a conexão com o Supabase e execute o script da vitrine.",
            );
        })
        .finally(() => {
          if (active) setLoading(false);
        });
      return () => {
        active = false;
        requestCounter.current++;
        listener.subscription.unsubscribe();
      };
    } catch {
      queueMicrotask(() => {
        setCepError("A conexão com o Supabase não foi configurada.");
        setCepStatus("error");
        setError(
          "Configure as variáveis públicas do Supabase para carregar a vitrine.",
        );
        setLoading(false);
      });
    }
  }, [loadUserData]);

  useEffect(() => {
    if (!filter.query && !filter.categoryId && !filter.collectionId) return;
    let active = true;
    void (async () => {
      setLoading(true);
      try {
        const { data, error: queryError } = await getSupabase().rpc(
          "search_storefront_products",
          {
            p_query: filter.query || null,
            p_category_id: filter.categoryId,
            p_collection_id: filter.collectionId,
            p_section: "all",
            p_limit: 40,
          },
        );
        if (queryError) throw queryError;
        if (active) {
          setResults((data || []) as Product[]);
          setError("");
        }
      } catch {
        if (active)
          setError("Não foi possível fazer a pesquisa. Tente novamente.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [filter]);

  function chooseFilter(next: Filter) {
    setFilter(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = searchInput.trim().slice(0, 100);
    router.push(query ? `/categorias?busca=${encodeURIComponent(query)}` : "/categorias");
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
    try {
      await addProductToCart(product.id);
      confirmAddedToCart(product.name);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível adicionar este produto ao carrinho.",
      );
    } finally { cartPending.current.delete(product.id); }
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
  const filtered = Boolean(
    filter.query || filter.categoryId || filter.collectionId,
  );
  const currentBanner = banners[0];
  const firstProducts = featured.length ? featured : latest.length ? latest : ready;
  return (
    <div className="store-page">
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

      <main>
        {error && (
          <div className="store-error store-container" role="alert">
            {error}
          </div>
        )}
        <section className="store-hero">
          <div className="store-container store-hero-inner">
            <div className="store-hero-copy">
              <p className="store-eyebrow">O encontro com o feito à mão</p>
              <h1>
                {currentBanner?.title ||
                  "Histórias que ganham forma em cada detalhe."}
              </h1>
              <p>
                {currentBanner?.subtitle ||
                  "Explore criações de artesãs e descubra peças feitas para durar."}
              </p>
              <div className="store-hero-actions">
                <Link href="#explorar-produtos">Explorar produtos <ArrowRight size={18} /></Link>
                <Link href="/sob-encomenda">Solicitar uma peça personalizada</Link>
              </div>
              {currentBanner?.collection_id && (
                <button className="store-hero-collection" onClick={() => chooseFilter({
                  query: "", categoryId: null, collectionId: currentBanner.collection_id,
                  label: currentBanner.title,
                })}>Explorar coleção</button>
              )}
            </div>
            <div className="store-hero-art">
              <span className="store-hero-art-kicker">Descubra a Artenós</span>
              <strong>Feito à mão tem história.</strong>
              <p>Conheça quem cria, encontre sua próxima peça ou encomende algo só seu.</p>
              <Link href="/lojas">Conhecer as lojas <ArrowRight size={17} /></Link>
            </div>
          </div>
        </section>

        <ProductSection
          id="explorar-produtos"
          eyebrow="Peças de artesãos da Artenós"
          title="Explore o feito à mão"
          products={firstProducts}
          saved={favoriteIds}
          pendingFavorites={pendingFavoriteIds}
          onFavorite={toggleFavorite}
          onCart={addToCart}
          loading={loading}
        />

        <nav className="store-discovery store-container" aria-label="Descubra a Artenós">
          <Link href="/categorias">
            <small>Encontre sua próxima peça</small>
            <span>Explore o feito à mão <ArrowRight size={22} /></span>
          </Link>
          <Link href="/sob-encomenda">
            <small>Uma criação do seu jeito</small>
            <span>Solicitar uma peça personalizada <ArrowRight size={22} /></span>
          </Link>
          <Link href="/lojas">
            <small>Por trás de cada criação</small>
            <span>Conheça nossas lojas <ArrowRight size={22} /></span>
          </Link>
        </nav>

        {filtered && (
          <ProductSection
            eyebrow="Sua descoberta"
            title={filter.label}
            products={results}
            saved={favoriteIds}
            pendingFavorites={pendingFavoriteIds}
            onFavorite={toggleFavorite}
            onCart={addToCart}
            loading={loading}
          />
        )}

        <section id="categorias" className="store-section store-container">
          <div className="store-section-heading">
            <div>
              <p className="store-eyebrow">Encontre seu estilo</p>
              <h2>Categorias de artesanato</h2>
            </div>
          </div>
          {categories.length ? (
            <div className="store-categories">
              {categories.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  onClick={() =>
                    router.push(
                      `/categorias?categoria=${encodeURIComponent(category.id)}`,
                    )
                  }
                >
                  {category.image_url ? (
                    <img src={category.image_url} alt="" loading="lazy" />
                  ) : (
                    <span className="store-category-placeholder">
                      <Sparkles size={25} />
                    </span>
                  )}
                  <span>{category.name}</span>
                  <ArrowRight size={16} />
                </button>
              ))}
            </div>
          ) : (
            <p className="store-empty">
              As categorias aparecerão aqui assim que forem publicadas.
            </p>
          )}
        </section>

        <div className="store-warm-band">
          <ProductSection
            eyebrow="Para receber em breve"
            title="Peças prontas para envio"
            products={ready}
            saved={favoriteIds}
            pendingFavorites={pendingFavoriteIds}
            onFavorite={toggleFavorite}
            onCart={addToCart}
            loading={loading}
          />
        </div>

        <section className="store-section store-container">
          <div className="store-section-heading">
            <div>
              <p className="store-eyebrow">Inspiração para explorar</p>
              <h2>Coleções e temas</h2>
            </div>
          </div>
          {collections.length ? (
            <div className="store-collections">
              {collections.map((collection) => (
                <button
                  key={collection.id}
                  className="store-collection"
                  type="button"
                  onClick={() =>
                    chooseFilter({
                      query: "",
                      categoryId: null,
                      collectionId: collection.id,
                      label: collection.title,
                    })
                  }
                >
                  {collection.image_url && (
                    <img src={collection.image_url} alt="" loading="lazy" />
                  )}
                  <span>
                    <strong>{collection.title}</strong>
                    {collection.description && (
                      <small>{collection.description}</small>
                    )}
                    <em>
                      Explorar coleção <ArrowRight size={16} />
                    </em>
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p className="store-empty">
              Novas coleções serão exibidas quando forem publicadas.
            </p>
          )}
        </section>

        <section id="lojas" className="store-section store-container">
          <div className="store-section-heading">
            <div>
              <p className="store-eyebrow">Por trás de cada peça</p>
              <h2>Artesãs e lojas em destaque</h2>
            </div>
          </div>
          {shops.length ? (
            <div className="store-shops">
              {shops.map((shop) => (
                <Link
                  href={`/loja?id=${encodeURIComponent(shop.id)}`}
                  key={shop.id}
                >
                  <div className="store-shop-symbol">
                    <Sparkles size={24} />
                  </div>
                  <h3>{shop.store_name}</h3>
                  <p>{shop.specialty || "Artesanato autoral"}</p>
                  <small>
                    {[shop.city, shop.state].filter(Boolean).join(" · ")}
                  </small>
                  <span>
                    Conhecer a loja <ArrowRight size={14} />
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="store-empty">As lojas aprovadas aparecerão aqui.</p>
          )}
        </section>

        <ProductSection
          eyebrow="Sempre algo novo"
          title="Novidades e recomendações"
          products={latest}
          saved={favoriteIds}
          pendingFavorites={pendingFavoriteIds}
          onFavorite={toggleFavorite}
          onCart={addToCart}
          loading={loading}
        />
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
            aria-labelledby="store-modal-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              className="store-modal-close"
              onClick={() => setAuthPrompt(false)}
              aria-label="Fechar"
            >
              <X size={20} />
            </button>
            <div className="store-modal-icon">
              <Heart size={25} />
            </div>
            <h2 id="store-modal-title">Entre para continuar</h2>
            <p>
              Crie sua conta ou entre para salvar favoritos e adicionar produtos
              ao carrinho.
            </p>
            <a href="/acesso">
              Entrar ou criar conta <ArrowRight size={18} />
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
