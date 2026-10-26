import type { Metadata } from "next";
import { SellerShell } from "@/components/seller-shell";
import "./seller.css";

export const metadata: Metadata = {
  title: "Painel da loja | Artenós",
  description: "Área de gestão da loja para artesãs aprovadas na Artenós.",
};

export default function SellerLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <SellerShell>{children}</SellerShell>;
}