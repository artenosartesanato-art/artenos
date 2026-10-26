"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import {
  ArrowRight,
  Clock3,
  LoaderCircle,
  Minus,
  PackageOpen,
  Plus,
  RefreshCw,
  ShoppingBag,
  Trash2,
  Truck,
} from "@/components/icons";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CustomerFooter } from "@/components/customer-footer";
import { CustomerHeader } from "@/components/customer-header";
import { getSupabase } from "@/lib/supabase";
import { getCartErrorMessage } from "@/lib/cart";
import { notifyCartChanged } from "@/components/marketplace-state";
import "../storefront.css";
import "./cart.css";

type CartItem = {
  item_id: string;
  product_id: string;
  product_name: string;
  store_name: string;
  unit_price: number;
  quantity: number;
  stock: number | null;
  product_active: boolean;
  added_at: string;
};

type CepStatus = "loading" | "guest" | "account" | "error";

type ShippingOption = {
  id: string;
  serviceId: number;
  serviceName: string;
  companyName: string;
  price: number;
  carrierMinDays: number;
  carrierMaxDays: number;
  productionDays: number;
  totalMinDays: number;
  totalMaxDays: number;
  expiresAt: string;
};

type ShippingGroup = {
  artisanId: string;
  storeName: string;
  originCep?: string;
  error?: string;
  options: ShippingOption[];
};

const brl = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Trabalha em centavos para não ter erro de arredondamento nas somas.
const toCents = (value: number) => Math.round(Number(value) * 100);

