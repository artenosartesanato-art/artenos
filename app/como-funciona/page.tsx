import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight, ClipboardList, Heart, MessageCircle, PackageCheck, Palette, Search, ShieldCheck, ShoppingBag,
  Store, Truck, UserRoundCheck, HandCoins,
} from "@/components/icons";
import "../storefront.css";
import "./how-it-works.css";

export const metadata: Metadata = {
  title: "Como funciona | Artenós",
  description: "Como comprar peças feitas à mão e como vender seu artesanato na Artenós.",
};

// Somente o que a plataforma faz hoje: nada de prazos, taxas ou garantias
// que dependam de configuração ou de cada loja.
const BUY = [
  { icon: Search, title: "Encontre a peça", text: "Navegue por categorias, lojas ou pela busca. Filtre por faixa de preço e por pronta entrega." },
  { icon: Heart, title: "Salve e compare", text: "Guarde favoritos e monte o carrinho mesmo sem conta. Ao entrar, o que você salvou vai junto." },
  { icon: MessageCircle, title: "Converse com quem faz", text: "Tire dúvidas sobre medidas, cores e prazos direto com a artesã, pelas mensagens da peça." },
  { icon: Truck, title: "Calcule o frete", text: "Informe seu CEP no carrinho: o frete é calculado por loja, com o prazo de produção somado ao da transportadora." },
  { icon: ShoppingBag, title: "Pague com Pix ou cartão", text: "O pagamento é processado pelo Mercado Pago. A Artenós não guarda os dados do seu cartão." },
  { icon: PackageCheck, title: "Acompanhe o pedido", text: "Em Pedidos você vê cada etapa — pago, em preparação, enviado e entregue — e recebe avisos no sininho." },
];

const SELL = [
  { icon: UserRoundCheck, title: "Cadastre sua loja", text: "Conte sobre você, sua técnica e de onde envia. O cadastro passa por análise antes de a loja aparecer." },
  { icon: Palette, title: "Publique suas peças", text: "Fotos, descrição, preço, estoque e prazo de produção. A calculadora de precificação ajuda a não sair no prejuízo." },
  { icon: ClipboardList, title: "Aceite encomendas", text: "Peças sob medida podem ser combinadas pelas mensagens e pela área de encomendas." },
  { icon: Store, title: "Gerencie as vendas", text: "No painel da loja você acompanha pedidos, atualiza o status de envio e responde clientes." },
  { icon: HandCoins, title: "Receba os repasses", text: "Depois do pagamento confirmado, o valor da venda, já descontada a comissão da plataforma, entra nos seus repasses." },
];

export default function Page() {
  return (
    <main id="conteudo" tabIndex={-1} className="store-page how-page">
      <div className="store-container">
        <header className="how-intro">
          <p className="store-eyebrow">Como funciona</p>
          <h1>Do ateliê até a sua casa</h1>
          <p>A Artenós liga quem procura peças feitas à mão a quem faz. Veja o caminho de cada lado.</p>
          <nav className="how-jump" aria-label="Escolha o assunto">
            <a href="#comprar">Quero comprar</a>
            <a href="#vender">Quero vender</a>
          </nav>
        </header>

        <section id="comprar" className="how-track" aria-labelledby="comprar-titulo">
          <div className="how-track-head">
            <h2 id="comprar-titulo">Para quem compra</h2>
            <Link className="an-btn an-btn--secondary an-btn--sm" href="/categorias">Ver peças <ArrowRight size={15} /></Link>
          </div>
          <ol className="how-steps">
            {BUY.map(({ icon: Icon, title, text }) => (
              <li key={title}>
                <span className="how-step-icon"><Icon size={20} /></span>
                <h3>{title}</h3>
                <p>{text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section id="vender" className="how-track how-track--sell" aria-labelledby="vender-titulo">
          <div className="how-track-head">
            <h2 id="vender-titulo">Para quem faz</h2>
            <Link className="an-btn an-btn--moss an-btn--sm" href="/acesso?aba=artesa">Abrir minha loja <ArrowRight size={15} /></Link>
          </div>
          <ol className="how-steps">
            {SELL.map(({ icon: Icon, title, text }) => (
              <li key={title}>
                <span className="how-step-icon"><Icon size={20} /></span>
                <h3>{title}</h3>
                <p>{text}</p>
              </li>
            ))}
          </ol>
        </section>

        <aside className="how-note">
          <ShieldCheck size={22} />
          <p>
            Pedidos de lojas diferentes viram pedidos separados, cada um com seu frete e seu acompanhamento.
            Dúvidas sobre dados pessoais? Leia a <Link href="/privacidade">Política de Privacidade</Link> e
            os <Link href="/termos">Termos de Uso</Link>.
          </p>
        </aside>
      </div>
    </main>
  );
}
