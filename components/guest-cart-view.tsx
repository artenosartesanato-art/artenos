"use client";

import Link from "next/link";
import { AlertTriangle, ArrowRight, LockKeyhole, Minus, PackageOpen, Plus, Sparkles, Store, Trash2 } from "@/components/icons";
import { useMarketplace } from "@/components/marketplace-state";
import { OptimizedImage } from "@/components/optimized-image";
import { accessHref } from "@/lib/navigation";
import { guestCartTotals } from "@/lib/guest-cart";
import { availabilityFor, maxQuantityFor } from "@/lib/availability";

const brl = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Carrinho de quem não entrou: só nesta aba. Frete e pagamento pedem login;
 * ao entrar, os itens vão para a conta automaticamente.
 */
export function GuestCartView() {
  const { guestCart, setGuestQuantity } = useMarketplace();
  const totals = guestCartTotals(guestCart);

  if (guestCart.length === 0) {
    return (
      <section className="an-state">
        <PackageOpen size={36} />
        <h2>Seu carrinho está vazio</h2>
        <p>Adicione peças sem precisar entrar. Para calcular o frete e pagar, é só entrar na sua conta.</p>
        <div className="an-state-actions">
          <Link className="an-btn" href="/categorias">Explorar peças <ArrowRight size={16} /></Link>
          <Link className="an-btn an-btn--secondary" href={accessHref("/carrinho")}>Entrar</Link>
        </div>
      </section>
    );
  }

  const groups = new Map<string, typeof guestCart[number][]>();
  for (const line of guestCart) {
    const key = line.product.shop_name || "Loja Artenós";
    groups.set(key, [...(groups.get(key) ?? []), line]);
  }

  return (
    <div className="cart-layout">
      <div className="cart-groups">
        <div className="an-alert an-alert--info cart-guest-alert" role="note">
          <AlertTriangle size={18} />
          <span>
            <strong>Você está sem login.</strong> Este carrinho fica só nesta aba e some se a página for recarregada.
            Ao entrar, os itens vão para a sua conta.
          </span>
        </div>
        {[...groups.entries()].map(([storeName, lines], index) => (
          <section className="cart-store" key={storeName} aria-labelledby={`loja-visitante-${index}`}>
            <header className="cart-store-header">
              <Store size={18} />
              <h2 id={`loja-visitante-${index}`}>{storeName}</h2>
              <span>{lines.length} {lines.length === 1 ? "peça" : "peças"}</span>
            </header>
            <ul className="cart-items">
              {lines.map(({ product, quantity }) => {
                const cents = Math.round(Number(product.price) * 100);
                const atLimit = quantity >= maxQuantityFor(product);
                const madeToOrder = availabilityFor(product) === "made_to_order";
                return (
                  <li className="cart-item" key={product.id}>
                    <div className="cart-item-thumb">
                      {product.image_url
                        ? <OptimizedImage src={product.image_url} alt="" width={96} height={96} sizes="96px" />
                        : <Sparkles size={22} />}
                    </div>
                    <div className="cart-item-copy">
                      <h3>{product.name}</h3>
                      <p>{brl(cents)} cada</p>
                      {madeToOrder ? (
                        <p className="cart-item-stock">Sob encomenda — produzida depois do pedido</p>
                      ) : product.stock != null && product.stock <= 3 && (
                        <p className="cart-item-stock">{product.stock === 1 ? "Última unidade" : `${product.stock} unidades em estoque`}</p>
                      )}
                    </div>
                    <div className="cart-item-controls">
                      <div className="an-stepper an-stepper--sm" role="group" aria-label={`Quantidade de ${product.name}`}>
                        <button type="button" onClick={() => setGuestQuantity(product.id, quantity - 1)}
                          aria-label={quantity === 1 ? `Remover ${product.name}` : "Diminuir quantidade"}>
                          {quantity === 1 ? <Trash2 size={13} /> : <Minus size={13} />}
                        </button>
                        <output aria-live="polite">{quantity}</output>
                        <button type="button" aria-label="Aumentar quantidade" disabled={atLimit}
                          onClick={() => setGuestQuantity(product.id, quantity + 1)}>
                          <Plus size={13} />
                        </button>
                      </div>
                      <strong>{brl(cents * quantity)}</strong>
                      <button className="cart-remove" type="button" onClick={() => setGuestQuantity(product.id, 0)}>
                        Remover
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      <aside className="cart-summary" aria-labelledby="resumo-visitante">
        <h2 id="resumo-visitante">Resumo</h2>
        <dl>
          <div><dt>Produtos ({totals.count})</dt><dd>{brl(totals.subtotalCents)}</dd></div>
          <div><dt>Frete</dt><dd>Após entrar</dd></div>
          <div className="cart-summary-total"><dt>Subtotal</dt><dd>{brl(totals.subtotalCents)}</dd></div>
        </dl>
        <Link className="an-btn an-btn--lg an-btn--block cart-checkout" href={accessHref("/carrinho")}>
          <LockKeyhole size={17} /> Entrar para calcular o frete e pagar
        </Link>
        <ul className="cart-summary-notes">
          <li>Ao entrar ou criar a conta nesta aba, o carrinho vai junto.</li>
          <li>O frete é calculado com o CEP do seu cadastro.</li>
        </ul>
      </aside>
    </div>
  );
}
