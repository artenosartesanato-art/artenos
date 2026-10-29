"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { TrendingUp } from "@/components/icons";
import { OptimizedImage } from "@/components/optimized-image";
import { ProductDetailsButton } from "@/components/product-details-button";
import type { BestSeller } from "@/lib/best-seller";

const INTERVAL_MS = 5000;
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Carrossel do topo: a mais vendida de cada categoria, trocando sozinho a cada
 * 5 s. Pausa com o mouse em cima, com o foco dentro, com a aba escondida e para
 * quem pediu menos movimento no sistema (aí só troca pelos pontos).
 */
export function HeroCarousel({ products }: { products: BestSeller[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const count = products.length;

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  const go = useCallback((next: number) => setIndex(((next % count) + count) % count), [count]);

  useEffect(() => {
    if (count < 2 || paused || reduced) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") setIndex((value) => (value + 1) % count);
    }, INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [count, paused, reduced]);

  if (!count) return null;
  const current = Math.min(index, count - 1);
  return (
    <div ref={rootRef} className="hero-carousel" role="region" aria-roledescription="carrossel"
      aria-label="Mais vendidas de cada categoria"
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
                  aria-label={`Mais vendida em ${product.category_name ?? "sua categoria"}: ${product.name}, ${money.format(Number(product.price))}. Ver detalhes`}>
                  <OptimizedImage src={product.image_url!} alt="" width={900} height={760} priority={position === 0}
                    sizes="(max-width: 900px) 100vw, 900px" />
                  <span className="hero-slide-tag"><TrendingUp size={13} /> Mais vendida{product.category_name ? ` em ${product.category_name}` : ""}</span>
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
      {count > 1 && (
        <div className="hero-dots">
          {products.map((product, position) => (
            <button key={product.id} type="button" aria-label={`Mostrar ${product.name}`}
              aria-current={position === current ? "true" : undefined} onClick={() => go(position)} />
          ))}
        </div>
      )}
    </div>
  );
}
