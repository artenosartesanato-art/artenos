import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Client com poder total (ignora RLS). SÓ no servidor: rotas em app/api e módulos de lib/.
// A chave fica em SUPABASE_SERVICE_ROLE_KEY (sem NEXT_PUBLIC_) no .env.local.
let admin: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local (a chave é só do servidor).');
  }
  admin ??= createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return admin;
}

// Descobre quem está chamando a rota a partir do token de login enviado pelo navegador
// (Authorization: Bearer <access_token>). Nunca confie em um id de usuário vindo no corpo.
export async function getUserFromRequest(request: Request) {
  const header = request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) return null;

  const { data, error } = await getSupabaseAdmin().auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

// Client com a sessão de quem chamou (respeita RLS e auth.uid()): usado para
// conferir permissões no banco, como is_active_admin(), em nome da pessoa.
export function getSupabaseAsUser(request: Request): SupabaseClient | null {
  const header = request.headers.get('authorization') ?? '';
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!header.startsWith('Bearer ') || !url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: header } },
  });
}

/** IP para os registros de auditoria (só quando é um endereço válido). */
export function auditIp(ip: string): string | null {
  return /^[0-9a-f:.]+$/i.test(ip) && ip.length <= 45 ? ip : null;
}
