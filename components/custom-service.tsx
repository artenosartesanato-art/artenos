"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Clock3, MessageCircle, Palette, ShieldCheck, Store } from "@/components/icons";
import { Dialog } from "@/components/ui/dialog";
import { OptimizedImage } from "@/components/optimized-image";
import { RichText } from "@/components/rich-text";
import { useMarketplace } from "@/components/marketplace-state";
import { useStorefrontActions } from "@/components/storefront-actions";
import { getSupabase } from "@/lib/supabase";
import { findBlockedTerm } from "@/lib/moderation";
import { productionLabel, type CustomService } from "@/lib/custom-services";
import { playUiSound } from "@/lib/ui-sound";
import "./custom-quotes.css";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function priceLabel(service: CustomService) {
  return service.starting_price ? `A partir de ${money.format(Number(service.starting_price))}` : "Preço combinado no orçamento";
}

/** Foto inteira (sem corte) sobre um fundo desfocado da própria foto. */
function ServicePhoto({ service, sizes, priority = false }: { service: CustomService; sizes: string; priority?: boolean }) {
  if (!service.image_url) {
    return <span className="store-no-image"><Palette size={26} /><span>Foto em breve</span></span>;
  }
  return (
    <span className="service-photo">
      <OptimizedImage className="service-photo-backdrop" src={service.image_url} alt="" width={480} height={480} sizes={sizes} />
      <OptimizedImage className="service-photo-main" src={service.image_url} alt="" width={480} height={480} sizes={sizes} priority={priority} />
    </span>
  );
}

/** Cartão da opção sob encomenda, no mesmo tamanho do cartão de peça. */
export function ServiceCard({ service, onOpen, priority = false }: { service: CustomService; onOpen: () => void; priority?: boolean }) {
  return (
    <article className="store-product service-card">
      <div className="store-product-image">
        <button type="button" className="store-product-image-trigger" onClick={onOpen} aria-label={`Ver detalhes de ${service.title}`}>
          <ServicePhoto service={service} priority={priority} sizes="(max-width: 600px) 50vw, (max-width: 1024px) 50vw, 460px" />
        </button>
        <span className="an-badge an-badge--warm store-product-badge">Sob encomenda</span>
      </div>
      <div className="store-product-body">
        <div className="store-product-meta">
          {service.store_name && <p className="store-product-shop">{service.store_name}</p>}
        </div>
        <h3>
          <button type="button" className="store-product-title" onClick={onOpen}>{service.title}</button>
        </h3>
        <p className="store-product-summary">{service.description ?? ""}</p>
        <p className="store-product-price service-card-price">
          {service.starting_price ? <><small>A partir de</small> {money.format(Number(service.starting_price))}</> : <small>Preço combinado no orçamento</small>}
        </p>
        <div className="store-product-actions">
          <button type="button" className="store-product-buy" onClick={onOpen}>Pedir orçamento</button>
        </div>
      </div>
    </article>
  );
}

/**
 * Detalhe da opção sob encomenda, no formato do detalhe da peça. "Pedir
 * orçamento" troca a coluna da direita pelo formulário, na mesma janela.
 */
