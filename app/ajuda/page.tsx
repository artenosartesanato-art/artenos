import type { Metadata } from "next";
import { FAQ } from "./faq";
import { HelpCenter } from "./help-center";
import { formatPhone, siteConfig, whatsappLink } from "@/lib/site-config";
import "../storefront.css";
import "./help.css";

export const metadata: Metadata = {
  title: "Central de Ajuda | Artenós",
  description: "Perguntas frequentes sobre compras, encomendas, pagamento, frete, trocas e como vender na Artenós, e contato com o suporte.",
};

export default function HelpPage() {
  const phone = siteConfig.supportPhone ?? "";
  return (
    <main id="conteudo" tabIndex={-1} className="store-container help-main">
      <HelpCenter faq={FAQ} contact={{
        whatsapp: whatsappLink(),
        email: siteConfig.supportEmail ?? "",
        phone: phone ? formatPhone(phone) : "",
        phoneHref: `tel:+55${phone.replace(/\D/g, "").replace(/^55/, "")}`,
        hours: siteConfig.supportHours,
      }} />
    </main>
  );
}
