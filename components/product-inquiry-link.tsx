"use client";

import Link from "next/link";
import { MessageSquare } from "@/components/icons";
import { useMarketplace } from "@/components/marketplace-state";
import { rememberProductInquiry } from "@/lib/product-inquiry-intent";

export function ProductInquiryLink({
  productId,
  productName,
  compact = false,
}: {
  productId: string;
  productName: string;
  compact?: boolean;
}) {
  const { authReady, userId } = useMarketplace();
  const conversationPath = `/mensagens?produto=${encodeURIComponent(productId)}`;
  const href = authReady && !userId
    ? `/acesso?retorno=${encodeURIComponent(conversationPath)}`
    : conversationPath;

  return (
    <Link
      className={compact ? "store-product-message" : "product-details-message"}
      href={href}
      onClick={() => rememberProductInquiry(productId)}
      aria-label={`Perguntar à loja sobre ${productName}`}
      title={`Perguntar à loja sobre ${productName}`}
    >
      <MessageSquare size={compact ? 18 : 19} />
      {!compact && <span>Falar com a loja sobre esta peça</span>}
    </Link>
  );
}
