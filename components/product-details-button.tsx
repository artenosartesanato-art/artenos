"use client";

import {
  ArrowRight,
  Boxes,
  Clock3,
  Heart,
  LoaderCircle,
  MapPin,
  Minus,
  PackageOpen,
  Plus,
  Ruler,
  Scale,
  ShieldCheck,
  ShoppingBag,
  CreditCard,
  Store,
  Truck,
} from "@/components/icons";
import Link from "next/link";
import { requestShippingQuotes } from "@/lib/shipping-quote";
import type { ShippingOption } from "@/lib/cart-groups";
import { useEffect, useId, useState, type ReactNode } from "react";
import { getSupabase } from "@/lib/supabase";
import { Dialog } from "@/components/ui/dialog";
import { useMarketplace } from "@/components/marketplace-state";
import { useStorefrontActions } from "@/components/storefront-actions";
import { ProductInquiryLink } from "@/components/product-inquiry-link";
import { OptimizedImage } from "@/components/optimized-image";
import { RichText } from "@/components/rich-text";
import { useBuyNow } from "@/components/use-buy-now";
import { StarRating } from "@/components/stars";
import { ReviewsList } from "@/components/reviews-list";
import { AVAILABILITY_LABEL, availabilityFor, maxQuantityFor, productionLabel, type Availability } from "@/lib/availability";
import { StoreAvatar } from "@/components/store-avatar";

type ProductDetails = {
  id: string;
  name: string;
  description?: string | null;
  price: number;
  image_url?: string | null;
  stock?: number | null;
  ready_to_ship?: boolean;
  availability?: Availability | null;
  rating_avg?: number | string | null;
  rating_count?: number | null;
  category_name?: string | null;
  shop_name?: string | null;
  shop_id?: string | null;
  /** Fotos extras, quando existirem (a primeira continua sendo image_url). */
  images?: string[] | null;
};

type StoreSummary = { store_name: string; city: string | null; state: string | null };

type ShippingDetails = {
  origin_cep: string | null;
  weight_grams: number | null;
  height_cm: number | null;
  width_cm: number | null;
  length_cm: number | null;
  package_count: number | null;
  production_time_days: number | null;
  shipping_data_complete: boolean;
};

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const decimal = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });

function formatCep(value: string | null) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length === 8 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : null;
}

function formatWeight(value: number | null) {
  const grams = Number(value);
  if (!Number.isFinite(grams) || grams <= 0) return null;
  return grams >= 1000 ? `${decimal.format(grams / 1000)} kg` : `${decimal.format(grams)} g`;
}

