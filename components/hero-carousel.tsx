"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles, TrendingUp } from "@/components/icons";
import { OptimizedImage } from "@/components/optimized-image";
import { ProductDetailsButton } from "@/components/product-details-button";
import type { BestSeller } from "@/lib/best-seller";

const INTERVAL_MS = 5000;
function tagFor(product: BestSeller, mode: "best" | "featured") {
  if (mode === "featured") return product.category_name ? `Em destaque em ${product.category_name}` : "Em destaque";
  return product.category_name ? `Mais vendida em ${product.category_name}` : "Mais vendida";
}

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Carrossel do topo: uma peça por vez, trocando sozinho a cada 5 s, sem botões
 * para passar. Mostra a mais vendida de cada categoria; sem vendas ainda, as
 * peças em destaque. Pausa com o mouse em cima, com o foco dentro e com a aba
 * escondida; para quem pediu menos movimento, troca sem animação.
 */
export function HeroCarousel({ products, mode = "best" }: { products: BestSeller[]; mode?: "best" | "featured" }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const count = products.length;

  useEffect(() => {
    if (count < 2 || paused) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") setIndex((value) => (value + 1) % count);
    }, INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [count, paused]);

  if (!count) return null;
  const current = Math.min(index, count - 1);
  return (
    <div ref={rootRef} className="hero-carousel" role="region" aria-roledescription="carrossel"
      aria-label={mode === "best" ? "Mais vendidas de cada categoria" : "Peças em destaque"}
      onPointerEnter={() => setPaused(true)} onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(event) => { if (!rootRef.current?.contains(event.relatedTarget as Node)) setPaused(false); }}>
      {products.map((product, position) => {
        const active = position === current;
        return (
          <div key={product.id} className={`hero-slide${active ? " is-active" : ""}`} role="group" aria-roledescription="slide"
            aria-label={`${position + 1} de ${count}`} aria-hidden={!active} inert={!active}>
            <ProductDetailsButton product={product}>
              {(openDetails) => (
                <button type="button" className="hero-slide-button" onClick={openDetails}
                  aria-label={`${tagFor(product, mode)}: ${product.name}, ${money.format(Number(product.price))}. Ver detalhes`}>
                  <OptimizedImage src={product.image_url!} alt="" width={900} height={760} priority={position === 0}
                    sizes="(max-width: 900px) 100vw, 900px" />
                  <span className="hero-slide-tag">{mode === "best" ? <TrendingUp size={13} /> : <Sparkles size={13} />} {tagFor(product, mode)}</span>
                  <span className="hero-slide-caption">
                    <strong>{product.name}</strong>
                    <span>{money.format(Number(product.price))}{product.shop_name ? ` · ${product.shop_name}` : ""}</span>
                  </span>
                </button>
              )}
            </ProductDetailsButton>
          </div>
        );
      })}
    </div>
  );
}
