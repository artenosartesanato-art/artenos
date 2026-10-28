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
  ShoppingBag,
  Store,
  Truck,
} from "@/components/icons";
import Link from "next/link";
import { useEffect, useId, useState, type ReactNode } from "react";
import { getSupabase } from "@/lib/supabase";
import { Dialog } from "@/components/ui/dialog";
import { useMarketplace } from "@/components/marketplace-state";
import { useStorefrontActions } from "@/components/storefront-actions";

type ProductDetails = {
  id: string;
  name: string;
  description?: string | null;
  price: number;
  image_url?: string | null;
  stock?: number | null;
  ready_to_ship?: boolean;
  category_name?: string | null;
  shop_name?: string | null;
  shop_id?: string | null;
};

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
const MAX_QUANTITY = 99;

function formatCep(value: string | null) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length === 8 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : null;
}

function formatWeight(value: number | null) {
  const grams = Number(value);
  if (!Number.isFinite(grams) || grams <= 0) return null;
  return grams >= 1000 ? `${decimal.format(grams / 1000)} kg` : `${decimal.format(grams)} g`;
}

function productionLabel(days: number | null | undefined, readyToShip?: boolean) {
  if (days == null) return readyToShip ? "Pronta para postagem" : null;
  if (days === 0) return "Pronta para postagem";
  return `Produzida em até ${days} ${days === 1 ? "dia útil" : "dias"} antes da postagem`;
}

