"use client";

import {
  ArrowRight,
  Heart,
  LoaderCircle,
  Mail,
  PackageCheck,
  ShoppingBag,
  Sparkles,
  Store,
  Tags,
} from "@/components/icons";
import Link from "next/link";
import { useSellerProfile } from "@/components/seller-shell";

export default function SellerHomePage() {
  const profile = useSellerProfile();
  if (!profile)
    return (
      <section className="seller-gate" role="status">
        <LoaderCircle className="seller-spin" size={30} />
        <strong>Preparando o painel da sua loja...</strong>
      </section>
    );
  const firstName = profile.full_name.trim().split(/\s+/)[0] || "artesã";

  return (
    <>
      <section className="seller-welcome">
        <div>
          <p className="seller-eyebrow">Área da artesã</p>
          <h1>
            Olá, {firstName}.<br />
            Sua loja começa aqui.
          </h1>
          <p>
            Este é o espaço de gestão de{" "}
            <strong>{profile.store_name || "sua loja"}</strong>. Acesse o catálogo,
            publique opções sob encomenda e acompanhe as solicitações recebidas.
          </p>
          <Link className="seller-welcome-link" href="/vendedor/catalogo">Cadastrar uma peça <ArrowRight size={17} /></Link>
        </div>
        <span className="seller-welcome-art" aria-hidden="true">
          <Sparkles size={42} />
        </span>
      </section>

      <section
        className="seller-section"
        aria-labelledby="seller-management-title"
      >
        <div className="seller-section-heading">
          <div>
            <p className="seller-eyebrow">Gestão</p>
            <h2 id="seller-management-title">Cuide do seu trabalho</h2>
          </div>
          <span>Escolha uma área para começar</span>
        </div>
        <div className="seller-action-grid">
          <Link className="seller-action-card" href="/vendedor/minha-loja">
            <span>
              <Store size={22} />
            </span>
            <h3>Minha loja</h3>
            <p>
              Apresentação, identidade e informações comerciais da sua loja.
            </p>
            <small>
              Abrir painel <ArrowRight size={13} />
            </small>
          </Link>
          <Link className="seller-action-card" href="/vendedor/catalogo">
            <span>
              <Tags size={22} />
            </span>
            <h3>Catálogo</h3>
            <p>
              Cadastro e gerenciamento das peças que serão exibidas na vitrine.
            </p>
            <small>
              Gerenciar produtos <ArrowRight size={13} />
            </small>
          </Link>
          <Link className="seller-action-card" href="/vendedor/encomendas">
            <span>
              <PackageCheck size={22} />
            </span>
            <h3>Encomendas</h3>
            <p>Solicitações personalizadas recebidas e opções publicadas.</p>
            <small>
              Cadastrar oferta sob encomenda <ArrowRight size={13} />
            </small>
          </Link>
          <Link className="seller-action-card" href="/vendedor/vendas">
            <span>
              <ShoppingBag size={22} />
            </span>
            <h3>Vendas</h3>
            <p>Acompanhamento de pedidos, produção, envio e entrega.</p>
            <small>
              Gerenciar vendas <ArrowRight size={13} />
            </small>
          </Link>
        </div>
      </section>

      <section
        className="seller-section seller-quick-section"
        aria-labelledby="seller-quick-title"
      >
        <div className="seller-section-heading">
          <div>
            <p className="seller-eyebrow">Atalhos disponíveis</p>
            <h2 id="seller-quick-title">Continue pela Artenós</h2>
          </div>
        </div>
        <div className="seller-quick-grid">
          <Link href="/vendedor/mensagens">
            <span>
              <Mail size={21} />
            </span>
            <div>
              <strong>Mensagens</strong>
              <small>Acesse suas conversas</small>
            </div>
            <ArrowRight size={18} />
          </Link>
          <Link href="/favoritos">
            <span>
              <Heart size={21} />
            </span>
            <div>
              <strong>Favoritos</strong>
              <small>Veja as peças que você salvou</small>
            </div>
            <ArrowRight size={18} />
          </Link>
          <Link href="/">
            <span>
              <Sparkles size={21} />
            </span>
            <div>
              <strong>Vitrine Artenós</strong>
              <small>Compre de outras artesãs</small>
            </div>
            <ArrowRight size={18} />
          </Link>
        </div>
      </section>
    </>
  );
}
