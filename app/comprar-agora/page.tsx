"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowRight, Clock3, LoaderCircle, LockKeyhole, MapPin, PackageOpen, RefreshCw, ShieldCheck, Sparkles, Store, Truck } from "@/components/icons";
import { getSupabase } from "@/lib/supabase";
import { getCartErrorMessage } from "@/lib/cart";
import { useMarketplace } from "@/components/marketplace-state";
import { OptimizedImage } from "@/components/optimized-image";
import { brl, toCents, type ShippingGroup } from "@/lib/cart-groups";
import { requestShippingQuotes } from "@/lib/shipping-quote";
import { findBlockedTerm, moderationError } from "@/lib/moderation";
import { NOTES_MAX_LENGTH } from "@/lib/rich-text";
import { accessHref } from "@/lib/navigation";
import "../storefront.css";
import "../carrinho/cart.css";

type BuyNow = {
  product_id: string; product_name: string; image_url: string | null; artisan_id: string; store_name: string;
  quantity: number; unit_price: number; current_price: number; availability: "ready" | "made_to_order" | "sold_out";
  max_quantity: number; product_summary: string | null; customer_notes: string | null; product_active: boolean;
};

const formatCep = (cep: string) => cep.replace(/(\d{5})(\d{3})/, "$1-$2");
const days = (min: number, max: number) => (min === max ? `${max} ${max === 1 ? "dia útil" : "dias úteis"}` : `${min} a ${max} dias úteis`);

