"use client";

import { Heart, LoaderCircle, ShoppingBag, Sparkles } from "@/components/icons";
import { ProductDetailsButton } from "@/components/product-details-button";
import { useMarketplace } from "@/components/marketplace-state";
import { useStorefrontActions } from "@/components/storefront-actions";
import { ProductInquiryLink } from "@/components/product-inquiry-link";
import { OptimizedImage } from "@/components/optimized-image";
import { AVAILABILITY_LABEL, availabilityFor, type Availability } from "@/lib/availability";
import { plainSummary } from "@/lib/rich-text";
import { StarRating } from "@/components/stars";
import { useMyCustomOrderLabel } from "@/components/my-custom-orders";
import { useBuyNow } from "@/components/use-buy-now";

export type MarketplaceProduct = {
  id: string;
  name: string;
  description?: string | null;
  price: number;
  image_url?: string | null;
  stock?: number | null;
  ready_to_ship?: boolean;
  /** Calculado no banco pelo estoque (lib/availability.ts). */
  availability?: Availability | null;
  rating_avg?: number | string | null;
  rating_count?: number | null;
  category_name?: string | null;
  shop_name?: string | null;
  /** Presente quando a função do banco devolve a loja (migração opcional). */
  shop_id?: string | null;
};

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function availabilityOf(product: Pick<MarketplaceProduct, "stock" | "ready_to_ship" | "availability">, paused = false) {
  if (paused) return { label: "Loja em pausa", tone: "muted" as const, unavailable: true };
  const availability = availabilityFor(product);
  const tone = availability === "ready" ? "moss" as const : availability === "made_to_order" ? "warm" as const : "muted" as const;
  return { label: AVAILABILITY_LABEL[availability], tone, unavailable: availability === "sold_out" };
}

