"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowRight,
  Clock3,
  LoaderCircle,
  LockKeyhole,
  MapPin,
  Minus,
  PackageOpen,
  Plus,
  RefreshCw,
  ShoppingBag,
  Sparkles,
  Store,
  Trash2,
  Truck,
} from "@/components/icons";
import { CustomerFooter } from "@/components/customer-footer";
import { CustomerHeader } from "@/components/customer-header";
import { getSupabase } from "@/lib/supabase";
import { getCartErrorMessage } from "@/lib/cart";
import { accessHref } from "@/lib/navigation";
import { playUiSound } from "@/lib/ui-sound";
import { notifyCartChanged, useMarketplace } from "@/components/marketplace-state";
import { brl, groupCartByStore, toCents, type CartItem, type ShippingGroup } from "@/lib/cart-groups";
import "../storefront.css";
import "./cart.css";

const formatCep = (cep: string) => cep.replace(/(\d{5})(\d{3})/, "$1-$2");
const days = (min: number, max: number) => (min === max ? `${max} ${max === 1 ? "dia útil" : "dias úteis"}` : `${min} a ${max} dias úteis`);

export default function CarrinhoPage() {
  const router = useRouter();
  const { authReady, userId, cep, cepStatus, cepError } = useMarketplace();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [cartLoadError, setCartLoadError] = useState(false);
  const [busyItems, setBusyItems] = useState<ReadonlySet<string>>(new Set());
  const pendingItems = useRef(new Set<string>());
  const finishingRef = useRef(false);
  const [finishing, setFinishing] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");
  const [shippingGroups, setShippingGroups] = useState<ShippingGroup[]>([]);
  const [selectedShipping, setSelectedShipping] = useState<Record<string, string>>({});
  const [selectingQuote, setSelectingQuote] = useState<string | null>(null);
  const [shippingLoading, setShippingLoading] = useState(false);
  const [shippingError, setShippingError] = useState("");
  const accountRef = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    const account = accountRef.current;
    const { data, error } = await getSupabase().rpc("list_cart");
    if (account !== accountRef.current) return;
    if (error) {
      setCartLoadError(true);
      setLoading(false);
      return;
    }
    setCart((data ?? []) as CartItem[]);
    setCartLoadError(false);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!authReady) return;
    accountRef.current = userId;
    pendingItems.current.clear();
    queueMicrotask(() => {
      setBusyItems(new Set());
      setCart([]);
      setCheckoutError("");
      if (!userId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      void refresh();
    });
  }, [authReady, userId, refresh]);

  const cartShippingKey = cart.map((item) => `${item.product_id}:${item.quantity}:${item.unit_price}`).sort().join("|");

  const calculateShipping = useCallback(async () => {
    if (!userId || !/^\d{8}$/.test(cep) || cart.length === 0) return;
    setShippingLoading(true);
    setShippingError("");
    setSelectedShipping({});
    try {
      const { data: result, error } = await getSupabase().functions.invoke("calculate-shipping", { body: { destinationCep: cep } });
      const payload = (result ?? {}) as { groups?: ShippingGroup[]; error?: string };
      if (error || payload.error) {
        let message = payload.error || error?.message;
        if (error && "context" in error && error.context instanceof Response) {
          const details = (await error.context.clone().json().catch(() => null)) as { error?: string } | null;
          message = details?.error || message;
        }
        throw new Error(message || "Não foi possível calcular o frete.");
      }
      setShippingGroups(payload.groups ?? []);
    } catch (error) {
      setShippingGroups([]);
      const message = error instanceof Error ? error.message : "";
      setShippingError(/fetch|network|edge function|non-2xx/i.test(message) || !message
        ? "Não foi possível consultar as transportadoras agora."
        : message);
    } finally {
      setShippingLoading(false);
    }
  }, [cart.length, cep, userId]);

  useEffect(() => {
    if (!userId || !/^\d{8}$/.test(cep) || !cartShippingKey) {
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
  }, [calculateShipping, cartShippingKey, cep, userId]);

  async function selectShipping(group: ShippingGroup, quoteId: string) {
    setSelectingQuote(quoteId);
    try {
      const { data, error } = await getSupabase().rpc("select_cart_shipping_quote", { p_quote_id: quoteId });
      if (error || data !== true) throw error ?? new Error();
      setSelectedShipping((current) => ({ ...current, [group.artisanId]: quoteId }));
    } catch {
      toast.error("Esta cotação expirou ou o carrinho mudou. Calculamos o frete de novo.");
      await calculateShipping();
    } finally {
      setSelectingQuote(null);
    }
  }

  async function changeQuantity(item: CartItem, newQuantity: number) {
    if (newQuantity < 1) return removeItem(item);
    if (pendingItems.current.has(item.item_id)) return;
    if (item.stock !== null && newQuantity > item.stock) {
      toast.error(`Há somente ${item.stock} ${item.stock === 1 ? "unidade disponível" : "unidades disponíveis"} deste produto.`);
      return;
    }
    pendingItems.current.add(item.item_id);
    setBusyItems(new Set(pendingItems.current));
    try {
      const { error } = await getSupabase().rpc("set_cart_quantity", { p_item_id: item.item_id, p_quantity: newQuantity });
      if (error) {
        toast.error(getCartErrorMessage(error));
        return;
      }
      await refresh();
      notifyCartChanged();
    } finally {
      pendingItems.current.delete(item.item_id);
      setBusyItems(new Set(pendingItems.current));
    }
  }

  async function removeItem(item: CartItem) {
    if (pendingItems.current.has(item.item_id)) return;
    pendingItems.current.add(item.item_id);
    setBusyItems(new Set(pendingItems.current));
    try {
      const { error } = await getSupabase().rpc("remove_from_cart", { p_item_id: item.item_id });
      if (error) {
        toast.error("Não foi possível remover o produto. Tente novamente.");
        return;
      }
      await refresh();
      notifyCartChanged();
      playUiSound("removed");
      toast.success(`${item.product_name} saiu do carrinho.`);
    } finally {
      pendingItems.current.delete(item.item_id);
      setBusyItems(new Set(pendingItems.current));
    }
  }

  async function checkout() {
    if (finishingRef.current) return;
    if (shippingGroups.length === 0 || shippingGroups.some((group) => group.error || !selectedShipping[group.artisanId])) {
      setCheckoutError("Escolha uma opção de entrega para cada loja antes de continuar.");
      return;
    }
    finishingRef.current = true;
    setFinishing(true);
    setCheckoutError("");
    const supabase = getSupabase();
    try {
      // O checkout antigo não inclui frete nem reserva de estoque. Não crie uma
      // compra com total incorreto enquanto a migração do banco estiver pendente.
      const { error: schemaError } = await supabase.from("checkouts").select("integration_version,shipping_snapshot").limit(1);
      if (schemaError) {
        setCheckoutError(schemaError.code === "42703"
          ? "O pagamento está temporariamente indisponível. Nenhuma cobrança foi feita."
          : "Não foi possível verificar o pagamento agora. Tente novamente.");
        return;
      }
      const { data, error } = await supabase.rpc("create_checkout_from_cart");
      if (error) {
        setCheckoutError(/compra antiga em aberto/i.test(error.message)
          ? "Há uma compra anterior em aberto. Ela precisa ser concluída ou cancelada antes de finalizar outra."
          : getCartErrorMessage(error));
        await refresh();
        await calculateShipping();
        return;
      }
      if (!data) {
        setCheckoutError("Não foi possível abrir o pagamento. Tente novamente.");
        return;
      }
      router.push(`/pagamento/${data}`);
    } finally {
      setFinishing(false);
      finishingRef.current = false;
    }
  }

  const groups = useMemo(() => groupCartByStore(cart, shippingGroups), [cart, shippingGroups]);
  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
  const productsCents = cart.reduce((sum, item) => sum + toCents(item.unit_price) * item.quantity, 0);
  const shippingCents = shippingGroups.reduce((sum, group) => {
    const selected = group.options.find((option) => option.id === selectedShipping[group.artisanId]);
    return sum + (selected ? toCents(selected.price) : 0);
  }, 0);
  const missingShipping = shippingGroups.filter((group) => !group.error && !selectedShipping[group.artisanId]).length;
  const shippingReady = !shippingLoading && shippingGroups.length > 0 &&
    shippingGroups.every((group) => !group.error && Boolean(selectedShipping[group.artisanId]));
  const blockedItems = cart.filter((item) => !item.product_active || (item.stock !== null && item.quantity > item.stock));
  const canCheckout = !finishing && shippingReady && blockedItems.length === 0;
  const checkoutHint = blockedItems.length
    ? "Remova ou ajuste os itens indisponíveis para continuar."
    : !/^\d{8}$/.test(cep)
      ? "Cadastre um CEP válido no seu perfil para calcular o frete."
      : shippingLoading ? "Calculando o frete…"
        : missingShipping ? `Escolha a entrega de ${missingShipping === 1 ? "1 loja" : `${missingShipping} lojas`}.` : "";

  return (
    <div className="store-page cart-page">
      <CustomerHeader />
      <main id="conteudo" tabIndex={-1} className="store-container cart-main">
        <header className="cart-heading">
          <div>
            <p className="store-eyebrow">Sua compra</p>
            <h1>Carrinho</h1>
          </div>
          {userId && cart.length > 0 && (
            <p className="cart-heading-meta">
              {totalItems} {totalItems === 1 ? "unidade" : "unidades"} · {groups.length} {groups.length === 1 ? "loja" : "lojas"}
            </p>
          )}
        </header>
        {userId && cart.length > 0 && (
          <ol className="cart-steps" aria-label="Etapas da compra">
            <li aria-current="step"><span>1</span> Carrinho e entrega</li>
            <li><span>2</span> Pagamento</li>
            <li><span>3</span> Confirmação</li>
          </ol>
        )}

        {!authReady || (userId && loading) ? (
          <div className="cart-layout" aria-busy="true" role="status" aria-label="Carregando carrinho">
            <div className="cart-groups">
              {[0, 1].map((index) => <span key={index} className="an-skeleton cart-skeleton" />)}
            </div>
            <span className="an-skeleton cart-skeleton cart-skeleton-summary" />
          </div>
        ) : !userId ? (
          <section className="an-state">
            <ShoppingBag size={34} />
            <h2>Entre para ver seu carrinho</h2>
            <p>O carrinho fica guardado na sua conta Artenós, para você continuar em qualquer aparelho.</p>
            <div className="an-state-actions">
              <Link className="an-btn" href={accessHref("/carrinho")}>Entrar ou criar conta <ArrowRight size={16} /></Link>
              <Link className="an-btn an-btn--secondary" href="/categorias">Explorar peças</Link>
            </div>
          </section>
        ) : cartLoadError ? (
          <section className="an-state" role="alert">
            <AlertTriangle size={34} />
            <h2>Não foi possível carregar o carrinho</h2>
            <p>Confira sua conexão e tente novamente. Seus itens não foram apagados.</p>
            <div className="an-state-actions">
              <button type="button" className="an-btn" onClick={() => { setLoading(true); void refresh(); }}>
                <RefreshCw size={15} /> Tentar novamente
              </button>
            </div>
          </section>
        ) : cart.length === 0 ? (
          <section className="an-state">
            <PackageOpen size={36} />
            <h2>Seu carrinho está vazio</h2>
            <p>Explore as peças das artesãs e adicione as suas preferidas.</p>
            <div className="an-state-actions">
              <Link className="an-btn" href="/categorias">Explorar peças <ArrowRight size={16} /></Link>
              <Link className="an-btn an-btn--secondary" href="/favoritos">Ver favoritos</Link>
            </div>
          </section>
        ) : (
          <div className="cart-layout">
            <div className="cart-groups">
              <div className="cart-destination">
                <MapPin size={18} />
                {cepStatus === "account" ? (
                  <span>Entrega para o CEP <strong>{formatCep(cep)}</strong> do seu cadastro. <Link href="/perfil">Alterar</Link></span>
                ) : (
                  <span>{cepError || "Não encontramos o CEP do seu cadastro."} <Link href="/perfil">Atualizar no perfil</Link></span>
                )}
                {!shippingLoading && /^\d{8}$/.test(cep) && (
                  <button type="button" className="an-btn an-btn--ghost an-btn--sm" onClick={() => void calculateShipping()}>
                    <RefreshCw size={13} /> Recalcular frete
                  </button>
                )}
              </div>
              {shippingError && (
                <div className="an-alert an-alert--error" role="alert">
                  <AlertTriangle size={18} />
                  <span><strong>Frete indisponível no momento</strong>{shippingError} Seus itens continuam no carrinho.</span>
                  <button type="button" className="an-btn an-btn--secondary an-btn--sm" onClick={() => void calculateShipping()}>Tentar de novo</button>
                </div>
              )}

              {groups.map((group, groupIndex) => {
                const selected = group.shipping?.options.find((option) => option.id === selectedShipping[group.shipping?.artisanId ?? ""]);
                const groupCents = group.productsCents + (selected ? toCents(selected.price) : 0);
                const headingId = `loja-${groupIndex}`;
                return (
                  <section className="cart-store" key={group.key} aria-labelledby={headingId}>
                    <header className="cart-store-header">
                      <Store size={18} />
                      <h2 id={headingId}>{group.storeName}</h2>
                      <span>{group.items.length} {group.items.length === 1 ? "peça" : "peças"}</span>
                    </header>
                    <ul className="cart-items">
                      {group.items.map((item) => {
                        const busy = busyItems.has(item.item_id);
                        const overStock = item.stock !== null && item.quantity > item.stock;
                        const unavailable = !item.product_active || overStock;
                        return (
                          <li className={`cart-item${unavailable ? " is-unavailable" : ""}${busy ? " is-busy" : ""}`} key={item.item_id}>
                            <div className="cart-item-thumb">
                              {item.image_url
                                // eslint-disable-next-line @next/next/no-img-element
                                ? <img src={item.image_url} alt="" width={96} height={96} loading="lazy" />
                                : <Sparkles size={22} />}
                            </div>
                            <div className="cart-item-copy">
                              <h3>{item.product_name}</h3>
                              <p>{brl(toCents(item.unit_price))} cada</p>
                              {!item.product_active ? (
                                <p className="cart-item-warning"><AlertTriangle size={14} /> Esta peça não está mais disponível.</p>
                              ) : overStock ? (
                                <p className="cart-item-warning"><AlertTriangle size={14} /> Restam {item.stock} — ajuste a quantidade.</p>
                              ) : item.stock !== null && item.stock <= 3 ? (
                                <p className="cart-item-stock">{item.stock === 1 ? "Última unidade" : `${item.stock} unidades em estoque`}</p>
                              ) : null}
                            </div>
                            <div className="cart-item-controls">
                              <div className="an-stepper an-stepper--sm" role="group" aria-label={`Quantidade de ${item.product_name}`}>
                                <button type="button" disabled={busy} onClick={() => void changeQuantity(item, item.quantity - 1)}
                                  aria-label={item.quantity === 1 ? `Remover ${item.product_name}` : "Diminuir quantidade"}>
                                  {item.quantity === 1 ? <Trash2 size={13} /> : <Minus size={13} />}
                                </button>
                                <output aria-live="polite">{busy ? <LoaderCircle size={14} className="spin" /> : item.quantity}</output>
                                <button type="button" aria-label="Aumentar quantidade"
                                  disabled={!item.product_active || busy || (item.stock !== null && item.quantity >= item.stock)}
                                  onClick={() => void changeQuantity(item, item.quantity + 1)}>
                                  <Plus size={13} />
                                </button>
                              </div>
                              <strong>{brl(toCents(item.unit_price) * item.quantity)}</strong>
                              <button className="cart-remove" type="button" disabled={busy} onClick={() => void removeItem(item)}>
                                Remover
                              </button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>

                    <fieldset className="cart-store-shipping">
                      <legend><Truck size={16} /> Entrega desta loja</legend>
                      {shippingLoading ? (
                        <p className="cart-shipping-state" role="status"><LoaderCircle size={15} className="spin" /> Consultando transportadoras…</p>
                      ) : !group.shipping ? (
                        <p className="cart-shipping-state">{/^\d{8}$/.test(cep) ? "As opções de entrega aparecem aqui assim que o frete for calculado." : "Informe um CEP válido para ver as opções."}</p>
                      ) : group.shipping.error ? (
                        <p className="cart-shipping-error" role="alert"><AlertTriangle size={14} /> {group.shipping.error}</p>
                      ) : (
                        <div className="cart-shipping-options">
                          {group.shipping.options.map((option) => (
                            <label key={option.id} className={selectedShipping[group.shipping!.artisanId] === option.id ? "is-selected" : ""}>
                              <input type="radio" name={`frete-${group.shipping!.artisanId}`}
                                checked={selectedShipping[group.shipping!.artisanId] === option.id}
                                disabled={selectingQuote !== null}
                                onChange={() => void selectShipping(group.shipping!, option.id)} />
                              <span>
                                <b>{option.companyName} · {option.serviceName}</b>
                                <small><Clock3 size={12} /> {days(option.totalMinDays, option.totalMaxDays)}
                                  {option.productionDays > 0 ? `, incluindo ${option.productionDays} de produção` : ""}</small>
                              </span>
                              <em>{selectingQuote === option.id ? <LoaderCircle size={14} className="spin" /> : brl(toCents(option.price))}</em>
                            </label>
                          ))}
                        </div>
                      )}
                    </fieldset>
                    <footer className="cart-store-total">
                      <span>Subtotal da loja {selected ? "com frete" : "(sem frete)"}</span>
                      <strong>{brl(groupCents)}</strong>
                    </footer>
                  </section>
                );
              })}
            </div>

            <aside className="cart-summary" aria-labelledby="resumo-titulo">
              <h2 id="resumo-titulo">Resumo</h2>
              <dl>
                <div><dt>Produtos ({totalItems})</dt><dd>{brl(productsCents)}</dd></div>
                <div>
                  <dt>Frete {shippingGroups.length > 1 ? `(${shippingGroups.length} lojas)` : ""}</dt>
                  <dd>{shippingReady ? brl(shippingCents) : "A escolher"}</dd>
                </div>
                <div className="cart-summary-total"><dt>Total</dt><dd>{brl(productsCents + (shippingReady ? shippingCents : 0))}</dd></div>
              </dl>
              {checkoutError && (
                <div className="an-alert an-alert--error" role="alert">
                  <AlertTriangle size={17} /><span>{checkoutError}</span>
                </div>
              )}
              <button type="button" className="an-btn an-btn--lg an-btn--block cart-checkout" onClick={() => void checkout()}
                disabled={!canCheckout} aria-busy={finishing} aria-describedby={checkoutHint ? "checkout-hint" : undefined}>
                {finishing ? <LoaderCircle className="spin" size={18} /> : <LockKeyhole size={17} />}
                {finishing ? "Abrindo pagamento…" : "Ir para o pagamento"}
              </button>
              {checkoutHint && <p className="cart-checkout-hint" id="checkout-hint">{checkoutHint}</p>}
              <ul className="cart-summary-notes">
                <li>Pix ou cartão via Mercado Pago, na próxima etapa.</li>
                <li>Estoque, CEP e frete são confirmados de novo antes do pagamento.</li>
              </ul>
            </aside>

            <div className="cart-mobile-bar" aria-hidden="true">
              <span><small>Total</small><strong>{brl(productsCents + (shippingReady ? shippingCents : 0))}</strong></span>
              <button type="button" className="an-btn" tabIndex={-1} disabled={!canCheckout} onClick={() => void checkout()}>
                {finishing ? "Abrindo…" : "Pagamento"}
              </button>
            </div>
          </div>
        )}
      </main>
      <CustomerFooter />
    </div>
  );
}