export default function CarrinhoPage() {
  const router = useRouter();
  const supabase = getSupabase();
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState("Carregando seu carrinho...");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [cartLoadError, setCartLoadError] = useState(false);
  const [busyItems, setBusyItems] = useState<ReadonlySet<string>>(new Set());
  const pendingItems = useRef(new Set<string>());
  const currentAccount = useRef<string | null>(null);
  const accountRequest = useRef(0);
  const finishingRef = useRef(false);
  const [finishing, setFinishing] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [cep, setCep] = useState("");
  const [cepStatus, setCepStatus] = useState<CepStatus>("loading");
  const [cepError, setCepError] = useState("");
  const [cepOpen, setCepOpen] = useState(false);
  const [cepInput, setCepInput] = useState("");
  const [shippingGroups, setShippingGroups] = useState<ShippingGroup[]>([]);
  const [selectedShipping, setSelectedShipping] = useState<Record<string, string>>({});
  const [shippingLoading, setShippingLoading] = useState(false);
  const [shippingError, setShippingError] = useState("");

  // Mantém a função original de leitura do carrinho no Supabase.
  const refresh = useCallback(async () => {
    const account = currentAccount.current;
    const { data, error } = await supabase.rpc("list_cart");
    if (account !== currentAccount.current) return;
    if (error) {
      setStatus("Erro ao carregar carrinho: " + error.message);
      setCartLoadError(true);
      setLoading(false);
      return;
    }
    setCart((data ?? []) as CartItem[]);
    setCartLoadError(false);
    setStatus("");
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    let active = true;

    async function loadSession(current: User | null) {
      if (!active) return;
      const request = ++accountRequest.current;
      if (currentAccount.current !== current?.id) {
        currentAccount.current = current?.id ?? null;
        setCart([]);
        setCartLoadError(false);
        pendingItems.current.clear();
        setBusyItems(new Set());
      }
      setUser(current);
      setCepOpen(false);
      if (!current) {
        setCart([]);
        setStatus("Você precisa estar logado para acessar seu carrinho.");
        setLoading(false);
        setCep(localStorage.getItem("artenos_guest_cep") || "");
        setCepStatus("guest");
        return;
      }

      setLoading(true);
      setStatus("Carregando seu carrinho...");
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("cep")
        .eq("id", current.id)
        .single();
      if (!active || request !== accountRequest.current) return;
      const registeredCep = profile?.cep?.replace(/\D/g, "") || "";
      if (profileError || registeredCep.length !== 8) {
        setCepStatus("error");
        setCepError("Não foi possível consultar o CEP do seu cadastro.");
      } else {
        setCep(registeredCep);
        setCepStatus("account");
      }
      await refresh();
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
            void loadSession(session?.user || null);
          }, 0);
        }
      },
    );

    return () => {
      active = false;
      accountRequest.current++;
      currentAccount.current = null;
      listener.subscription.unsubscribe();
    };
  }, [refresh, supabase]);

  const cartShippingKey = cart
    .map((item) => `${item.product_id}:${item.quantity}:${item.unit_price}`)
    .sort()
    .join("|");

  const calculateShipping = useCallback(async () => {
    if (!user || !/^\d{8}$/.test(cep) || cart.length === 0) return;
    setShippingLoading(true);
    setShippingError("");
    setSelectedShipping({});
    try {
      const { data: result, error } = await supabase.functions.invoke(
        "calculate-shipping",
        { body: { destinationCep: cep } },
      );
      const payload = (result ?? {}) as {
        groups?: ShippingGroup[];
        error?: string;
      };
      if (error || payload.error) {
        let message = payload.error || error?.message;
        if (error && "context" in error && error.context instanceof Response) {
          const details = (await error.context.clone().json().catch(() => null)) as
            | { error?: string }
            | null;
          message = details?.error || message;
        }
        throw new Error(message || "Não foi possível calcular o frete.");
      }
      setShippingGroups(payload.groups ?? []);
    } catch (error) {
      setShippingGroups([]);
      setShippingError(
        error instanceof Error ? error.message : "Não foi possível calcular o frete.",
      );
    } finally {
      setShippingLoading(false);
    }
  }, [cart.length, cep, supabase, user]);

  useEffect(() => {
    if (!user || !/^\d{8}$/.test(cep) || !cartShippingKey) {
      let active = true;
      queueMicrotask(() => {
        if (active) {
          setShippingGroups([]);
          setSelectedShipping({});
        }
      });
      return () => { active = false; };
    }
    const timer = window.setTimeout(() => void calculateShipping(), 300);
    return () => window.clearTimeout(timer);
  }, [calculateShipping, cartShippingKey, cep, user]);

  async function selectShipping(group: ShippingGroup, quoteId: string) {
    try {
      const { data, error } = await supabase.rpc("select_cart_shipping_quote", {
        p_quote_id: quoteId,
      });
      if (error || data !== true) throw error ?? new Error();
      setSelectedShipping((current) => ({
        ...current,
        [group.artisanId]: quoteId,
      }));
    } catch {
      toast.error("Esta cotação expirou ou o carrinho mudou. Calcule novamente.");
      await calculateShipping();
    }
  }

  // Funções originais do carrinho: quantidade, remoção e checkout.
  async function changeQuantity(item: CartItem, newQuantity: number) {
    if (newQuantity < 1) return removeItem(item.item_id);
    if (pendingItems.current.has(item.item_id)) return;
    if (item.stock !== null && newQuantity > item.stock) {
      return toast.error(
        `Há somente ${item.stock} unidade(s) disponível(is) deste produto.`,
      );
    }
    pendingItems.current.add(item.item_id);
    setBusyItems(new Set(pendingItems.current));
    try {
      const { error } = await supabase.rpc("set_cart_quantity", {
        p_item_id: item.item_id,
        p_quantity: newQuantity,
      });
      if (error) return toast.error(getCartErrorMessage(error));
      await refresh();
      notifyCartChanged();
    } finally {
      pendingItems.current.delete(item.item_id);
      setBusyItems(new Set(pendingItems.current));
    }
  }

  async function removeItem(itemId: string) {
    if (pendingItems.current.has(itemId)) return;
    pendingItems.current.add(itemId);
    setBusyItems(new Set(pendingItems.current));
    try {
      const { error } = await supabase.rpc("remove_from_cart", { p_item_id: itemId });
      if (error) {
        toast.error("Não foi possível remover o produto. Tente novamente.");
        return;
      }
      await refresh();
      notifyCartChanged();
      toast.success("Produto removido do carrinho.");
    } finally {
      pendingItems.current.delete(itemId);
      setBusyItems(new Set(pendingItems.current));
    }
  }

  async function checkout() {
    if (finishingRef.current) return;
    if (
      shippingGroups.length === 0 ||
      shippingGroups.some(
        (group) => group.error || !selectedShipping[group.artisanId],
      )
    ) {
      return toast.error("Selecione uma opção de frete para cada loja.");
    }
    finishingRef.current = true;
    setFinishing(true);
    // O checkout antigo não inclui frete nem reserva de estoque. Não crie uma
    // compra com total incorreto enquanto a migração do banco estiver pendente.
    const { error: schemaError } = await supabase
      .from("checkouts")
      .select("integration_version,shipping_snapshot")
      .limit(1);
    if (schemaError) {
      const message = schemaError.code === "42703"
        ? "Pagamento indisponível: a atualização do banco ainda precisa ser aplicada."
        : "Não foi possível verificar a configuração do pagamento. Tente novamente.";
      setStatus(message);
      toast.error(message);
      setFinishing(false);
      finishingRef.current = false;
      return;
    }
    const { data, error } = await supabase.rpc("create_checkout_from_cart");
    if (error) {
      const message = /compra antiga em aberto/i.test(error.message)
        ? "Há uma compra anterior em aberto. Ela precisa ser conciliada ou cancelada antes de finalizar outra."
        : getCartErrorMessage(error);
      setStatus(message);
      toast.error(message);
      setFinishing(false);
      finishingRef.current = false;
      await refresh();
      await calculateShipping();
      return;
    }
    setFinishing(false);
    finishingRef.current = false;
    if (!data) {
      toast.error("Não foi possível abrir o pagamento. Tente novamente.");
      return;
    }
    router.push(`/pagamento/${data}`);
  }

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

  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
  const totalCents = cart.reduce(
    (sum, item) => sum + toCents(item.unit_price) * item.quantity,
    0,
  );
  const shippingCents = shippingGroups.reduce((sum, group) => {
    const selected = group.options.find(
      (option) => option.id === selectedShipping[group.artisanId],
    );
    return sum + (selected ? toCents(selected.price) : 0);
  }, 0);
  const shippingReady =
    !shippingLoading &&
    shippingGroups.length > 0 &&
    shippingGroups.every(
      (group) => !group.error && Boolean(selectedShipping[group.artisanId]),
    );

  return (
    <div className="store-page cart-page">
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
      <main className="store-container cart-main">
        <header className="cart-heading">
          <div>
            <p className="store-eyebrow">SUA COMPRA</p>
            <h1>Carrinho</h1>
            <p>Revise as peças, quantidades e valores antes de finalizar.</p>
          </div>
          {user && (
            <span>
              <ShoppingBag size={18} /> {totalItems}{" "}
              {totalItems === 1 ? "item" : "itens"}
            </span>
          )}
        </header>

        {!user ? (
          <section className="cart-state">
            <ShoppingBag size={36} />
            <h2>Entre para acessar seu carrinho</h2>
            <p>Seus produtos ficam vinculados à sua conta Artenós.</p>
            <Link href="/acesso">
              Entrar ou criar conta <ArrowRight size={17} />
            </Link>
          </section>
        ) : loading ? (
          <section className="cart-state">
            <LoaderCircle className="cart-spin" size={31} />
            <strong>Carregando seu carrinho...</strong>
          </section>
        ) : cartLoadError ? (
          <section className="cart-state" role="alert">
            <h2>Não foi possível carregar o carrinho</h2>
            <p>Confira sua conexão e tente novamente. Seus itens não foram apagados.</p>
            <button type="button" onClick={() => void refresh()}>Tentar novamente</button>
          </section>
        ) : cart.length === 0 ? (
          <section className="cart-state">
            <PackageOpen size={38} />
            <h2>Seu carrinho está vazio</h2>
            <p>
              Explore as peças publicadas pelas artesãs e adicione suas
              favoritas.
            </p>
            <Link href="/categorias">
              Explorar peças <ArrowRight size={17} />
            </Link>
          </section>
        ) : (
          <div className="cart-layout">
            <section className="cart-items" aria-label="Produtos no carrinho">
              {cart.map((item) => (
                <article
                  className={
                    !item.product_active ||
                    (item.stock !== null && item.quantity > item.stock)
                      ? "is-unavailable"
                      : ""
                  }
                  key={item.item_id}
                >
                  <div className="cart-item-symbol">
                    <ShoppingBag size={22} />
                  </div>
                  <div className="cart-item-copy">
                    <small>{item.store_name}</small>
                    <h2>{item.product_name}</h2>
                    <p>
                      Adicionado em{" "}
                      {new Date(item.added_at).toLocaleString("pt-BR")}
                    </p>
                    <strong>{brl(toCents(item.unit_price))} cada</strong>
                    {!item.product_active ? (
                      <em>Produto indisponível</em>
                    ) : item.stock !== null && item.quantity > item.stock ? (
                      <em>Estoque atualizado: restam {item.stock}</em>
                    ) : item.stock !== null ? (
                      <span>{item.stock} unidade(s) em estoque</span>
                    ) : null}
                  </div>
                  <div className="cart-item-controls">
                    <div aria-label={`Quantidade de ${item.product_name}`}>
                      <button
                        type="button"
                        disabled={busyItems.has(item.item_id)}
                        onClick={() => changeQuantity(item, item.quantity - 1)}
                        aria-label="Diminuir quantidade"
                      >
                        <Minus size={15} />
                      </button>
                      <span>{item.quantity}</span>
                      <button
                        type="button"
                        disabled={
                          !item.product_active ||
                          busyItems.has(item.item_id) ||
                          (item.stock !== null && item.quantity >= item.stock)
                        }
                        onClick={() => changeQuantity(item, item.quantity + 1)}
                        aria-label="Aumentar quantidade"
                      >
                        <Plus size={15} />
                      </button>
                    </div>
                    <strong>
                      {brl(toCents(item.unit_price) * item.quantity)}
                    </strong>
                    <button
                      className="cart-remove"
                      type="button"
                      disabled={busyItems.has(item.item_id)}
                      onClick={() => removeItem(item.item_id)}
                    >
                      {busyItems.has(item.item_id) ? <LoaderCircle size={15} className="cart-spin" /> : <Trash2 size={15} />} Remover
                    </button>
                  </div>
                </article>
              ))}
            </section>
            <aside className="cart-summary">
              <h2>Resumo da compra</h2>
              <section className="cart-shipping" aria-label="Opções de frete">
                <div className="cart-shipping-title">
                  <span><Truck size={17} /> Entrega</span>
                  {!shippingLoading && (
                    <button type="button" onClick={() => void calculateShipping()} aria-label="Calcular frete novamente">
                      <RefreshCw size={14} />
                    </button>
                  )}
                </div>
                <p>Opções reais para o CEP {cep.replace(/(\d{5})(\d{3})/, "$1-$2")}.</p>
                {shippingLoading ? (
                  <div className="cart-shipping-state">
                    <LoaderCircle className="cart-spin" size={17} /> Consultando transportadoras...
                  </div>
                ) : shippingError ? (
                  <div className="cart-shipping-error">{shippingError}</div>
                ) : (
                  shippingGroups.map((group) => (
                    <div className="cart-shipping-store" key={group.artisanId}>
                      <strong>{group.storeName}</strong>
                      {group.error ? (
                        <div className="cart-shipping-error">{group.error}</div>
                      ) : (
                        group.options.map((option) => (
                          <label
                            className={selectedShipping[group.artisanId] === option.id ? "is-selected" : ""}
                            key={option.id}
                          >
                            <input
                              type="radio"
                              name={`shipping-${group.artisanId}`}
                              checked={selectedShipping[group.artisanId] === option.id}
                              onChange={() => void selectShipping(group, option.id)}
                            />
                            <span>
                              <b>{option.companyName} · {option.serviceName}</b>
                              <small><Clock3 size={12} /> {option.totalMinDays === option.totalMaxDays ? `${option.totalMaxDays} dia(s)` : `${option.totalMinDays} a ${option.totalMaxDays} dias`} com produção</small>
                            </span>
                            <em>{brl(toCents(option.price))}</em>
                          </label>
                        ))
                      )}
                    </div>
                  ))
                )}
              </section>
              <dl>
                <div>
                  <dt>Produtos ({totalItems})</dt>
                  <dd>{brl(totalCents)}</dd>
                </div>
                <div>
                  <dt>Frete</dt>
                  <dd>{shippingReady ? brl(shippingCents) : "Selecione acima"}</dd>
                </div>
                <div className="cart-summary-total">
                  <dt>Total</dt>
                  <dd>{brl(totalCents + shippingCents)}</dd>
                </div>
              </dl>
              <button
                type="button"
                onClick={checkout}
                disabled={
                  finishing ||
                  !shippingReady ||
                  cart.some(
                    (item) =>
                      !item.product_active ||
                      (item.stock !== null && item.quantity > item.stock),
                  )
                }
              >
                {finishing ? (
                  <LoaderCircle className="cart-spin" size={17} />
                ) : (
                  <ShoppingBag size={17} />
                )}
                {finishing ? "Finalizando..." : "Finalizar compra"}
              </button>
              <small>
                O estoque, o CEP e a cotação são confirmados novamente no momento da compra.
              </small>
            </aside>
          </div>
        )}

        {status && user && !loading && (
          <p className="cart-status" role="status">
            {status}
          </p>
        )}
      </main>
      <CustomerFooter
        userSignedIn={!!user}
        authLoading={cepStatus === "loading"}
      />
    </div>
  );
}
