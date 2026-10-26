"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const targets = [
  ".store-section-heading", ".store-product", ".store-categories > button",
  ".store-discovery > a", ".store-collection", ".store-shops > a",
  ".shops-grid > a", ".seller-action-card", ".seller-section-heading",
  ".store-footer-grid > div",
].join(",");

export function ScrollReveal() {
  const pathname = usePathname();

  useEffect(() => {
    if (!("IntersectionObserver" in window)) return;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const registered = new WeakSet<Element>();
    const animations = new Set<Animation>();
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        observer.unobserve(entry.target);
        if (preference.matches || !entry.target.animate) continue;
        const animation = entry.target.animate(
          [
            { opacity: 0.35, transform: "translateY(18px)" },
            { opacity: 1, transform: "translateY(0)" },
          ],
          { duration: 520, easing: "cubic-bezier(.22, 1, .36, 1)" },
        );
        animations.add(animation);
        animation.onfinish = () => animations.delete(animation);
      }
    }, { threshold: 0.08 });

    function register(root: Element) {
      const elements = root.matches(targets)
        ? [root, ...root.querySelectorAll(targets)]
        : root.querySelectorAll(targets);
      for (const element of elements) {
        if (registered.has(element)) continue;
        registered.add(element);
        observer.observe(element);
      }
    }

    register(document.body);
    const mutations = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node instanceof Element) register(node);
        }
      }
    });
    mutations.observe(document.body, { childList: true, subtree: true });
    function stopMotion() {
      if (preference.matches) {
        animations.forEach((animation) => animation.cancel());
        animations.clear();
      }
    }
    preference.addEventListener("change", stopMotion);
    return () => {
      observer.disconnect();
      mutations.disconnect();
      preference.removeEventListener("change", stopMotion);
      animations.forEach((animation) => animation.cancel());
    };
  }, [pathname]);

  return null;
}
