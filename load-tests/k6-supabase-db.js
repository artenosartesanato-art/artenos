/**
 * Artenós — teste de carga DIRETO no banco (Supabase REST / PostgREST)
 * ===================================================================
 * A vitrine lê o catálogo chamando funções RPC públicas do Supabase
 * (browse_storefront_products, search_storefront_products,
 * list_storefront_shops), liberadas para o papel "anon". Este script repete
 * essas chamadas com os mesmos parâmetros do app para medir o Postgres,
 * o pool de conexões e as políticas de RLS.
 *
 * ⚠️  Use a ANON / publishable key (pública, respeita RLS) de um projeto de
 * STAGING. Nunca use a service_role aqui. Carga alta no projeto de produção
 * pode disparar a proteção anti-abuso do Supabase.
 *
 * Como rodar:
 *   k6 run -e SCENARIO=smoke \
 *     -e SUPABASE_URL="https://SEU-PROJETO.supabase.co" \
 *     -e SUPABASE_ANON_KEY="sb_publishable_..." \
 *     load-tests/k6-supabase-db.js
 *   Cenários: smoke | load | stress | spike
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Trend } from 'k6/metrics';

const SUPABASE_URL = (__ENV.SUPABASE_URL || '').replace(/\/$/, '');
const ANON_KEY = __ENV.SUPABASE_ANON_KEY || '';
const SCENARIO = __ENV.SCENARIO || 'smoke';

if (!SUPABASE_URL || !ANON_KEY) {
  throw new Error('Defina SUPABASE_URL e SUPABASE_ANON_KEY (com -e ou variáveis de ambiente).');
}

const dbLatency = new Trend('latencia_banco', true);

const CENARIOS = {
  smoke: { executor: 'constant-vus', vus: 3, duration: '1m' },
  load: {
    executor: 'ramping-vus', startVUs: 0,
    stages: [{ duration: '2m', target: 50 }, { duration: '5m', target: 50 }, { duration: '2m', target: 0 }],
    gracefulRampDown: '30s',
  },
  stress: {
    executor: 'ramping-vus', startVUs: 0,
    stages: [
      { duration: '2m', target: 50 },
      { duration: '2m', target: 100 },
      { duration: '2m', target: 200 },
      { duration: '2m', target: 400 },
      { duration: '2m', target: 0 },
    ],
    gracefulRampDown: '30s',
  },
  spike: {
    executor: 'ramping-vus', startVUs: 0,
    stages: [{ duration: '10s', target: 300 }, { duration: '1m', target: 300 }, { duration: '20s', target: 0 }],
    gracefulRampDown: '10s',
  },
};

export const options = {
  scenarios: { [SCENARIO]: CENARIOS[SCENARIO] },
  thresholds: {
    http_req_duration: ['p(95)<1000', 'p(99)<3000'],
    http_req_failed: ['rate<0.02'],
  },
};

const headers = {
  apikey: ANON_KEY,
  Authorization: `Bearer ${ANON_KEY}`,
  'Content-Type': 'application/json',
  Accept: 'application/json',
};

function rpc(nome, corpo, tag) {
  const res = http.post(`${SUPABASE_URL}/rest/v1/rpc/${nome}`, JSON.stringify(corpo), { headers, tags: { name: tag } });
  dbLatency.add(res.timings.duration);
  check(res, {
    [`${tag}: status 200`]: (r) => r.status === 200,
    [`${tag}: não é 401/403 (chave/RLS ok)`]: (r) => r.status !== 401 && r.status !== 403,
    [`${tag}: não é 429 (limite do Supabase)`]: (r) => r.status !== 429,
  });
  return res;
}

export default function () {
  // Mesmas chamadas que a home faz (app/page.tsx).
  group('home', () => {
    rpc('list_storefront_shops', { p_limit: 8 }, 'lojas_home');
    rpc('search_storefront_products', { p_section: 'featured', p_limit: 8 }, 'destaques');
    rpc('search_storefront_products', { p_section: 'ready', p_limit: 8 }, 'pronta_entrega');
    rpc('search_storefront_products', { p_section: 'new', p_limit: 8 }, 'novidades');
  });
  sleep(Math.random() * 2 + 1);

  // Página de categorias (app/categorias/page.tsx): a consulta mais cara, com ordenação e paginação.
  group('categorias', () => {
    const sorts = ['newest', 'price_asc', 'price_desc', 'rating'];
    rpc('browse_storefront_products', {
      p_query: null, p_category_id: null, p_min_price: null, p_max_price: null,
      p_ready_only: false, p_sort: sorts[Math.floor(Math.random() * sorts.length)],
      p_limit: 24, p_offset: 0,
    }, 'catalogo');
  });
  sleep(Math.random() * 2 + 1);

  // Diretório de lojas (app/lojas/page.tsx).
  group('lojas', () => {
    rpc('list_storefront_shops', { p_limit: 100 }, 'diretorio_lojas');
  });
  sleep(Math.random() * 2 + 1);
}

export function handleSummary(data) {
  const p95 = data.metrics.http_req_duration?.values['p(95)'] ?? 0;
  const falhas = (data.metrics.http_req_failed?.values.rate ?? 0) * 100;
  return {
    stdout: `
========================================================
 BANCO (Supabase) — cenário: ${SCENARIO}
========================================================
 Requisições : ${data.metrics.http_reqs?.values.count ?? 0}
 p95         : ${p95.toFixed(0)} ms
 Falhas      : ${falhas.toFixed(2)} %
--------------------------------------------------------
 Observe em paralelo no painel do Supabase:
   Database > Connections (o pool saturou?) e
   Reports > Query Performance (alguma consulta lenta?).
 O limite é o nº de VUs quando a p95 dispara ou
 aparecem respostas 429/500.
========================================================
`,
    ['load-tests/resultado-db-' + SCENARIO + '.json']: JSON.stringify(data, null, 2),
  };
}