export function ProductDetailsButton({ product, children, cartDisabled = false }: {
  product: ProductDetails;
  children?: (openDetails: () => void) => ReactNode;
  cartDisabled?: boolean;
}) {
  const titleId = useId();
  const { cep, favoriteIds, pendingFavoriteIds, userId } = useMarketplace();
  const { addToCart, toggleFavorite, pendingCartIds } = useStorefrontActions();
  const { buyNow: startBuyNowFlow, prepare: prepareBuyNow } = useBuyNow();
  const [buying, setBuying] = useState(false);
  const [freight, setFreight] = useState<{ loading: boolean; error: string; options: ShippingOption[] | null }>({ loading: false, error: "", options: null });
  const [open, setOpen] = useState(false);
  // O diálogo só entra na árvore depois da primeira abertura: uma grade com
  // dezenas de cards não precisa de dezenas de diálogos ociosos.
  const [everOpened, setEverOpened] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [zoomed, setZoomed] = useState(false);
  const [shipping, setShipping] = useState<ShippingDetails | null>(null);
  const [shippingLoading, setShippingLoading] = useState(false);
  const [shippingError, setShippingError] = useState(false);
  const [imageIndex, setImageIndex] = useState(0);
  const [store, setStore] = useState<StoreSummary | null>(null);
  const [storeRating, setStoreRating] = useState<{ avg: number | null; count: number }>({ avg: null, count: 0 });

  // Cartão da loja: cidade e nota média (só quando o detalhe é aberto).
  useEffect(() => {
    if (!open || !product.shop_id) return;
    let active = true;
    const supabase = getSupabase();
    void Promise.all([
      supabase.rpc("get_public_artisan_store", { p_artisan_id: product.shop_id }),
      supabase.rpc("get_store_rating", { p_artisan_id: product.shop_id }),
    ]).then(([storeResponse, ratingResponse]) => {
      if (!active) return;
      const row = (Array.isArray(storeResponse.data) ? storeResponse.data[0] : storeResponse.data) as StoreSummary | undefined;
      if (!storeResponse.error && row) setStore(row);
      const rating = (Array.isArray(ratingResponse.data) ? ratingResponse.data[0] : ratingResponse.data) as { rating_avg: number | null; rating_count: number } | undefined;
      if (!ratingResponse.error && rating) setStoreRating({ avg: rating.rating_avg, count: Number(rating.rating_count ?? 0) });
    }).catch(() => null);
    return () => { active = false; };
  }, [open, product.shop_id]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    async function loadShippingDetails() {
      try {
        const { data, error } = await getSupabase().rpc("get_product_shipping_quote_data", { p_product_id: product.id });
        if (error) throw error;
        if (!active) return;
        const details = (Array.isArray(data) ? data[0] : data) as ShippingDetails | undefined;
        setShipping(details ?? null);
        setShippingError(false);
      } catch {
        if (!active) return;
        setShipping(null);
        setShippingError(true);
      } finally {
        if (active) setShippingLoading(false);
      }
    }
    void loadShippingDetails();
    return () => { active = false; };
  }, [open, product.id]);

  function openDetails() {
    setShipping(null);
    setShippingError(false);
    setShippingLoading(true);
    setQuantity(1);
    setFreight({ loading: false, error: "", options: null });
    setZoomed(false);
    setImageIndex(0);
    setEverOpened(true);
    setOpen(true);
  }

  async function add() {
    const ok = await addToCart(product, quantity);
    if (ok) setOpen(false);
  }

  async function buyNow() {
    setBuying(true);
    await startBuyNowFlow(product.id, quantity, () => setOpen(false));
    setBuying(false);
  }

  async function estimateFreight() {
    setFreight({ loading: true, error: "", options: null });
    if (!(await prepareBuyNow(product.id, quantity))) return setFreight({ loading: false, error: "", options: null });
    try {
      const groups = await requestShippingQuotes(cep, "buy_now");
      const group = groups[0];
      if (!group || group.error) throw new Error(group?.error || "Não foi possível calcular o frete desta peça.");
      setFreight({ loading: false, error: "", options: group.options.slice(0, 3) });
    } catch (error) {
      setFreight({ loading: false, error: error instanceof Error ? error.message : "Não foi possível calcular o frete.", options: null });
    }
  }

  // Galeria: hoje cada peça tem uma foto; com mais de uma (images), aparecem as miniaturas.
  const gallery = Array.from(new Set([product.image_url, ...(product.images ?? [])].filter((url): url is string => Boolean(url))));
  const currentImage = gallery[Math.min(imageIndex, gallery.length - 1)] ?? null;
  const storeLocation = store ? [store.city, store.state].filter(Boolean).join(" · ") : "";
  const storeInitials = (product.shop_name || store?.store_name || "A").split(/\s+/).filter((word) => word.length > 2).slice(0, 2)
    .map((word) => word[0]?.toUpperCase()).join("") || "A";
  const availability = availabilityFor(product);
  const maxQuantity = Math.max(1, maxQuantityFor(product));
  const unavailable = availability === "sold_out" || cartDisabled;
  const adding = pendingCartIds.has(product.id);
  const ownProduct = Boolean(userId && product.shop_id === userId);
  const saved = favoriteIds.has(product.id);
  const weight = shipping ? formatWeight(shipping.weight_grams) : null;
  const originCep = shipping ? formatCep(shipping.origin_cep) : null;
  const hasDimensions = Boolean(shipping?.length_cm && shipping?.width_cm && shipping?.height_cm);
  const production = productionLabel(availability, shipping?.production_time_days);
  // Sob encomenda não mostra unidades: a peça é feita depois do pedido.
  const stockLabel = availability === "sold_out"
    ? "Esgotado no momento"
    : availability === "ready"
      ? `${product.stock} ${product.stock === 1 ? "unidade a pronta entrega" : "unidades a pronta entrega"}`
      : "Feita especialmente para você";

  return <>
    {children ? children(openDetails) : (
      <button className="store-product-details-trigger" type="button" onClick={openDetails}>
        Conheça a peça
      </button>
    )}
    {everOpened && <Dialog open={open} onClose={() => setOpen(false)} labelledBy={titleId} className="an-dialog--wide product-details-modal"
      closeLabel="Fechar detalhes da peça">
      {/* Duas colunas no desktop; no celular as colunas somem e os blocos seguem a ordem de leitura (order no CSS). */}
      <div className="pd-col pd-col--aside">
        <div className="pd-block pd-gallery">
          <div className={`product-details-image${zoomed ? " is-zoomed" : ""}`}>
            {currentImage ? (
              <button type="button" className="product-details-zoom" onClick={() => setZoomed((value) => !value)}
                aria-pressed={zoomed} aria-label={zoomed ? "Reduzir imagem" : "Ampliar imagem"}>
                <OptimizedImage src={currentImage} alt={product.name} width={720} height={900} quality={80}
                  sizes="(max-width: 760px) 100vw, 520px" priority />
              </button>
            ) : (
              <span className="product-details-noimage"><PackageOpen size={42} /><span>Foto em breve</span></span>
            )}
          </div>
          {gallery.length > 1 && (
            <ul className="pd-thumbs" aria-label="Fotos da peça">
              {gallery.map((url, index) => (
                <li key={url}>
                  <button type="button" onClick={() => { setImageIndex(index); setZoomed(false); }}
                    aria-pressed={index === imageIndex} aria-label={`Foto ${index + 1} de ${gallery.length}`}>
                    <OptimizedImage src={url} alt="" width={96} height={120} sizes="72px" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {!unavailable && (
          <section className="pd-block pd-info product-purchase-info" aria-label="Frete, pagamento e segurança">
            <div className="product-purchase-row">
              <Truck size={16} />
              <div>
                <strong>Frete e prazo</strong>
                {!userId ? (
                  <span>Entre na sua conta para calcular para o seu CEP.</span>
                ) : !/^\d{8}$/.test(cep) ? (
                  <span>Cadastre seu CEP no perfil para calcular.</span>
                ) : freight.options ? (
                  <ul className="product-freight-options">
                    {freight.options.map((option) => (
                      <li key={option.id}>
                        <span>{option.companyName} · {option.serviceName}</span>
                        <span>{option.totalMinDays === option.totalMaxDays ? option.totalMaxDays : `${option.totalMinDays}–${option.totalMaxDays}`} dias úteis</span>
                        <b>{money.format(option.price)}</b>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span>
                    {freight.error || `Entrega para o CEP ${cep.slice(0, 5)}-${cep.slice(5)}.`}{" "}
                    <button type="button" className="product-freight-calc" onClick={() => void estimateFreight()} disabled={freight.loading || ownProduct}>
                      {freight.loading ? "Calculando…" : "Calcular frete"}
                    </button>
                  </span>
                )}
              </div>
            </div>
            <div className="product-purchase-row">
              <CreditCard size={16} />
              <div><strong>Pagamento</strong><span>Pix ou cartão de crédito, pelo Mercado Pago.</span></div>
            </div>
            <div className="product-purchase-row">
              <ShieldCheck size={16} />
              <div><strong>Compra segura</strong><span>Os dados do cartão vão direto ao Mercado Pago, sem passar pela Artenós ou pela loja.</span></div>
            </div>
          </section>
        )}

        <section className="pd-block pd-shipping product-shipping-details" aria-labelledby={`${titleId}-envio`}>
          <h3 id={`${titleId}-envio`}>Medidas e envio</h3>
          {shippingLoading ? (
            <div className="product-shipping-status" role="status">
              <LoaderCircle className="spin" size={16} /> Consultando informações de envio…
            </div>
          ) : shippingError ? (
            <div className="product-shipping-notice is-error" role="alert">
              Não foi possível consultar os dados de envio agora. O frete é calculado antes do pagamento.
            </div>
          ) : shipping ? (
            <>
              <dl className="product-shipping-grid">
                {hasDimensions && (
                  <div><Ruler size={16} /><span><dt>Embalagem (C × L × A)</dt><dd>{decimal.format(Number(shipping.length_cm))} × {decimal.format(Number(shipping.width_cm))} × {decimal.format(Number(shipping.height_cm))} cm</dd></span></div>
                )}
                {weight && <div><Scale size={16} /><span><dt>Peso com embalagem</dt><dd>{weight}</dd></span></div>}
                {shipping.package_count != null && <div><Boxes size={16} /><span><dt>Volumes</dt><dd>{shipping.package_count}</dd></span></div>}
                {originCep && <div><MapPin size={16} /><span><dt>Enviado de</dt><dd>CEP {originCep}</dd></span></div>}
              </dl>
              {!shipping.shipping_data_complete && (
                <div className="product-shipping-notice">A loja ainda está completando algumas informações de envio desta peça.</div>
              )}
            </>
          ) : (
            <div className="product-shipping-notice">As informações de envio desta peça ainda não foram cadastradas.</div>
          )}
        </section>

        {product.shop_id && (
          <section className="pd-block pd-store" aria-label="Sobre a loja">
            <StoreAvatar className="pd-store-avatar" artisanId={product.shop_id} initials={storeInitials} />
            <div>
              <strong>{product.shop_name || store?.store_name || "Loja Artenós"}</strong>
              {storeLocation && <span className="pd-store-location"><MapPin size={13} /> {storeLocation}</span>}
              {storeRating.count > 0 && <StarRating avg={storeRating.avg} count={storeRating.count} size={12} />}
              <Link className="product-details-store-link" href={`/loja?id=${encodeURIComponent(product.shop_id)}`} onClick={() => setOpen(false)}>
                Conhecer a loja e outras peças <ArrowRight size={16} />
              </Link>
            </div>
          </section>
        )}
      </div>

      <div className="pd-col pd-col--main product-details-copy">
        <div className="pd-block pd-head">
          <p className="product-details-shop">
            <Store size={15} />
            {product.shop_id && product.shop_name ? (
              <Link href={`/loja?id=${encodeURIComponent(product.shop_id)}`} onClick={() => setOpen(false)}>
                {product.shop_name}
              </Link>
            ) : (
              <span>{product.shop_name || "Loja Artenós"}</span>
            )}
            {product.category_name && <span className="product-details-category">· {product.category_name}</span>}
          </p>
          <h2 id={titleId}>{product.name}</h2>
          <p className="product-details-price">{money.format(Number(product.price))}</p>
          {Number(product.rating_count) > 0 && (
            <a className="product-details-rating" href={`#${titleId}-avaliacoes`}>
              <StarRating avg={product.rating_avg} count={product.rating_count} />
            </a>
          )}
          <ul className="product-details-facts">
            <li>
              <span className={`an-badge${unavailable ? " an-badge--muted" : availability === "ready" ? "" : " an-badge--warm"}`}>
                {cartDisabled ? "Loja em pausa" : AVAILABILITY_LABEL[availability]}
              </span>
              <span>{stockLabel}</span>
            </li>
            {availability !== "sold_out" && (production || shippingLoading) && (
              <li>
                <Clock3 size={16} />
                <span>{shippingLoading && availability !== "ready" ? "Consultando prazo de produção…" : production}</span>
              </li>
            )}
          </ul>
        </div>

        <div className="pd-block pd-buy">
          <div className="an-stepper" role="group" aria-label="Quantidade">
            <button type="button" onClick={() => { setQuantity((value) => Math.max(1, value - 1)); setFreight({ loading: false, error: "", options: null }); }}
              disabled={quantity <= 1 || unavailable} aria-label="Diminuir quantidade"><Minus size={14} /></button>
            <output aria-live="polite" aria-label={`Quantidade: ${quantity}`}>{quantity}</output>
            <button type="button" onClick={() => { setQuantity((value) => Math.min(maxQuantity, value + 1)); setFreight({ loading: false, error: "", options: null }); }}
              disabled={quantity >= maxQuantity || unavailable} aria-label="Aumentar quantidade"><Plus size={14} /></button>
          </div>
          {/* Uma ação de compra por tela: "Comprar agora" principal; carrinho e favorito como ícones. */}
          <div className="product-details-actions">
            <button type="button" className="an-btn an-btn--lg product-details-buy-now" onClick={() => void buyNow()}
              disabled={unavailable || buying || ownProduct} aria-busy={buying}>
              {buying ? <LoaderCircle size={18} className="spin" /> : <ArrowRight size={18} />}
              {unavailable ? (availability === "sold_out" ? "Esgotado" : "Indisponível")
                : buying ? "Abrindo…"
                  : `${availability === "made_to_order" ? "Encomendar" : "Comprar agora"} · ${money.format(Number(product.price) * quantity)}`}
            </button>
            <button type="button" className="an-icon-btn product-details-cart" onClick={() => void add()}
              disabled={unavailable || adding || ownProduct} aria-busy={adding} aria-label="Adicionar ao carrinho" title="Adicionar ao carrinho">
              {adding ? <LoaderCircle size={19} className="spin" /> : <ShoppingBag size={19} />}
            </button>
            <button type="button" className={`an-icon-btn product-details-fav${saved ? " is-saved" : ""}`}
              onClick={() => void toggleFavorite(product)} disabled={pendingFavoriteIds.has(product.id)}
              aria-pressed={saved} aria-label={saved ? "Remover dos favoritos" : "Salvar nos favoritos"} title="Favoritar">
              <Heart size={19} fill={saved ? "currentColor" : "none"} />
            </button>
          </div>
          {!ownProduct && (
            <ProductInquiryLink productId={product.id} productName={product.name} />
          )}
          {ownProduct && <p className="product-details-limit" role="status">Esta peça é da sua loja.</p>}
          {availability === "ready" && quantity >= maxQuantity && (
            <p className="product-details-limit" role="status">Você selecionou todas as unidades disponíveis.</p>
          )}
        </div>

        <section className="pd-block pd-about product-details-section" aria-labelledby={`${titleId}-sobre`}>
          <h3 id={`${titleId}-sobre`}>Sobre a peça</h3>
          {product.description?.trim() ? (
            <RichText className="product-details-description" text={product.description} />
          ) : (
            <p className="product-details-description">
              A loja ainda não publicou a descrição desta peça. Você pode perguntar pelos detalhes pelo botão de mensagem.
            </p>
          )}
        </section>

        <section className="pd-block pd-reviews product-details-section" id={`${titleId}-avaliacoes`} aria-labelledby={`${titleId}-avaliacoes-titulo`}>
          <h3 id={`${titleId}-avaliacoes-titulo`}>Avaliações</h3>
          <ReviewsList kind="product" id={product.id} storeName={product.shop_name} />
        </section>
      </div>
    </Dialog>}
  </>;
}
