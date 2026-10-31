"use client";

import { useId, useState } from "react";
import { ArrowRight, ExternalLink, Sparkles } from "@/components/icons";
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
        className="dev-credit-dialog" closeLabel="Fechar convite">
        <div className="dev-credit">
          <span className="dev-credit-badge"><Sparkles size={14} aria-hidden="true" /> Desenvolvido por {DEVELOPER.name}</span>
          <h2 id={titleId}>Gostou desta plataforma?</h2>
          <p id={textId}>
            A Artenós foi criada pela <strong>{DEVELOPER.name}</strong>. Se você quer uma plataforma como esta para o
            seu negócio, ou tem interesse em algum dos nossos serviços, acesse o nosso site e fale com a gente.
          </p>
          <ul className="dev-credit-points">
            <li>Plataforma igual a esta, com a cara da sua marca</li>
            <li>Projeto sob medida para o que o seu negócio precisa</li>
            <li>Pensado para funcionar bem no celular</li>
          </ul>
          <div className="dev-credit-actions">
            <a className="dev-credit-cta" href={DEVELOPER.url} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}>
              Acessar {DEVELOPER.site} <ExternalLink size={16} aria-hidden="true" />
              <span className="an-visually-hidden"> (abre em nova aba)</span>
            </a>
            <button type="button" className="dev-credit-later" onClick={() => setOpen(false)}>
              Continuar na Artenós <ArrowRight size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
