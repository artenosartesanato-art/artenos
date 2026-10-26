"use client";

import Link from "next/link";
import { toast } from "sonner";
import { ArrowRight, CheckCircle2, X } from "@/components/icons";

let activeConfirmation: string | number | undefined;

function confirmation(message: string, href: string, destination: string) {
  if (activeConfirmation !== undefined) toast.dismiss(activeConfirmation);
  activeConfirmation = toast.custom((id) => (
    <div className="marketplace-confirmation" role="status" aria-live="polite">
      <CheckCircle2 size={18} className="marketplace-confirmation-icon" />
      <span>{message}</span>
      <Link href={href} aria-label={destination} title={destination}
        onClick={() => { toast.dismiss(id); activeConfirmation = undefined; }}>
        <ArrowRight size={20} />
      </Link>
      <button type="button" aria-label="Fechar aviso"
        onClick={() => { toast.dismiss(id); activeConfirmation = undefined; }}>
        <X size={17} />
      </button>
    </div>
  ), { duration: Infinity });
}

export function confirmAddedToCart(productName: string) {
  confirmation(`${productName} foi adicionado ao carrinho.`, "/carrinho", "Ver carrinho");
}

export function confirmFavoriteSaved(productName: string) {
  confirmation(`${productName} foi salvo nos favoritos.`, "/favoritos", "Ver favoritos");
}

export function confirmFavoriteRemoved(productName: string) {
  if (activeConfirmation !== undefined) toast.dismiss(activeConfirmation);
  activeConfirmation = undefined;
  toast.success(`${productName} foi removido dos favoritos.`);
}
