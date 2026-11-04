"use client";

import { useId, useState } from "react";
import { ArrowUpRight } from "@/components/icons";
import { Dialog } from "@/components/ui/dialog";

/** Empresa que desenvolveu a Artenós. Troque aqui o nome ou o endereço do site. */
export const DEVELOPER = {
  name: "CMK Cogit",
  url: "https://cmkcogit.com.br",
  site: "cmkcogit.com.br",
};

/**
 * "Desenvolvido por CMK Cogit" no rodapé: em vez de sair direto do site, abre
 * um convite explicando que a mesma equipe faz plataformas como esta.
 * As cores do convite ficam nas variáveis --dev-* (developer-credit em globals.css).
 */
export function DeveloperCredit() {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const textId = useId();
  return (
    <>
      <button type="button" className="store-footer-credit" onClick={() => setOpen(true)} aria-haspopup="dialog">
        {DEVELOPER.name}
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} labelledBy={titleId} describedBy={textId}
        className="dev-credit-dialog" closeLabel="Fechar">
        <div className="dev-credit">
          <header className="dev-credit-meta">
            <span className="dev-credit-brand">{DEVELOPER.name}</span>
            <span className="dev-credit-tag">Créditos do projeto</span>
          </header>
          <h2 id={titleId}>Gostou da plataforma?</h2>
          <p id={textId} className="dev-credit-lead">
            A Artenós foi desenvolvida pela {DEVELOPER.name}. Se você quer algo assim para o seu negócio, ou tem
            interesse em outro dos nossos serviços, conheça o nosso trabalho.
          </p>
          <ol className="dev-credit-list">
            <li><span>01</span>Uma plataforma como esta, com a identidade da sua marca</li>
            <li><span>02</span>Projetos sob medida para o que o seu negócio precisa</li>
            <li><span>03</span>Desenhada primeiro para o celular</li>
          </ol>
          <footer className="dev-credit-actions">
            <a className="dev-credit-cta" data-autofocus href={DEVELOPER.url} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}>
              Visitar {DEVELOPER.site}
              <ArrowUpRight size={18} aria-hidden="true" />
              <span className="an-visually-hidden"> (abre em nova aba)</span>
            </a>
            <button type="button" className="dev-credit-later" onClick={() => setOpen(false)}>Agora não</button>
          </footer>
        </div>
      </Dialog>
    </>
  );
}
