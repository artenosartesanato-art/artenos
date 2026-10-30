"use client";

import { useMemo, useState } from "react";
import {
  ArrowLeftRight, BagCheck, Clock3, CreditCard, HelpCircle, Mail, Palette, Phone, Search, Store, Truck, Whatsapp,
} from "@/components/icons";
import { Dialog } from "@/components/ui/dialog";
import type { FaqGroup } from "./faq";
import { SupportContact } from "./support-contact";

const TOPIC_ICONS: Record<string, typeof Search> = {
  comprar: BagCheck, encomendas: Palette, pagamento: CreditCard, frete: Truck, trocas: ArrowLeftRight, vender: Store,
};

type Contact = { whatsapp: string | null; email: string; phone: string; phoneHref: string; hours: string };

/** Compara sem acento e sem caixa: "credito" acha "crédito". */
const fold = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("pt-BR");

/**
 * Central de Ajuda: busca nas perguntas, um tema por vez (em vez da lista
 * inteira) e o contato num modal, aberto pelo convite no fim das perguntas.
 */
export function HelpCenter({ faq, contact }: { faq: FaqGroup[]; contact: Contact }) {
  const [topic, setTopic] = useState(faq[0]?.id ?? "");
  const [query, setQuery] = useState("");
  const [contactOpen, setContactOpen] = useState(false);
  const term = fold(query.trim());

  const results = useMemo(() => !term ? [] : faq.flatMap((group) => group.items
    .filter((item) => fold(`${item.q} ${item.a.join(" ")}`).includes(term))
    .map((item) => ({ ...item, group: group.title }))), [faq, term]);
  const current = faq.find((group) => group.id === topic) ?? faq[0];

  return (
    <>
      <header className="help-hero">
        <p className="store-eyebrow">Estamos aqui para ajudar</p>
        <h1>Como podemos ajudar?</h1>
        <label className="help-search">
          <Search size={18} />
          <span className="an-visually-hidden">Buscar nas perguntas</span>
          <input type="search" className="an-input" value={query} onChange={(event) => setQuery(event.target.value)}
            placeholder="Busque por pagamento, frete, troca…" />
        </label>
      </header>

      {term ? (
        <section className="help-results" aria-live="polite" aria-labelledby="ajuda-resultados">
          <h2 id="ajuda-resultados">
            {results.length ? `${results.length} ${results.length === 1 ? "resposta encontrada" : "respostas encontradas"}` : "Nada encontrado"}
          </h2>
          {results.length ? (
            <div className="help-questions">
              {results.map((item) => (
                <details key={item.q} open={results.length <= 3}>
                  <summary><small>{item.group}</small>{item.q}</summary>
                  <div className="help-answer">{item.a.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</div>
                </details>
              ))}
            </div>
          ) : (
            <p className="help-empty">Tente outra palavra ou fale com a gente pelo botão logo abaixo.</p>
          )}
        </section>
      ) : (
        <>
          <nav className="help-topic-grid" aria-label="Temas da ajuda">
            {faq.map((group) => {
              const Icon = TOPIC_ICONS[group.id] ?? HelpCircle;
              return (
                <button key={group.id} type="button" aria-pressed={group.id === current?.id} onClick={() => setTopic(group.id)}>
                  <span className="help-topic-icon" aria-hidden="true"><Icon size={20} /></span>
                  <strong>{group.title}</strong>
                  <small>{group.items.length} {group.items.length === 1 ? "pergunta" : "perguntas"}</small>
                </button>
              );
            })}
          </nav>
          {current && (
            <section className="help-results" id={current.id} aria-labelledby={`${current.id}-titulo`}>
              <h2 id={`${current.id}-titulo`}>{current.title}</h2>
              <div className="help-questions">
                {current.items.map((item, index) => (
                  <details key={item.q} open={index === 0}>
                    <summary>{item.q}</summary>
                    <div className="help-answer">{item.a.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</div>
                  </details>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      <section id="contato" className="help-cta" aria-labelledby="ajuda-contato">
        <span className="help-cta-icon" aria-hidden="true"><HelpCircle size={24} /></span>
        <div>
          <h2 id="ajuda-contato">Mais alguma dúvida?</h2>
          <p>Fale com a equipe Artenós. Respondemos com um número de protocolo, {contact.hours}.</p>
        </div>
        <button type="button" className="an-btn an-btn--lg help-cta-button" onClick={() => setContactOpen(true)} aria-haspopup="dialog">
          Fale com a Artenós
        </button>
      </section>

      <Dialog open={contactOpen} onClose={() => setContactOpen(false)} labelledBy="ajuda-modal-titulo"
        className="an-dialog--wide help-modal" closeLabel="Fechar contato">
        <div className="help-modal-body">
          <div className="help-modal-head">
            <h2 id="ajuda-modal-titulo">Fale com a Artenós</h2>
            <p>Para pedidos, informe o número que aparece em Pedidos.</p>
          </div>
          <ul className="help-channels">
            {contact.whatsapp && (
              <li><a className="help-channel help-channel--whatsapp" href={contact.whatsapp} target="_blank" rel="noopener noreferrer">
                <Whatsapp size={18} /> WhatsApp<span className="an-visually-hidden"> (abre em nova aba)</span>
              </a></li>
            )}
            {contact.email && <li><a className="help-channel" href={`mailto:${contact.email}`}><Mail size={18} /> {contact.email}</a></li>}
            {contact.phone && <li><a className="help-channel" href={contact.phoneHref}><Phone size={18} /> {contact.phone}</a></li>}
            <li className="help-channel help-channel--static"><Clock3 size={18} /> {contact.hours}</li>
          </ul>
          <SupportContact />
        </div>
      </Dialog>
    </>
  );
}