/** "Comprar agora": uma peça só, direto para o pagamento, sem mexer no carrinho. */
export default function BuyNowPage() {
  const router = useRouter();
  const { authReady, userId, cep, cepStatus, cepError } = useMarketplace();
  const [item, setItem] = useState<BuyNow | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [shipping, setShipping] = useState<ShippingGroup | null>(null);
  const [shippingLoading, setShippingLoading] = useState(false);
  const [shippingError, setShippingError] = useState("");
  const [quoteId, setQuoteId] = useState("");
  const [notes, setNotes] = useState("");
  const [finishing, setFinishing] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");
  const finishingRef = useRef(false);

  const load = useCallback(async () => {
    const { data, error } = await getSupabase().rpc("get_buy_now");
    if (error) {
      setLoadError("Não foi possível carregar a peça escolhida.");
    } else {
      const row = (Array.isArray(data) ? data[0] : data) as BuyNow | undefined;
      setItem(row ?? null);
      setNotes(row?.customer_notes ?? "");
      setLoadError("");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!authReady) return;
    if (!userId) { queueMicrotask(() => setLoading(false)); return; }
    queueMicrotask(() => void load());
  }, [authReady, userId, load]);

  const calculate = useCallback(async () => {
    if (!item || !/^\d{8}$/.test(cep)) return;
    setShippingLoading(true);
    setShippingError("");
    setQuoteId("");
    try {
      const groups = await requestShippingQuotes(cep, "buy_now");
      setShipping(groups[0] ?? null);
    } catch (error) {
      setShipping(null);
      setShippingError(error instanceof Error ? error.message : "Não foi possível consultar as transportadoras agora.");
    } finally {
      setShippingLoading(false);
    }
  }, [cep, item]);

  useEffect(() => {
    if (!item?.product_id) return;
    const timer = window.setTimeout(() => void calculate(), 200);
    return () => window.clearTimeout(timer);
  }, [calculate, item?.product_id]);

  async function pay() {
    if (finishingRef.current || !item) return;
    if (!quoteId) return setCheckoutError("Escolha uma opção de entrega.");
    finishingRef.current = true;
    setFinishing(true);
    setCheckoutError("");
    const supabase = getSupabase();
    try {
      if (item.availability === "made_to_order" && notes.trim() !== (item.customer_notes ?? "").trim()) {
        if (findBlockedTerm(notes)) throw new Error("As observações contêm termos que não são permitidos na Artenós.");
        const { error: notesError } = await supabase.rpc("set_buy_now_notes", { p_notes: notes.trim() || null });
        if (notesError) throw new Error(moderationError(notesError) ?? "Não foi possível salvar as observações.");
      }
      const { data, error } = await supabase.rpc("create_checkout_from_item", { p_quote_id: quoteId });
      if (error) {
        throw new Error(/pagamento em andamento/i.test(error.message)
          ? "Você tem um pagamento em andamento. Conclua ou cancele essa compra em Pedidos antes de abrir outra."
          : /frete válido/i.test(error.message) ? "O frete expirou. Escolha a entrega de novo."
            : getCartErrorMessage(error));
      }
      router.push(`/pagamento/${data}`);
    } catch (error) {
      setCheckoutError(error instanceof Error ? error.message : "Não foi possível abrir o pagamento.");
      if (/frete/i.test(String(error))) void calculate();
    } finally {
      setFinishing(false);
      finishingRef.current = false;
    }
  }

  const selected = shipping?.options.find((option) => option.id === quoteId);
  const productsCents = item ? toCents(item.unit_price) * item.quantity : 0;
  const totalCents = productsCents + (selected ? toCents(selected.price) : 0);
  const priceChanged = Boolean(item && Number(item.unit_price) !== Number(item.current_price));
  const blocked = !item || !item.product_active || item.availability === "sold_out" || priceChanged;

  return (
    <div className="store-page cart-page">
      <main id="conteudo" tabIndex={-1} className="store-container cart-main">
        <header className="cart-heading">
          <div>
            <p className="store-eyebrow">Compra direta</p>
            <h1>{item?.availability === "made_to_order" ? "Encomendar agora" : "Comprar agora"}</h1>
          </div>
          <p className="cart-heading-meta">Seu carrinho continua como estava.</p>
        </header>
        <ol className="cart-steps" aria-label="Etapas da compra">
          <li aria-current="step"><span>1</span> Peça e entrega</li>
          <li><span>2</span> Pagamento</li>
          <li><span>3</span> Confirmação</li>
        </ol>

        {!authReady || loading ? (
          <div className="cart-layout" aria-busy="true" role="status" aria-label="Carregando">
            <span className="an-skeleton cart-skeleton" />
            <span className="an-skeleton cart-skeleton cart-skeleton-summary" />
          </div>
        ) : !userId ? (
          <section className="an-state">
            <LockKeyhole size={34} />
            <h2>Entre para continuar</h2>
            <p>Para comprar, entre ou crie sua conta Artenós.</p>
            <div className="an-state-actions"><Link className="an-btn" href={accessHref("/comprar-agora")}>Entrar ou criar conta</Link></div>
          </section>
        ) : loadError ? (
          <section className="an-state" role="alert">
            <AlertTriangle size={34} />
            <h2>{loadError}</h2>
            <div className="an-state-actions">
              <button type="button" className="an-btn" onClick={() => { setLoading(true); void load(); }}><RefreshCw size={15} /> Tentar novamente</button>
            </div>
          </section>
        ) : !item ? (
          <section className="an-state">
            <PackageOpen size={36} />
            <h2>Nenhuma peça escolhida</h2>
            <p>Abra uma peça e toque em “Comprar agora”.</p>
            <div className="an-state-actions"><Link className="an-btn" href="/categorias">Explorar peças <ArrowRight size={16} /></Link></div>
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
              </div>

              <section className="cart-store" aria-labelledby="peca-escolhida">
                <header className="cart-store-header">
                  <Store size={18} />
                  <h2 id="peca-escolhida">{item.store_name}</h2>
                  <span>{item.quantity} {item.quantity === 1 ? "unidade" : "unidades"}</span>
                </header>
                <ul className="cart-items">
                  <li className={`cart-item${blocked ? " is-unavailable" : ""}`}>
                    <div className="cart-item-thumb">
                      {item.image_url ? <OptimizedImage src={item.image_url} alt="" width={96} height={96} sizes="96px" /> : <Sparkles size={22} />}
                    </div>
                    <div className="cart-item-copy">
                      <h3>{item.product_name}</h3>
                      {item.product_summary && <p className="cart-item-summary">{item.product_summary}</p>}
                      <p>{item.quantity} × {brl(toCents(item.unit_price))}</p>
                      {!item.product_active || item.availability === "sold_out" ? (
                        <p className="cart-item-warning"><AlertTriangle size={14} /> Esta peça não está mais disponível.</p>
                      ) : priceChanged ? (
                        <p className="cart-item-warning"><AlertTriangle size={14} /> O preço mudou. Abra a peça e escolha de novo.</p>
                      ) : item.availability === "made_to_order" ? (
                        <p className="cart-item-stock">Sob encomenda — produzida depois do pedido</p>
                      ) : null}
                      {item.availability === "made_to_order" && !blocked && (
                        <div className="cart-item-notes">
                          <label htmlFor="observacoes-loja">Observações para a loja <small>(opcional)</small></label>
                          <textarea id="observacoes-loja" rows={2} maxLength={NOTES_MAX_LENGTH} value={notes}
                            placeholder="Ex.: cor, nome para personalizar, tamanho" onChange={(event) => setNotes(event.target.value)} />
                          <small>{notes.length}/{NOTES_MAX_LENGTH}</small>
                        </div>
                      )}
                    </div>
                    <strong>{brl(productsCents)}</strong>
                  </li>
                </ul>
                <fieldset className="cart-store-shipping" disabled={blocked}>
                  <legend><Truck size={16} /> Entrega</legend>
                  {shippingLoading ? (
                    <p className="cart-shipping-state" role="status"><LoaderCircle size={15} className="spin" /> Consultando transportadoras…</p>
                  ) : shippingError || shipping?.error ? (
                    <p className="cart-shipping-error" role="alert">
                      <AlertTriangle size={14} /> {shippingError || shipping?.error}{" "}
                      <button type="button" className="an-btn an-btn--ghost an-btn--sm" onClick={() => void calculate()}>Tentar de novo</button>
                    </p>
                  ) : shipping ? (
                    <div className="cart-shipping-options">
                      {shipping.options.map((option) => (
                        <label key={option.id} className={quoteId === option.id ? "is-selected" : ""}>
                          <input type="radio" name="frete" checked={quoteId === option.id} onChange={() => setQuoteId(option.id)} />
                          <span>
                            <b>{option.companyName} · {option.serviceName}</b>
                            <small><Clock3 size={12} /> {days(option.totalMinDays, option.totalMaxDays)}
                              {option.productionDays > 0 ? `, incluindo ${option.productionDays} de produção` : ""}</small>
                          </span>
                          <em>{brl(toCents(option.price))}</em>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <p className="cart-shipping-state">{/^\d{8}$/.test(cep) ? "As opções de entrega aparecem aqui assim que o frete for calculado." : "Informe um CEP válido no seu perfil para ver as opções."}</p>
                  )}
                </fieldset>
              </section>
            </div>

            <aside className="cart-summary" aria-labelledby="resumo-titulo">
              <h2 id="resumo-titulo">Resumo</h2>
              <dl>
                <div><dt>Produto ({item.quantity})</dt><dd>{brl(productsCents)}</dd></div>
                <div><dt>Frete</dt><dd>{selected ? brl(toCents(selected.price)) : "A escolher"}</dd></div>
                <div className="cart-summary-total"><dt>Total</dt><dd>{brl(totalCents)}</dd></div>
              </dl>
              {checkoutError && <div className="an-alert an-alert--error" role="alert"><AlertTriangle size={17} /><span>{checkoutError}</span></div>}
              <button type="button" className="an-btn an-btn--lg an-btn--block cart-checkout" onClick={() => void pay()}
                disabled={blocked || !quoteId || finishing} aria-busy={finishing}>
                {finishing ? <LoaderCircle className="spin" size={18} /> : <LockKeyhole size={17} />}
                {finishing ? "Abrindo pagamento…" : "Ir para o pagamento"}
              </button>
              <ul className="cart-summary-notes">
                <li><ShieldCheck size={13} /> Compra segura: Pix ou cartão via Mercado Pago.</li>
                <li>Estoque, CEP e frete são confirmados de novo antes do pagamento.</li>
              </ul>
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}
