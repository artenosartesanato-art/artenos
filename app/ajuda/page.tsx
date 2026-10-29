import type { Metadata } from "next";
import { FAQ } from "./faq";
import { SupportContact } from "./support-contact";
import { formatPhone, siteConfig, whatsappLink } from "@/lib/site-config";
import "../storefront.css";
import "./help.css";

export const metadata: Metadata = {
  title: "Central de Ajuda | Artenós",
  description: "Perguntas frequentes sobre compras, encomendas, pagamento, frete, trocas e como vender na Artenós, e contato com o suporte.",
};

export default function HelpPage() {
  const whatsapp = whatsappLink();
  return (
    <main id="conteudo" tabIndex={-1} className="store-container help-main">
      <header className="help-intro">
        <p className="store-eyebrow">Estamos aqui para ajudar</p>
        <h1>Central de Ajuda</h1>
        <p>Encontre respostas rápidas ou fale com a equipe Artenós. Atendimento {siteConfig.supportHours}.</p>
        <nav className="help-topics" aria-label="Temas">
          {FAQ.map((group) => <a key={group.id} href={`#${group.id}`}>{group.title}</a>)}
          <a href="#contato">Falar com a gente</a>
        </nav>
      </header>

      <div className="help-layout">
        <div className="help-faq">
          {FAQ.map((group) => (
            <section key={group.id} id={group.id} aria-labelledby={`${group.id}-titulo`}>
              <h2 id={`${group.id}-titulo`}>{group.title}</h2>
              {group.items.map((item) => (
                <details key={item.q}>
                  <summary>{item.q}</summary>
                  {item.a.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                </details>
              ))}
            </section>
          ))}
        </div>

        <aside id="contato" className="help-contact" aria-labelledby="contato-titulo">
          <h2 id="contato-titulo">Fale com a Artenós</h2>
          <p>Respondemos por e-mail com um número de protocolo. Para pedidos, informe o número que aparece em Pedidos.</p>
          {whatsapp && (
            <a className="an-btn an-btn--block help-whatsapp" href={whatsapp} target="_blank" rel="noopener noreferrer">
              Conversar no WhatsApp<span className="an-visually-hidden"> (abre em nova aba)</span>
            </a>
          )}
          <ul className="help-channels">
            {siteConfig.supportEmail && <li>E-mail: <a href={`mailto:${siteConfig.supportEmail}`}>{siteConfig.supportEmail}</a></li>}
            {siteConfig.supportPhone && <li>Telefone: <a href={`tel:+55${siteConfig.supportPhone.replace(/\D/g, "").replace(/^55/, "")}`}>{formatPhone(siteConfig.supportPhone)}</a></li>}
            <li>Horário: {siteConfig.supportHours}</li>
          </ul>
          <SupportContact />
        </aside>
      </div>
    </main>
  );
}
