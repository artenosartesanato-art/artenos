'use client';

import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { User } from '@supabase/supabase-js';
import { getSupabase } from '@/lib/supabase';
import './repasses.css';

type Payout = {
  id: string;
  gross_amount: number;
  platform_fee: number;
  gateway_fee: number;
  net_amount: number;
  status: 'pending' | 'processing' | 'paid' | 'failed' | 'cancelled';
  release_after: string;
  paid_at: string | null;
  last_error: string | null;
  created_at: string;
};

const brl = (value: number | string) => Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const STATUS: Record<Payout['status'], string> = {
  pending: 'Aguardando repasse',
  processing: 'Em processamento',
  paid: 'Pago',
  failed: 'Falhou',
  cancelled: 'Cancelado',
};

// Área da artesã: cadastra a chave Pix que recebe os repasses e acompanha o que tem a receber.
export default function RepassesPage() {
  const supabase = getSupabase();
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState('Carregando...');
  const [pixType, setPixType] = useState('CPF');
  const [pixKey, setPixKey] = useState('');
  const [payouts, setPayouts] = useState<Payout[]>([]);

  const load = useCallback(
    async (currentUser: User) => {
      const [accountRes, payoutsRes] = await Promise.all([
        supabase.from('payout_accounts').select('pix_key_type, pix_key').eq('artisan_id', currentUser.id).maybeSingle(),
        supabase
          .from('payouts')
          .select('id, gross_amount, platform_fee, gateway_fee, net_amount, status, release_after, paid_at, last_error, created_at')
          .order('created_at', { ascending: false })
          .limit(50),
      ]);

      if (payoutsRes.error) return setStatus('Erro ao carregar repasses: ' + payoutsRes.error.message);
      if (accountRes.data) {
        setPixType(accountRes.data.pix_key_type);
        setPixKey(accountRes.data.pix_key);
      }
      setPayouts((payoutsRes.data ?? []) as Payout[]);
    },
    [supabase]
  );

  useEffect(() => {
    async function init() {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        setStatus('Você precisa estar logado. Faça login e volte para esta página.');
        return;
      }
      setUser(data.session.user);
      setStatus('Logado como ' + data.session.user.email);
      await load(data.session.user);
    }
    init();
  }, [supabase, load]);

  async function saveKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;
    const { error } = await supabase
      .from('payout_accounts')
      .upsert({ artisan_id: user.id, pix_key_type: pixType, pix_key: pixKey.trim() }, { onConflict: 'artisan_id' });
    if (error) return setStatus('Erro ao salvar a chave Pix: ' + error.message);
    setStatus('Chave Pix salva.');
  }

  const toReceive = payouts
    .filter((p) => p.status === 'pending' || p.status === 'processing')
    .reduce((sum, p) => sum + Math.round(Number(p.net_amount) * 100), 0);

  return (
    <main className="seller-payouts">
      <h1>Meus repasses</h1>
      <p role="status">{status}</p>

      {user && (
        <>
          <section>
            <h2>Chave Pix para receber</h2>
            <form onSubmit={saveKey}>
              <label className="an-field">
                <span>Tipo de chave</span>
              <select value={pixType} onChange={(e) => setPixType(e.target.value)}>
                <option value="CPF">CPF</option>
                <option value="CNPJ">CNPJ</option>
                <option value="EMAIL">E-mail</option>
                <option value="PHONE">Telefone</option>
                <option value="PIX_CODE">Chave aleatória</option>
              </select>
              </label>
              <label className="an-field seller-payouts-key">
                <span>Chave Pix</span>
                <input type="text" value={pixKey} onChange={(e) => setPixKey(e.target.value)} required minLength={5} autoComplete="off" />
              </label>
              <button type="submit" className="an-btn an-btn--moss">Salvar chave</button>
            </form>
          </section>

          <section>
            <h2>Repasses</h2>
            <p>A receber: {brl(toReceive / 100)}</p>
            <ul>
              {payouts.length === 0 && <li>Nenhum repasse ainda.</li>}
              {payouts.map((p) => (
                <li key={p.id}>
                  {new Date(p.created_at).toLocaleString('pt-BR')} — vendas {brl(p.gross_amount)} − comissão Artenós{' '}
                  {brl(p.platform_fee)} − taxa de pagamento {brl(p.gateway_fee)} = <strong>{brl(p.net_amount)}</strong> —{' '}
                  {STATUS[p.status]}
                  {p.status === 'pending' && ` (liberado em ${new Date(p.release_after).toLocaleDateString('pt-BR')})`}
                  {p.last_error && ` — ${p.last_error}`}
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </main>
  );
}
