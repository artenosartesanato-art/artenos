"use client";

import { useRef, useState } from "react";
import { Heart, LoaderCircle, ShoppingBag, Sparkles } from "@/components/icons";
import { ProductDetailsButton } from "@/components/product-details-button";
import { ProductInquiryLink } from "@/components/product-inquiry-link";

export type MarketplaceProduct = {
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

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function MarketplaceProductCard({ product, shopName, saved, favoritePending = false,
  cartPending = false, cartDisabled = false, onFavorite, onCart }: {
  product: MarketplaceProduct;
  shopName?: string | null;
  saved: boolean;
  favoritePending?: boolean;
  cartPending?: boolean;
  cartDisabled?: boolean;
  onFavorite: () => void;
  onCart: () => Promise<void>;
}) {
  const cartLock = useRef(false);
  const [adding, setAdding] = useState(false);
  const displayShop = shopName ?? product.shop_name;
  const unavailable = product.stock === 0 || cartDisabled;

  async function addToCart() {
    if (cartLock.current || unavailable || cartPending) return;
    cartLock.current = true;
    setAdding(true);
    try {
      await onCart();
    } finally {
      cartLock.current = false;
      setAdding(false);
    }
  }

  return (
    <ProductDetailsButton product={{ ...product, shop_name: displayShop }}>
      {(openDetails) => (
        <article className="store-product">
          <div className="store-product-image">
            <button type="button" className="store-product-image-trigger"
              onClick={openDetails} aria-label={`Ver detalhes de ${product.name}`}>
              {product.image_url ? (
                <img src={product.image_url} alt="" loading="lazy" />
              ) : (
                <span className="store-no-image">
                  <Sparkles size={26} />
                  <span>Imagem ainda não cadastrada</span>
                </span>
              )}
            </button>
            <button type="button" className={saved ? "store-heart is-saved" : "store-heart"}
              disabled={favoritePending} onClick={onFavorite}
              aria-label={saved ? `Remover ${product.name} dos favoritos` : `Favoritar ${product.name}`}>
              <Heart size={19} fill={saved ? "currentColor" : "none"} />
            </button>
          </div>
          <div className="store-product-body">
            <h3><button type="button" className="store-product-title" onClick={openDetails}>
              {product.name}
            </button></h3>
            <p className="store-product-price">{money.format(Number(product.price))}</p>
            {displayShop && <p className="store-product-shop">{displayShop}</p>}
            <span className="store-product-availability">
              {product.stock === 0 ? "Indisponível" : product.ready_to_ship ? "Pronta entrega" : "Sob encomenda"}
            </span>
            <div className="store-product-bottom">
              <button className="store-product-details-trigger" type="button" onClick={openDetails}>
                Conheça a peça
              </button>
              <span className="store-product-actions">
                <ProductInquiryLink productId={product.id} productName={product.name} compact />
                <button type="button" className="store-product-add" disabled={unavailable || cartPending || adding}
                  onClick={() => { void addToCart(); }} aria-label={`Adicionar ${product.name} ao carrinho`}>
                  {cartPending || adding ? <LoaderCircle size={18} className="spin" /> : <ShoppingBag size={18} />}
                </button>
              </span>
            </div>
          </div>
        </article>
      )}
    </ProductDetailsButton>
  );
}
