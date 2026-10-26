"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  LoaderCircle,
  MapPin,
  PackageOpen,
  Sparkles,
  Store,
} from "@/components/icons";
import { useRouter, useSearchParams } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { toast } from "sonner";
import { CustomerHeader } from "@/components/customer-header";
import { CustomerFooter } from "@/components/customer-footer";
import { getSupabase } from "@/lib/supabase";
import { addProductToCart } from "@/lib/cart";
import { MarketplaceProductCard } from "@/components/marketplace-product-card";
import { rememberFavoriteIntent, useMarketplace } from "@/components/marketplace-state";
import { confirmAddedToCart, confirmFavoriteRemoved, confirmFavoriteSaved } from "@/components/marketplace-feedback";
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

type Product = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  stock: number | null;
  ready_to_ship: boolean;
  category_name: string | null;
};

type CepStatus = "loading" | "guest" | "account" | "error";

const STORE_BUCKET = "artenos-store-assets";

function PublicStoreContent() {
  const { favoriteIds, pendingFavoriteIds, toggleFavorite: saveFavorite } = useMarketplace();
  const cartPending = useRef(new Set<string>());
  const accountRequest = useRef(0);
  const [busyCart, setBusyCart] = useState<ReadonlySet<string>>(new Set());
  const router = useRouter();
  const searchParams = useSearchParams();
  const artisanId = searchParams.get("id") || "";
  const [store, setStore] = useState<PublicStore | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [cep, setCep] = useState("");
  const [cepStatus, setCepStatus] = useState<CepStatus>("loading");
  const [cepError, setCepError] = useState("");
  const [cepOpen, setCepOpen] = useState(false);
  const [cepInput, setCepInput] = useState("");

  useEffect(() => {
    let active = true;
    const supabase = getSupabase();

    async function loadAccount(current: User | null) {
      const request = ++accountRequest.current;
      if (!active) return;
      setUser(current);
      setCep("");
      setCepStatus("loading");
      if (!current) {
        setCep(localStorage.getItem("artenos_guest_cep") || "");
        setCepStatus("guest");
        return;
      }
      const profileResponse = await supabase.from("profiles").select("cep").eq("id", current.id).single();
      if (!active || request !== accountRequest.current) return;
      const registeredCep = profileResponse.data?.cep?.replace(/\D/g, "") || "";
      if (profileResponse.error || registeredCep.length !== 8) {
        setCepStatus("error");
        setCepError("Não foi possível consultar o CEP do seu cadastro.");
      } else {
        setCep(registeredCep);
        setCepStatus("account");
      }
    }

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
            void loadAccount(session?.user || null);
          }, 0);
        }
      },
    );

    if (!artisanId) {
      queueMicrotask(() => {
        if (active) {
          setError("Esta loja não está disponível.");
          setLoading(false);
        }
      });
      return () => {
        active = false;
        listener.subscription.unsubscribe();
      };
    }

    void Promise.all([
      supabase.rpc("get_public_artisan_store", { p_artisan_id: artisanId }),
      supabase.rpc("list_public_artisan_products", {
        p_artisan_id: artisanId,
        p_limit: 48,
        p_offset: 0,
      }),
    ])
      .then(([storeResponse, productResponse]) => {
        if (!active) return;
        if (storeResponse.error || productResponse.error)
          throw storeResponse.error || productResponse.error;
        const currentStore = (
          Array.isArray(storeResponse.data)
            ? storeResponse.data[0]
            : storeResponse.data
        ) as PublicStore | undefined;
        if (!currentStore) {
          setError("Esta loja não está disponível.");
          return;
        }
        setStore(currentStore);
        setProducts((productResponse.data || []) as Product[]);
      })
      .catch(() => {
        if (active)
          setError(
            "Não foi possível carregar esta loja. Confirme que o script supabase/minha_loja.sql foi executado.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [artisanId]);

  const coverUrl = useMemo(
    () =>
      store?.cover_path
        ? getSupabase()
            .storage.from(STORE_BUCKET)
            .getPublicUrl(store.cover_path).data.publicUrl
        : "",
    [store],
  );

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = searchInput.trim().slice(0, 100);
    router.push(
      query ? `/categorias?busca=${encodeURIComponent(query)}` : "/categorias",
    );
  }

  async function saveCep(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (user) return;
    const digits = cepInput.replace(/\D/g, "");
    if (digits.length !== 8) return toast.error("Digite um CEP com 8 números.");
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

  async function toggleFavorite(product: Product) {
    if (!user) {
      rememberFavoriteIntent(product.id, product.name);
      router.push("/acesso");
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
      router.push("/acesso");
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

  return (
    <div className="store-page public-shop-page">
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
        onToggleCep={() => setCepOpen((value) => !value)}
        onCepInput={setCepInput}
        onSaveCep={saveCep}
      />
      <main>
        {loading ? (
          <section className="public-shop-state">
            <LoaderCircle className="public-shop-spin" size={30} />
            <strong>Carregando loja...</strong>
          </section>
        ) : error || !store ? (
          <section className="public-shop-state">
            <Store size={34} />
            <h1>Loja indisponível</h1>
            <p>{error}</p>
            <button type="button" onClick={() => router.push("/")}>
              Voltar para a vitrine
            </button>
          </section>
        ) : (
          <>
            <section className="public-shop-hero">
              <div
                className="public-shop-cover"
                style={
                  coverUrl ? { backgroundImage: `url(${coverUrl})` } : undefined
                }
              >
                {!coverUrl && <Sparkles size={42} />}
                {store.vacation_mode && <span>Loja em pausa</span>}
              </div>
              <div className="store-container public-shop-profile">
                <span className="public-shop-symbol">
                  <Store size={27} />
                </span>
                <div>
                  <p className="store-eyebrow">LOJA ARTESÃ APROVADA</p>
                  <h1>{store.store_name}</h1>
                  <p className="public-shop-specialty">
                    {store.specialty || "Artesanato autoral"}
                  </p>
                  <span>
                    <MapPin size={15} />{" "}
                    {[store.city, store.state].filter(Boolean).join(" · ")}
                  </span>
                </div>
                <dl>
                  <div>
                    <dt>Peças publicadas</dt>
                    <dd>{store.published_products}</dd>
                  </div>
                  <div>
                    <dt>Prazo médio</dt>
                    <dd>Até {store.production_time_days} dias</dd>
                  </div>
                  <div>
                    <dt>Sob encomenda</dt>
                    <dd>
                      {store.vacation_mode
                        ? "Pausado"
                        : store.accepts_custom_orders
                          ? "Disponível"
                          : "Indisponível"}
                    </dd>
                  </div>
                </dl>
              </div>
            </section>

            <section className="store-container public-shop-about">
              {store.announcement && (
                <blockquote>{store.announcement}</blockquote>
              )}
              <div>
                <div>
                  <p className="store-eyebrow">POR TRÁS DA LOJA</p>
                  <h2>Uma história feita à mão</h2>
                </div>
                <p>
                  {store.story ||
                    "A história desta loja ainda não foi publicada."}
                </p>
              </div>
            </section>

            <section className="store-container public-shop-products">
              <div className="public-shop-section-heading">
                <div>
                  <p className="store-eyebrow">VITRINE DA LOJA</p>
                  <h2>Peças publicadas</h2>
                </div>
                <span>
                  {products.length} {products.length === 1 ? "peça" : "peças"}
                </span>
              </div>
              {products.length ? (
                <div className="store-products">
                  {products.map((product) => (
                    <MarketplaceProductCard key={product.id} product={product}
                      shopName={store.store_name}
                      saved={favoriteIds.has(product.id)}
                      favoritePending={pendingFavoriteIds.has(product.id)}
                      cartPending={busyCart.has(product.id)}
                      cartDisabled={store.vacation_mode}
                      onFavorite={() => { void toggleFavorite(product); }}
                      onCart={() => addToCart(product)} />
                  ))}
                </div>
              ) : (
                <div className="public-shop-empty">
                  <PackageOpen size={38} />
                  <h3>Nenhuma peça publicada ainda</h3>
                  <p>
                    Os produtos aparecerão aqui quando a artesã publicá-los no
                    catálogo.
                  </p>
                </div>
              )}
            </section>

            {store.accepts_custom_orders && !store.vacation_mode && (
              <section className="store-container public-shop-custom">
                <div>
                  <Sparkles size={29} />
                  <div>
                    <h2>Gostou do estilo desta loja?</h2>
                    <p>
                      Veja as opções personalizadas publicadas pelas artesãs na
                      área Sob encomenda.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => router.push("/sob-encomenda")}
                >
                  Explorar encomendas <ArrowRight size={17} />
                </button>
              </section>
            )}
          </>
        )}
      </main>
      <CustomerFooter
        userSignedIn={!!user}
        authLoading={cepStatus === "loading"}
      />
    </div>
  );
}

export default function PublicStorePage() {
  return (
    <Suspense
      fallback={
        <main className="public-shop-state">
          <LoaderCircle className="public-shop-spin" size={30} />
          <strong>Carregando loja...</strong>
        </main>
      }
    >
      <PublicStoreContent />
    </Suspense>
  );
}
