"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Heart,
  PackageOpen,
} from "@/components/icons";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import { toast } from "sonner";
import { CustomerFooter } from "@/components/customer-footer";
import { CustomerHeader } from "@/components/customer-header";
import { getSupabase } from "@/lib/supabase";
import { addProductToCart } from "@/lib/cart";
import { MarketplaceProductCard } from "@/components/marketplace-product-card";
import { useMarketplace } from "@/components/marketplace-state";
import { confirmAddedToCart, confirmFavoriteRemoved } from "@/components/marketplace-feedback";
import "../storefront.css";
import "./favorites.css";

type CepStatus = "loading" | "guest" | "account" | "error";
type FavoriteProduct = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  stock: number | null;
  ready_to_ship: boolean;
  category_name: string | null;
  shop_name: string | null;
  favorite_created_at: string;
  total_count: number;
};

export default function FavoritesPage() {
  const { pendingFavoriteIds, toggleFavorite: saveFavorite } = useMarketplace();
  const cartPending = useRef(new Set<string>());
  const [busyCart, setBusyCart] = useState<ReadonlySet<string>>(new Set());
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [products, setProducts] = useState<FavoriteProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");
  const [cep, setCep] = useState("");
  const [cepStatus, setCepStatus] = useState<CepStatus>("loading");
  const [cepError, setCepError] = useState("");
  const [cepOpen, setCepOpen] = useState(false);
  const [cepInput, setCepInput] = useState("");
  const profileRequest = useRef(0);
  const favoriteRequest = useRef(0);

  const loadSession = useCallback(async (current: User | null) => {
    const request = ++profileRequest.current;
    setUser(current);
    setAuthReady(true);
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
      const { data: profile, error: profileError } = await getSupabase()
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
              if (active) void loadSession(session?.user || null);
            }, 0);
          }
        },
      );
      return () => {
        active = false;
        profileRequest.current++;
        favoriteRequest.current++;
        listener.subscription.unsubscribe();
      };
    } catch {
      queueMicrotask(() => {
        setAuthReady(true);
        setCepStatus("error");
        setCepError("Supabase não configurado.");
        setError("Configure as variáveis públicas do Supabase.");
        setLoading(false);
      });
    }
  }, [loadSession]);

  useEffect(() => {
    const request = ++favoriteRequest.current;
    if (!authReady || !user) {
      queueMicrotask(() => {
        if (request === favoriteRequest.current) {
          setProducts([]);
          setLoading(!authReady);
          setError("");
        }
      });
      return;
    }

    queueMicrotask(() => {
      if (request === favoriteRequest.current) setLoading(true);
    });
    void Promise.resolve(
      getSupabase().rpc("list_my_favorite_products", {
        p_query: query || null,
        p_limit: 100,
        p_offset: 0,
      }),
    )
      .then(({ data, error: favoriteError }) => {
        if (request !== favoriteRequest.current) return;
        if (favoriteError) throw favoriteError;
        setProducts((data || []) as FavoriteProduct[]);
        setError("");
      })
      .catch(() => {
        if (request === favoriteRequest.current)
          setError(
            "Não foi possível carregar seus favoritos. Execute o script favoritos.sql no Supabase e tente novamente.",
          );
      })
      .finally(() => {
        if (request === favoriteRequest.current) setLoading(false);
      });
  }, [authReady, user, query]);

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setQuery(searchInput.trim().slice(0, 100));
  }

  async function removeFavorite(product: FavoriteProduct) {
    if (!user) return;
    try {
      const saved = await saveFavorite(product.id);
      if (saved) throw new Error("O favorito foi atualizado. Recarregue a página.");
      setProducts((current) => current.filter((item) => item.id !== product.id));
      confirmFavoriteRemoved(product.name);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível remover este favorito.");
    }
  }

  async function addToCart(product: FavoriteProduct) {
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
    <div className="store-page favorites-page">
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

      <main className="store-container favorites-main">
        <section className="favorites-intro">
          <div>
            <p className="store-eyebrow">SUAS ESCOLHAS</p>
            <h1>Meus favoritos</h1>
            <p>
              As peças que conquistaram você ficam reunidas aqui. Use o coração
              para adicionar ou remover um produto.
            </p>
          </div>
          <div className="favorites-intro-icon" aria-hidden="true">
            <Heart size={38} fill="currentColor" />
          </div>
        </section>

        {!authReady || loading ? (
          <div className="favorites-state">
            <Heart className="favorites-pulse" size={37} />
            <p>Carregando seus favoritos...</p>
          </div>
        ) : !user ? (
          <section className="favorites-state favorites-login">
            <div className="favorites-state-icon">
              <Heart size={30} />
            </div>
            <h2>Entre para ver seus favoritos</h2>
            <p>
              Ao entrar na Artenós, todas as peças marcadas com o coração ficam
              salvas na sua conta.
            </p>
            <Link href="/acesso">
              Entrar ou criar conta <ArrowRight size={17} />
            </Link>
          </section>
        ) : (
          <>
            <div className="favorites-toolbar">
              <div>
                <strong>{products.length}</strong>
                <span>
                  {products.length === 1 ? "peça favorita" : "peças favoritas"}
                  {query && ` nesta busca`}
                </span>
              </div>
              {query && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchInput("");
                    setQuery("");
                  }}
                >
                  Limpar busca
                </button>
              )}
            </div>
            {error ? (
              <div className="store-error" role="alert">
                {error}
              </div>
            ) : products.length ? (
              <section className="favorites-grid" aria-live="polite">
                {products.map((product) => (
                  <MarketplaceProductCard key={product.id} product={product}
                    saved favoritePending={pendingFavoriteIds.has(product.id)}
                    cartPending={busyCart.has(product.id)}
                    onFavorite={() => { void removeFavorite(product); }}
                    onCart={() => addToCart(product)} />
                ))}
              </section>
            ) : (
              <section className="favorites-state">
                <div className="favorites-state-icon">
                  <PackageOpen size={31} />
                </div>
                <h2>
                  {query
                    ? "Nenhum favorito encontrado"
                    : "Você ainda não favoritou nenhuma peça"}
                </h2>
                <p>
                  {query
                    ? "Tente pesquisar outro nome, categoria ou loja."
                    : "Explore o catálogo e toque no coração das peças que você mais gostar."}
                </p>
                {query ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchInput("");
                      setQuery("");
                    }}
                  >
                    Ver todos os favoritos
                  </button>
                ) : (
                  <Link href="/categorias">
                    Explorar peças <ArrowRight size={17} />
                  </Link>
                )}
              </section>
            )}
          </>
        )}
      </main>

      <CustomerFooter userSignedIn={!!user} authLoading={!authReady} />
    </div>
  );
}