export function MarketplaceProductCard({ product, shopName, cartDisabled = false, priority = false }: {
  product: MarketplaceProduct;
  shopName?: string | null;
  /** Ex.: loja em pausa. */
  cartDisabled?: boolean;
  priority?: boolean;
  /** Mantidos por compatibilidade; o estado vem dos provedores. */
  saved?: boolean;
  favoritePending?: boolean;
  cartPending?: boolean;
  onFavorite?: () => void;
  onCart?: () => Promise<void>;
}) {
  const { favoriteIds, pendingFavoriteIds, userId } = useMarketplace();
  const { addToCart, toggleFavorite, pendingCartIds } = useStorefrontActions();
  const displayShop = shopName ?? product.shop_name;
  const fullProduct = { ...product, shop_name: displayShop };
  const saved = favoriteIds.has(product.id);
  const favoritePending = pendingFavoriteIds.has(product.id);
  const adding = pendingCartIds.has(product.id);
  const availability = availabilityOf(product, cartDisabled);
  const unavailable = availability.unavailable;
  const summary = plainSummary(product.description, 120);
  // Quem já encomendou a peça vê o andamento no lugar do selo "Sob encomenda".
  const myOrderLabel = useMyCustomOrderLabel(product.id, userId);
  // Só se pergunta sobre peças de outras lojas.
  const ownProduct = Boolean(userId && product.shop_id && product.shop_id === userId);
  const { buyNow, pendingId } = useBuyNow();
  const buying = pendingId === product.id;
  const kind = availabilityFor(product);
  const buyLabel = cartDisabled ? "Indisponível" : kind === "sold_out" ? "Esgotado" : kind === "made_to_order" ? "Encomendar" : "Comprar";

  return (
    <ProductDetailsButton product={fullProduct} cartDisabled={cartDisabled}>
      {(openDetails) => (
        <article className="store-product">
          <div className="store-product-image">
            <button type="button" className="store-product-image-trigger" onClick={openDetails}
              aria-label={`Ver detalhes de ${product.name}`}>
              {product.image_url ? (
                <OptimizedImage src={product.image_url} alt="" priority={priority} width={480} height={600}
                  sizes="(max-width: 600px) 50vw, (max-width: 1024px) 33vw, 340px" />
              ) : (
                <span className="store-no-image">
                  <Sparkles size={26} />
                  <span>Foto em breve</span>
                </span>
              )}
            </button>
            {myOrderLabel ? (
              <span className="an-badge store-product-badge store-product-badge--order">{myOrderLabel}</span>
            ) : (
              <span className={`an-badge store-product-badge${availability.tone === "warm" ? " an-badge--warm" : availability.tone === "muted" ? " an-badge--muted" : ""}`}>
                {availability.label}
              </span>
            )}
            <button type="button" className={saved ? "store-heart is-saved" : "store-heart"}
              disabled={favoritePending} onClick={() => void toggleFavorite(fullProduct)}
              aria-pressed={saved}
              aria-label={saved ? `Remover ${product.name} dos favoritos` : `Salvar ${product.name} nos favoritos`}>
              <Heart size={18} fill={saved ? "currentColor" : "none"} />
            </button>
          </div>
          <div className="store-product-body">
            {displayShop && <p className="store-product-shop">{displayShop}</p>}
            <h3>
              <button type="button" className="store-product-title" onClick={openDetails}>
                {product.name}
              </button>
            </h3>
            {/* Linhas reservadas: preço e botões ficam na mesma altura em todos os cards. */}
            <div className="store-product-rating-row">
              {Number(product.rating_count) > 0 && (
                <StarRating className="store-product-rating" avg={product.rating_avg} count={product.rating_count} size={12} />
              )}
            </div>
            <p className="store-product-summary">{summary}</p>
            <p className="store-product-price">{money.format(Number(product.price))}</p>
            <div className="store-product-actions">
              <button type="button" className="store-product-buy" disabled={unavailable || buying || ownProduct}
                aria-busy={buying} onClick={() => void buyNow(product.id, 1)}
                aria-label={unavailable ? `${product.name}: ${buyLabel.toLowerCase()}` : `${buyLabel} ${product.name}`}>
                {buying && <LoaderCircle size={16} className="spin" />}
                <span>{buying ? "Abrindo…" : buyLabel}</span>
              </button>
              <button type="button" className="store-product-cart" disabled={unavailable || adding || ownProduct}
                aria-busy={adding} onClick={() => void addToCart(fullProduct)}
                aria-label={`Adicionar ${product.name} ao carrinho`} title="Adicionar ao carrinho">
                {adding ? <LoaderCircle size={17} className="spin" /> : <ShoppingBag size={18} />}
              </button>
              {!ownProduct && <ProductInquiryLink productId={product.id} productName={product.name} compact />}
            </div>
          </div>
        </article>
      )}
    </ProductDetailsButton>
  );
}

/** Estrutura de carregamento com as mesmas proporções do card real. */
export function ProductCardSkeleton() {
  return (
    <div className="store-product is-skeleton" aria-hidden="true">
      <div className="store-product-image an-skeleton" />
      <div className="store-product-body">
        <span className="an-skeleton" style={{ height: 10, width: "45%" }} />
        <span className="an-skeleton" style={{ height: 14, width: "90%", marginTop: 10 }} />
        <span className="an-skeleton" style={{ height: 14, width: "60%", marginTop: 6 }} />
        <span className="an-skeleton" style={{ height: 20, width: "40%", marginTop: 14 }} />
        <span className="an-skeleton" style={{ height: 40, width: "100%", marginTop: 14, borderRadius: 12 }} />
      </div>
    </div>
  );
}

export function ProductGridSkeleton({ count = 8, className = "store-products" }: { count?: number; className?: string }) {
  return (
    <div className={className} role="status" aria-label="Carregando peças">
      {Array.from({ length: count }, (_, index) => <ProductCardSkeleton key={index} />)}
    </div>
  );
}
