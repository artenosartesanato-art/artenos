"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const targets = [
  ".store-section-heading", ".store-product:not(.is-skeleton)", ".store-categories > a",
  ".store-discovery > a", ".store-collection", ".store-shops > a", ".shops-grid > a",
  ".seller-action-card", ".seller-section-heading", ".seller-metric", ".store-story-band",
].join(",");

const STAGGER_MS = 55;
const MAX_DELAY_MS = 275;

/**
 * Entrada progressiva por rolagem. O conteúdo é visível por padrão: a classe
 * que esconde só é aplicada a elementos ainda fora da tela, quando há
 * IntersectionObserver e o movimento não foi reduzido. Cada elemento anima
 * uma única vez; nada é escondido se o JavaScript falhar.
 */
export function ScrollReveal() {
  const pathname = usePathname();

  useEffect(() => {
    if (!("IntersectionObserver" in window)) return;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (preference.matches) return;
    const registered = new WeakSet<Element>();
    let batch = 0;
    let batchTimer = 0;

    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const element = entry.target as HTMLElement;
        observer.unobserve(element);
        element.style.setProperty("--an-reveal-delay", `${Math.min(batch * STAGGER_MS, MAX_DELAY_MS)}ms`);
        batch++;
        element.classList.add("is-revealed");
        element.addEventListener("transitionend", () => {
          element.classList.remove("an-reveal", "is-revealed");
          element.style.removeProperty("--an-reveal-delay");
        }, { once: true });
      }
      window.clearTimeout(batchTimer);
      batchTimer = window.setTimeout(() => { batch = 0; }, 120);
    }, { threshold: 0.06, rootMargin: "0px 0px -6% 0px" });

    // Primeiro todas as leituras de posição, depois todas as escritas de
    // classe: intercalar as duas forçava um layout por elemento.
    function register(roots: Element[]) {
      const fresh: Element[] = [];
      for (const root of roots) {
        const elements = root.matches(targets) ? [root, ...root.querySelectorAll(targets)] : root.querySelectorAll(targets);
        for (const element of elements) {
          if (registered.has(element)) continue;
          registered.add(element);
          fresh.push(element);
        }
      }
      if (!fresh.length) return;
      const fold = window.innerHeight * 0.92;
      // O que já está visível nunca é escondido.
      const below = fresh.filter((element) => element.getBoundingClientRect().top >= fold);
      for (const element of below) {
        element.classList.add("an-reveal");
        observer.observe(element);
      }
    }

    register([document.body]);
    let pending: Element[] = [];
    let frame = 0;
    const mutations = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node instanceof Element) pending.push(node);
        }
      }
      if (!frame && pending.length) {
        frame = requestAnimationFrame(() => {
          frame = 0;
          const roots = pending.filter((node) => node.isConnected);
          pending = [];
          register(roots);
        });
      }
    });
    mutations.observe(document.body, { childList: true, subtree: true });

    function stopMotion() {
      if (!preference.matches) return;
      document.querySelectorAll(".an-reveal").forEach((element) => element.classList.remove("an-reveal", "is-revealed"));
      observer.disconnect();
    }
    preference.addEventListener("change", stopMotion);
    return () => {
      observer.disconnect();
      mutations.disconnect();
      cancelAnimationFrame(frame);
      window.clearTimeout(batchTimer);
      preference.removeEventListener("change", stopMotion);
      document.querySelectorAll(".an-reveal").forEach((element) => element.classList.remove("an-reveal", "is-revealed"));
    };
  }, [pathname]);

  return null;
}
