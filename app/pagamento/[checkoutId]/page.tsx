'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { initMercadoPago, Payment } from '@mercadopago/sdk-react';
// Ajuste o caminho se o seu arquivo não estiver em lib/supabase.ts
import { getSupabase } from '../../../lib/supabase';
import { notifyCartChanged } from '@/components/marketplace-state';
import '../../storefront.css';
import '../payment.css';

type Checkout = {
  id: string;
  integration_version: number | null;
  status: 'pending' | 'awaiting_payment' | 'approved' | 'cancelled' | 'refunded';
  total_amount: number;
  mp_status: string | null;
  mp_status_detail: string | null;
  payment_method: string | null;
  pix_qr_code: string | null;
  pix_qr_code_base64: string | null;
  paid_at: string | null;
  receipt_sent_at: string | null;
  created_at: string;
  pix_expires_at: string | null;
  shipping_snapshot: { price: number; company_name: string; service_name: string }[] | null;
};

type Item = { id: string; product_name: string; unit_price: number; quantity: number; line_total: number };

const brl = (value: number | string) => Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const REJECTIONS: Record<string, string> = {
  cc_rejected_insufficient_amount: 'Saldo ou limite insuficiente no cartão.',
  cc_rejected_bad_filled_card_number: 'Confira o número do cartão.',
  cc_rejected_bad_filled_date: 'Confira a data de validade.',
  cc_rejected_bad_filled_security_code: 'Confira o código de segurança.',
  cc_rejected_call_for_authorize: 'Seu banco pede autorização: ligue para ele ou use outro cartão.',
  cc_rejected_card_disabled: 'Cartão desativado. Use outro cartão.',
  cc_rejected_high_risk: 'Pagamento recusado por segurança. Tente outro cartão ou o Pix.',
};

function methodLabel(method: string | null) {
  if (method === 'bank_transfer' || method === 'pix') return 'Pix';
  if (method === 'credit_card') return 'Cartão de crédito';
  return method ?? '—';
}