export function ProductDetailsButton({ product, children, cartDisabled = false }: {
  product: ProductDetails;
  children?: (openDetails: () => void) => ReactNode;
  cartDisabled?: boolean;
}) {
  const titleId = useId();
  const { favoriteIds, pendingFavoriteIds } = useMarketplace();
  const { addToCart, toggleFavorite, pendingCartIds } = useStorefrontActions();
  const [open, setOpen] = useState(false);
  // O diálogo só entra na árvore depois da primeira abertura: uma grade com
  // dezenas de cards não precisa de dezenas de diálogos ociosos.
  const [everOpened, setEverOpened] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [zoomed, setZoomed] = useState(false);
  const [shipping, setShipping] = useState<ShippingDetails | null>(null);
  const [shippingLoading, setShippingLoading] = useState(false);
  const [shippingError, setShippingError] = useState(false);

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
    setZoomed(false);
    setEverOpened(true);
    setOpen(true);
  }

  async function add() {
    const ok = await addToCart(product, quantity);
    if (ok) setOpen(false);
  }

  const maxQuantity = Math.max(1, Math.min(MAX_QUANTITY, product.stock ?? MAX_QUANTITY));
  const unavailable = product.stock === 0 || cartDisabled;
  const adding = pendingCartIds.has(product.id);
  const saved = favoriteIds.has(product.id);
  const weight = shipping ? formatWeight(shipping.weight_grams) : null;
  const originCep = shipping ? formatCep(shipping.origin_cep) : null;
  const hasDimensions = Boolean(shipping?.length_cm && shipping?.width_cm && shipping?.height_cm);
  const production = productionLabel(shipping?.production_time_days, product.ready_to_ship);
  const stockLabel = product.stock === 0
    ? "Esgotado no momento"
    : product.stock != null
      ? `${product.stock} ${product.stock === 1 ? "unidade disponível" : "unidades disponíveis"}`
      : product.ready_to_ship ? "Disponível" : "Produzido a cada pedido";

  return <>
    {children ? children(openDetails) : (
      <button className="store-product-details-trigger" type="button" onClick={openDetails}>
        Conheça a peça
      </button>
    )}
    {everOpened && <Dialog open={open} onClose={() => setOpen(false)} labelledBy={titleId} className="an-dialog--wide product-details-modal"
      closeLabel="Fechar detalhes da peça">
      <div className={`product-details-image${zoomed ? " is-zoomed" : ""}`}>
        {product.image_url ? (
          <button type="button" className="product-details-zoom" onClick={() => setZoomed((value) => !value)}
            aria-pressed={zoomed} aria-label={zoomed ? "Reduzir imagem" : "Ampliar imagem"}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={product.image_url} alt={product.name} width={720} height={900} />
          </button>
        ) : (
          <span className="product-details-noimage"><PackageOpen size={42} /><span>Foto em breve</span></span>
        )}
      </div>
      <div className="product-details-copy">
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

        <ul className="product-details-facts">
          <li>
            <span className={`an-badge${unavailable ? " an-badge--muted" : product.ready_to_ship ? "" : " an-badge--warm"}`}>
              {cartDisabled ? "Loja em pausa" : product.stock === 0 ? "Esgotado" : product.ready_to_ship ? "Pronta entrega" : "Feito sob encomenda"}
            </span>
            <span>{stockLabel}</span>
          </li>
          {(production || shippingLoading) && (
            <li>
              <Clock3 size={16} />
              <span>{shippingLoading ? "Consultando prazo de produção…" : production}</span>
            </li>
          )}
        </ul>

        <div className="product-details-buy">
          <div className="an-stepper" role="group" aria-label="Quantidade">
            <button type="button" onClick={() => setQuantity((value) => Math.max(1, value - 1))}
              disabled={quantity <= 1 || unavailable} aria-label="Diminuir quantidade"><Minus size={14} /></button>
            <output aria-live="polite" aria-label={`Quantidade: ${quantity}`}>{quantity}</output>
            <button type="button" onClick={() => setQuantity((value) => Math.min(maxQuantity, value + 1))}
              disabled={quantity >= maxQuantity || unavailable} aria-label="Aumentar quantidade"><Plus size={14} /></button>
          </div>
          <button type="button" className="an-btn an-btn--lg product-details-add" onClick={() => void add()}
            disabled={unavailable || adding} aria-busy={adding}>
            {adding ? <LoaderCircle size={18} className="spin" /> : <ShoppingBag size={18} />}
            {unavailable ? "Indisponível" : adding ? "Adicionando…" : `Adicionar · ${money.format(Number(product.price) * quantity)}`}
          </button>
          <button type="button" className={`an-icon-btn product-details-fav${saved ? " is-saved" : ""}`}
            onClick={() => void toggleFavorite(product)} disabled={pendingFavoriteIds.has(product.id)}
            aria-pressed={saved} aria-label={saved ? "Remover dos favoritos" : "Salvar nos favoritos"}>
            <Heart size={19} fill={saved ? "currentColor" : "none"} />
          </button>
        </div>
        {product.stock != null && product.stock > 0 && quantity >= maxQuantity && (
          <p className="product-details-limit" role="status">Você selecionou todas as unidades disponíveis.</p>
        )}

        <section className="product-details-section" aria-labelledby={`${titleId}-sobre`}>
          <h3 id={`${titleId}-sobre`}>Sobre a peça</h3>
          <p className="product-details-description">
            {product.description?.trim() || "A loja ainda não publicou a descrição desta peça. Você pode perguntar pelos detalhes depois da compra, pelas mensagens do pedido."}
          </p>
        </section>

        <section className="product-shipping-details" aria-labelledby={`${titleId}-envio`}>
          <h3 id={`${titleId}-envio`}>Medidas e envio</h3>
          {shippingLoading ? (
            <div className="product-shipping-status" role="status">
              <LoaderCircle className="spin" size={16} /> Consultando informações de envio…
            </div>
          ) : shippingError ? (
            <div className="product-shipping-notice is-error" role="alert">
              Não foi possível consultar os dados de envio agora. O frete continua sendo calculado no carrinho.
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
          <p className="product-details-freight"><Truck size={16} /> Frete e prazo de entrega são calculados no carrinho para o seu CEP.</p>
        </section>

        {product.shop_id && (
          <Link className="product-details-store-link" href={`/loja?id=${encodeURIComponent(product.shop_id)}`} onClick={() => setOpen(false)}>
            Conhecer a loja e outras peças <ArrowRight size={16} />
          </Link>
        )}
      </div>
    </Dialog>}
  </>;
}