function ServiceDetailsDialog({ service, onClose, startWithForm }: { service: CustomService; onClose: () => void; startWithForm: boolean }) {
  const { userId } = useMarketplace();
  const { requireAuth } = useStorefrontActions();
  const titleId = useId();
  const [step, setStep] = useState<"details" | "form">(startWithForm && userId ? "form" : "details");
  const [title, setTitle] = useState(service.title);
  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [budget, setBudget] = useState("");
  const [date, setDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const ownStore = Boolean(userId && userId === service.artisan_id);
  const formRef = useRef<HTMLFormElement>(null);

  // Ao abrir o pedido, leva a tela até o formulário (no celular ele fica abaixo da foto).
  useEffect(() => {
    if (step !== "form") return;
    const form = formRef.current;
    form?.scrollIntoView({ block: "start" });
    form?.querySelector<HTMLTextAreaElement>("textarea")?.focus({ preventScroll: true });
  }, [step]);

  function startRequest() {
    if (!userId) {
      onClose();
      requireAuth("generic");
      return;
    }
    if (ownStore) return toast.info("Esta é a sua loja.");
    setStep("form");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    if (findBlockedTerm(`${title} ${description}`)) return toast.error("O pedido contém termos que não são permitidos na Artenós.");
    setSubmitting(true);
    try {
      const { error } = await getSupabase().rpc("create_custom_order_request", {
        p_service_id: service.id, p_title: title.trim(), p_description: description.trim(),
        p_quantity: Number(quantity), p_budget: budget ? Number(budget) : null, p_desired_date: date || null,
      });
      if (error) throw error;
      playUiSound("success");
      toast.success("Pedido de orçamento enviado.", { description: "A loja responde com preço e prazo. Acompanhe em Pedidos › Orçamentos." });
      onClose();
    } catch (caught) {
      toast.error(caught instanceof Error && caught.message ? caught.message : "Não foi possível enviar a solicitação.");
    } finally {
      setSubmitting(false);
    }
  }

  const storeHref = `/loja?id=${encodeURIComponent(service.artisan_id)}`;
  return (
    <Dialog open onClose={onClose} labelledBy={titleId}
      className={`an-dialog--wide product-details-modal service-details-modal${step === "form" ? " is-requesting" : ""}`}
      closeLabel="Fechar detalhes da opção">
      <div className="pd-col pd-col--aside">
        <div className="pd-block pd-gallery">
          <div className="product-details-image service-details-image">
            <ServicePhoto service={service} sizes="(max-width: 760px) 100vw, 520px" priority />
          </div>
        </div>
        <section className="pd-block pd-info product-purchase-info" aria-label="Como funciona a encomenda">
          <div className="product-purchase-row">
            <MessageCircle size={16} />
            <div><strong>1. Você pede o orçamento</strong><span>Conte como imagina a peça: cores, tamanho, quantidade e data.</span></div>
          </div>
          <div className="product-purchase-row">
            <Clock3 size={16} />
            <div><strong>2. A loja responde</strong><span>Com o valor e o prazo para fazer a sua peça.</span></div>
          </div>
          <div className="product-purchase-row">
            <ShieldCheck size={16} />
            <div><strong>Nada é cobrado agora</strong><span>Pedir orçamento é grátis e sem compromisso.</span></div>
          </div>
        </section>
        {service.store_name && (
          <section className="pd-block pd-store" aria-label="Sobre a loja">
            <span className="pd-store-avatar" aria-hidden="true"><Store size={20} /></span>
            <div>
              <strong>{service.store_name}</strong>
              <Link className="product-details-store-link" href={storeHref} onClick={onClose}>
                Conhecer a loja e outras peças <ArrowRight size={16} />
              </Link>
            </div>
          </section>
        )}
      </div>

      <div className="pd-col pd-col--main product-details-copy">
        <div className="pd-block pd-head">
          <p className="product-details-shop">
            <Store size={15} />
            {service.store_name ? <Link href={storeHref} onClick={onClose}>{service.store_name}</Link> : <span>Loja Artenós</span>}
            {service.category_name && <span className="product-details-category">· {service.category_name}</span>}
          </p>
          <h2 id={titleId}>{service.title}</h2>
          <p className="product-details-price service-details-price">{priceLabel(service)}</p>
          <ul className="product-details-facts">
            <li><span className="an-badge an-badge--warm">Sob encomenda</span><span>Feita especialmente para você</span></li>
            <li><Clock3 size={16} /><span>{productionLabel(service)} de produção</span></li>
          </ul>
        </div>

        {step === "details" ? (
          <>
            <div className="pd-block pd-buy">
              <div className="product-details-actions service-details-actions">
                <button type="button" className="an-btn an-btn--lg product-details-buy-now" onClick={startRequest} data-autofocus>
                  <ArrowRight size={18} /> Pedir orçamento
                </button>
              </div>
            </div>
            <section className="pd-block pd-about product-details-section">
              <h3>Sobre a encomenda</h3>
              {service.description?.trim()
                ? <RichText className="product-details-description" text={service.description} />
                : <p className="product-details-description">A loja ainda não descreveu esta opção. Conte no pedido de orçamento o que você imagina.</p>}
            </section>
          </>
        ) : (
          <form ref={formRef} className="pd-block custom-modal service-request-form" onSubmit={submit}>
            <button type="button" className="service-request-back" onClick={() => setStep("details")}>
              <ArrowLeft size={15} /> Voltar aos detalhes
            </button>
            <div className="service-request-intro">
              <strong>Pedir orçamento para {service.store_name || "a loja"}</strong>
              <ol>
                <li>Você conta como imagina a peça</li>
                <li>A loja responde com preço e prazo</li>
                <li>Se aceitar, vocês combinam os detalhes pelo chat</li>
              </ol>
            </div>
            <label>
              Conte como você imagina a peça
              <small>Cores, tamanho, materiais e para que a peça será usada (mínimo de 20 caracteres).</small>
              <textarea value={description} onChange={(event) => setDescription(event.target.value)} minLength={20} maxLength={3000} required
                placeholder="Ex.: bolsa média em tons de verde, com alça de madeira, para usar no dia a dia." />
              <small className="service-request-count">{description.trim().length} de 20 caracteres mínimos</small>
            </label>
            <div className="custom-form-row">
              <label>
                Quantidade
                <input type="number" min="1" max="999" inputMode="numeric" value={quantity} onChange={(event) => setQuantity(event.target.value)} required />
              </label>
              <label>
                Quanto quer investir
                <input type="number" min="0.01" step="0.01" inputMode="decimal" value={budget} onChange={(event) => setBudget(event.target.value)} placeholder="Opcional" />
              </label>
            </div>
            <label>
              Para quando precisa (opcional)
              <input type="date" min={new Date().toISOString().slice(0, 10)} value={date} onChange={(event) => setDate(event.target.value)} />
            </label>
            <label>
              Nome do pedido
              <small>Um nome curto para você e a loja identificarem o pedido.</small>
              <input value={title} onChange={(event) => setTitle(event.target.value)} minLength={3} maxLength={120} required />
            </label>
            <p className="custom-modal-note">Nada é cobrado agora. Você acompanha a resposta em Pedidos › Orçamentos e recebe um aviso quando a loja responder.</p>
            <button className="an-btn an-btn--lg an-btn--block product-details-buy-now" type="submit" disabled={submitting} aria-busy={submitting}>
              {submitting ? "Enviando…" : "Enviar pedido de orçamento"}
            </button>
          </form>
        )}
      </div>
    </Dialog>
  );
}

/** Abre o detalhe de uma opção (e, com startWithForm, já no formulário). */
export function useServiceDialog(): { open: (service: CustomService, startWithForm?: boolean) => void; dialog: ReactNode } {
  const [current, setCurrent] = useState<{ service: CustomService; form: boolean } | null>(null);
  const open = useCallback((service: CustomService, startWithForm = false) => setCurrent({ service, form: startWithForm }), []);
  const dialog = current
    ? <ServiceDetailsDialog key={current.service.id} service={current.service} startWithForm={current.form} onClose={() => setCurrent(null)} />
    : null;
  return { open, dialog };
}