export default function PagamentoPage() {
  const supabase = getSupabase();
  const { checkoutId } = useParams<{ checkoutId: string }>();

  const [checkout, setCheckout] = useState<Checkout | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('Carregando...');
  const [copied, setCopied] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const syncing = useRef(false);

  // ---------- carregar a compra ----------
  const load = useCallback(async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      setMessage('Você precisa estar logado. Faça login e volte para esta página.');
      return null;
    }
    setEmail(sessionData.session.user.email ?? '');

    const { data, error } = await supabase
      .from('checkouts')
      .select('id, integration_version, status, total_amount, mp_status, mp_status_detail, payment_method, pix_qr_code, pix_qr_code_base64, paid_at, receipt_sent_at, created_at, pix_expires_at, shipping_snapshot')
      .eq('id', checkoutId)
      .maybeSingle();

    if (error) {
      console.error('Erro ao consultar compra:', error);
      setMessage(error.code === '42703'
        ? 'O pagamento ainda precisa da atualização do banco. Nenhuma cobrança foi iniciada nesta tela.'
        : 'Não foi possível consultar sua compra. Tente novamente em instantes.');
      return null;
    }
    if (!data) {
      setMessage('Compra não encontrada nesta conta. Confira o acesso ou volte ao carrinho.');
      return null;
    }
    if (data.integration_version !== 2 && data.status !== 'approved') {
      setMessage('Esta compra foi criada antes da atualização do pagamento. Volte ao carrinho; a compra anterior precisa ser conciliada ou cancelada antes de refazer o pedido.');
      return null;
    }

    const { data: itemRows } = await supabase
      .from('checkout_items')
      .select('id, product_name, unit_price, quantity, line_total')
      .eq('checkout_id', checkoutId);

    setCheckout(data as Checkout);
    if (data.status === 'approved') notifyCartChanged();
    setItems((itemRows ?? []) as Item[]);
    setMessage('');
    return data as Checkout;
  }, [supabase, checkoutId]);

  // ---------- pergunta ao servidor como está o pagamento ----------
  const sync = useCallback(async () => {
    if (syncing.current) return;
    syncing.current = true;
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) return;
      const response = await fetch('/api/checkout/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session.access_token}` },
        body: JSON.stringify({ checkoutId }),
      });
      if (!response.ok) throw new Error('Não foi possível atualizar o pagamento. Tente novamente.');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível consultar o pagamento.');
    } finally {
      syncing.current = false;
    }
  }, [supabase, checkoutId, load]);

  useEffect(() => {
    const publicKey = process.env.NEXT_PUBLIC_MP_PUBLIC_KEY;
    if (publicKey) initMercadoPago(publicKey, { locale: 'pt-BR' });

    const timer = window.setTimeout(() => {
      load().then((loaded) => {
        if (loaded && loaded.status !== 'approved') void sync();
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load, sync]);

  // Enquanto espera o Pix (ou análise do cartão), confere a cada 4 segundos.
  useEffect(() => {
    if (checkout?.status !== 'awaiting_payment') return;
    const timer = setInterval(() => void sync(), 4000);
    return () => clearInterval(timer);
  }, [checkout?.status, sync]);

  // ---------- Payment Brick (cartão e Pix) ----------
  const initialization = useMemo(
    () => ({ amount: Number(checkout?.total_amount ?? 0), payer: { email, entityType: 'individual' as const } }),
    [checkout?.total_amount, email]
  );

  const customization = useMemo(
    () => ({
      paymentMethods: {
        creditCard: 'all' as const,
        bankTransfer: 'all' as const, // Pix
        maxInstallments: 12,
      },
    }),
    []
  );

  const onSubmit = useCallback(
    async ({ formData }: { formData: unknown }) => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) throw new Error('Sessão expirada. Faça login novamente.');

      const response = await fetch('/api/checkout/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session.access_token}` },
        body: JSON.stringify({
          checkoutId,
          formData,
          deviceId: (window as unknown as { MP_DEVICE_SESSION_ID?: string }).MP_DEVICE_SESSION_ID,
        }),
      });
      const result = (await response.json()) as { error?: string; status?: string; statusDetail?: string | null };

      if (!response.ok) {
        setMessage(result.error ?? 'Não foi possível processar o pagamento.');
        throw new Error(result.error ?? 'Falha no pagamento');
      }

      await load();
      if (result.status === 'rejected') {
        setMessage('Pagamento recusado. ' + (REJECTIONS[result.statusDetail ?? ''] ?? 'Tente outro cartão ou use o Pix.'));
      } else {
        setMessage('');
      }
    },
    [supabase, checkoutId, load]
  );

  async function copyPix() {
    if (!checkout?.pix_qr_code) return;
    try {
      await navigator.clipboard.writeText(checkout.pix_qr_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setMessage('Não foi possível copiar automaticamente. Selecione e copie o código abaixo.');
    }
  }

  async function cancelCheckout() {
    if (!window.confirm('Cancelar esta compra e liberar os produtos reservados?')) return;
    setCancelling(true);
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) throw new Error('Faça login novamente.');
      const response = await fetch('/api/checkout/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session.access_token}` },
        body: JSON.stringify({ checkoutId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'Não foi possível cancelar.');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível cancelar.');
    } finally {
      setCancelling(false);
    }
  }

  // ---------- tela ----------
  const summary = (
    <section className="payment-summary">
      <h2>Sua compra</h2>
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            <span>{item.product_name}<small>{item.quantity} × {brl(item.unit_price)}</small></span>
            <strong>{brl(item.line_total)}</strong>
          </li>
        ))}
      </ul>
      <p className="payment-amount"><span>Produtos</span><span>{brl(items.reduce((sum, item) => sum + Number(item.line_total), 0))}</span></p>
      {checkout?.shipping_snapshot?.map((shipping, index) => (
        <p className="payment-amount" key={index}>
          <span>Frete · {shipping.company_name}<small>{shipping.service_name}</small></span>
          <span>{brl(shipping.price)}</span>
        </p>
      ))}
      {checkout && (
        <p className="payment-total">
          <span>Total a pagar</span><strong>{brl(checkout.total_amount)}</strong>
        </p>
      )}
    </section>
  );

  return (
    <div className="store-page payment-page">
    <main id="conteudo" tabIndex={-1} className="payment-main">
      <Link className="payment-back" href="/carrinho">← Voltar ao carrinho</Link>
      <p className="payment-eyebrow">Feito à mão, escolhido por você</p>
      <h1>Pagamento</h1>
      <p className="payment-intro">Confira sua compra e escolha como pagar. A confirmação é feita pelo Mercado Pago.</p>
      <ol className="payment-steps" aria-label="Etapas da compra">
        <li>Carrinho</li><li aria-current={checkout?.status === 'approved' ? undefined : 'step'}>Pagamento</li><li aria-current={checkout?.status === 'approved' ? 'step' : undefined}>Confirmação</li>
      </ol>
      {message && <p className="payment-notice" role="status">{message}</p>}

      {checkout?.status === 'approved' && (
        <section className="payment-card">
          <h2>Pagamento aprovado — comprovante</h2>
          <p>
            Pedido: {checkout.id}
            <br />
            Data: {checkout.paid_at ? new Date(checkout.paid_at).toLocaleString('pt-BR') : '—'}
            <br />
            Forma de pagamento: {methodLabel(checkout.payment_method)}
          </p>
          {summary}
          <p>
            {checkout.receipt_sent_at
              ? `Enviamos o comprovante para ${email}.`
              : 'Você pode salvar este comprovante em PDF. O envio por e-mail ainda não foi confirmado.'}
          </p>
          <button type="button" onClick={() => window.print()}>
            Imprimir / salvar em PDF
          </button>{' '}
          <Link href="/mensagens">Ir para as mensagens do pedido</Link>
        </section>
      )}

      {checkout && (checkout.status === 'cancelled' || checkout.status === 'refunded') && (
        <p>
          {checkout.status === 'refunded' ? 'Este pagamento foi reembolsado.' : 'Esta compra foi substituída por outra.'}{' '}
          <Link href="/carrinho">Voltar ao carrinho</Link>
        </p>
      )}

      {checkout?.status === 'awaiting_payment' && (
        <section className="payment-card">
          {summary}
          {checkout.pix_qr_code ? (
            <>
              <h2>Pague com Pix</h2>
              <p>Abra o app do seu banco, escolha Pix e leia o QR Code ou use o código copia e cola.</p>
              {checkout.pix_expires_at && <p>Válido até {new Date(checkout.pix_expires_at).toLocaleString('pt-BR')}.</p>}
              {checkout.pix_qr_code_base64 && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`data:image/png;base64,${checkout.pix_qr_code_base64}`}
                  alt="QR Code do Pix"
                  width={220}
                  height={220}
                />
              )}
              <p>
                <textarea aria-label="Código Pix copia e cola" readOnly value={checkout.pix_qr_code} rows={4} />
              </p>
              <button type="button" onClick={copyPix}>
                {copied ? 'Copiado!' : 'Copiar código Pix'}
              </button>
              <p>Aguardando o pagamento... esta tela atualiza sozinha quando o Pix for confirmado.</p>
            </>
          ) : (
            <p>Pagamento em análise. Aguarde, esta tela atualiza sozinha.</p>
          )}
        </section>
      )}

      {checkout?.status === 'pending' && (
        <section className="payment-card">
          {summary}
          <h2>Forma de pagamento</h2>
          {process.env.NEXT_PUBLIC_MP_PUBLIC_KEY ? <Payment
            initialization={initialization}
            customization={customization}
            onSubmit={onSubmit}
            onError={() => setMessage('Não foi possível carregar o formulário de pagamento. Atualize a página ou tente novamente em instantes.')}
          /> : <p role="alert">Pagamento temporariamente indisponível. A chave pública do Mercado Pago precisa ser configurada.</p>}
        </section>
      )}
      {checkout && ['pending', 'awaiting_payment'].includes(checkout.status) && (
        <div className="payment-actions">
          <button type="button" onClick={() => void sync()}>Atualizar status</button>
          <button type="button" className="payment-cancel" disabled={cancelling} onClick={() => void cancelCheckout()}>
            {cancelling ? 'Confirmando cancelamento…' : 'Cancelar esta compra'}
          </button>
          <p>Os itens estão reservados para esta compra. Para alterar produtos ou endereço, cancele antes de iniciar outra.</p>
        </div>
      )}
    </main>
    </div>
  );
}
