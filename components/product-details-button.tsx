"use client";

import {
  Boxes,
  Clock3,
  LoaderCircle,
  MapPin,
  PackageOpen,
  Ruler,
  Scale,
  ShoppingBag,
  X,
} from "@/components/icons";
import { useEffect, useState, type ReactNode } from "react";
import { getSupabase } from "@/lib/supabase";

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

function formatCep(value: string | null) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length === 8 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : null;
}

function formatWeight(value: number | null) {
  const grams = Number(value);
  if (!Number.isFinite(grams) || grams <= 0) return null;
  return grams >= 1000
    ? `${decimal.format(grams / 1000)} kg`
    : `${decimal.format(grams)} g`;
}

export function ProductDetailsButton({ product, children }: {
  product: ProductDetails;
  children?: (openDetails: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [shipping, setShipping] = useState<ShippingDetails | null>(null);
  const [shippingLoading, setShippingLoading] = useState(false);
  const [shippingError, setShippingError] = useState(false);

  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", close);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", close);
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let active = true;

    async function loadShippingDetails() {
      try {
        const { data, error } = await getSupabase().rpc(
          "get_product_shipping_quote_data",
          { p_product_id: product.id },
        );
        if (error) throw error;
        if (!active) return;
        const details = (Array.isArray(data) ? data[0] : data) as
          | ShippingDetails
          | undefined;
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
    return () => {
      active = false;
    };
  }, [open, product.id]);

  function openDetails() {
    setShipping(null);
    setShippingError(false);
    setShippingLoading(true);
    setOpen(true);
  }

  const weight = shipping ? formatWeight(shipping.weight_grams) : null;
  const originCep = shipping ? formatCep(shipping.origin_cep) : null;
  const hasDimensions = Boolean(
    shipping?.length_cm && shipping?.width_cm && shipping?.height_cm,
  );

  return <>
    {children ? children(openDetails) : (
      <button className="store-product-details-trigger" type="button" onClick={openDetails}>
        {product.stock === 0 ? "Ver detalhes" : product.ready_to_ship ? "Pronta para envio" : "Conheça a peça"}
      </button>
    )}
    {open && <div className="product-details-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setOpen(false)}>
      <section className="product-details-modal" role="dialog" aria-modal="true" aria-label={`Detalhes de ${product.name}`}>
        <button className="product-details-close" type="button" onClick={() => setOpen(false)} aria-label="Fechar detalhes"><X size={20} /></button>
        <div className="product-details-image">{product.image_url ? <img src={product.image_url} alt={product.name} /> : <PackageOpen size={42} />}</div>
        <div className="product-details-copy">
          <small>{product.shop_name || product.category_name || "Artenós"}</small>
          <h2>{product.name}</h2>
          <strong>{money.format(Number(product.price))}</strong>
          <p>{product.description?.trim() || "A descrição desta peça ainda não foi informada pela loja."}</p>
          <span><ShoppingBag size={15} /> {product.stock === 0 ? "Produto indisponível" : product.stock != null ? `${product.stock} unidade(s) disponível(is)` : "Consulte a disponibilidade"}</span>
          <div className="product-shipping-details">
            <h3>Informações para envio</h3>
            {shippingLoading ? (
              <div className="product-shipping-status">
                <LoaderCircle className="product-shipping-spinner" size={18} />
                Consultando informações...
              </div>
            ) : shippingError ? (
              <div className="product-shipping-notice is-error">
                Não foi possível consultar os dados de envio agora.
              </div>
            ) : shipping ? (
              <>
                <div className="product-shipping-grid">
                  {weight && (
                    <div><Scale size={17} /><span><small>Peso total</small><b>{weight}</b></span></div>
                  )}
                  {hasDimensions && (
                    <div><Ruler size={17} /><span><small>Dimensões (C × L × A)</small><b>{decimal.format(Number(shipping.length_cm))} × {decimal.format(Number(shipping.width_cm))} × {decimal.format(Number(shipping.height_cm))} cm</b></span></div>
                  )}
                  {shipping.package_count != null && (
                    <div><Boxes size={17} /><span><small>Volumes</small><b>{shipping.package_count}</b></span></div>
                  )}
                  {shipping.production_time_days != null && (
                    <div><Clock3 size={17} /><span><small>Produção antes da postagem</small><b>{shipping.production_time_days === 0 ? "Pronta para postagem" : `${shipping.production_time_days} dia(s)`}</b></span></div>
                  )}
                  {originCep && (
                    <div><MapPin size={17} /><span><small>CEP de origem</small><b>{originCep}</b></span></div>
                  )}
                </div>
                {!shipping.shipping_data_complete && (
                  <div className="product-shipping-notice">
                    A loja ainda está completando algumas informações de envio desta peça.
                  </div>
                )}
              </>
            ) : (
              <div className="product-shipping-notice">
                As informações de envio desta peça ainda não foram cadastradas.
              </div>
            )}
          </div>
        </div>
      </section>
    </div>}
  </>;
}
