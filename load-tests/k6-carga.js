/**
 * Artenós — teste de carga / estresse na borda web (Next.js na Vercel)
 * ====================================================================
 * Teste de capacidade CONTRA A SUA PRÓPRIA infraestrutura (de preferência
 * um deploy de staging/preview). Não é ataque: serve para achar o limite de
 * usuários simultâneos antes dos clientes reais.
 *
 * ⚠️  Regras:
 *   1. Só rode contra ambiente SEU. Nunca contra sites de terceiros.
 *   2. Vercel e Supabase têm proteção anti-abuso: carga alta em produção pode
 *      ser lida como ataque. Prefira staging/preview.
 *   3. Comece pelo cenário "smoke" e suba aos poucos.
 *
 * Como rodar:
 *   k6 run -e BASE_URL="https://seu-preview.vercel.app" -e SCENARIO=smoke load-tests/k6-carga.js
 *   Cenários: smoke | load | stress | spike
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Trend, Rate } from 'k6/metrics';

const BASE_URL = (__ENV.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const SCENARIO = __ENV.SCENARIO || 'smoke';

const errorRate = new Rate('erros_negocio');
const pageLatency = new Trend('latencia_paginas', true);

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
      { duration: '2m', target: 100 },
      { duration: '3m', target: 200 },
      { duration: '3m', target: 400 },
      { duration: '3m', target: 800 }, // onde a p95 estourar = seu limite
      { duration: '2m', target: 0 },
    ],
    gracefulRampDown: '30s',
  },
  spike: {
    executor: 'ramping-vus', startVUs: 0,
    stages: [{ duration: '10s', target: 500 }, { duration: '1m', target: 500 }, { duration: '10s', target: 0 }, { duration: '1m', target: 0 }],
    gracefulRampDown: '10s',
  },
};

export const options = {
  scenarios: { [SCENARIO]: CENARIOS[SCENARIO] },
  thresholds: {
    http_req_duration: ['p(95)<800', 'p(99)<2000'],
    // O webhook sem assinatura responde 401 de propósito; não conta como falha.
    'http_req_failed{esperado:sim}': ['rate<0.01'],
    erros_negocio: ['rate<0.05'],
  },
};

// Páginas públicas que fazem leitura no Supabase no servidor (vitrine).
const PAGINAS = [
  { nome: 'home', caminho: '/' },
  { nome: 'categorias', caminho: '/categorias' },
  { nome: 'lojas', caminho: '/lojas' },
];

export default function () {
  group('1. Navegação anônima na vitrine', () => {
    for (const pagina of PAGINAS) {
      const res = http.get(`${BASE_URL}${pagina.caminho}`, { tags: { name: pagina.nome, esperado: 'sim' } });
      pageLatency.add(res.timings.duration);
      const ok = check(res, {
        [`${pagina.nome} respondeu 200`]: (r) => r.status === 200,
        [`${pagina.nome} < 1.5s`]: (r) => r.timings.duration < 1500,
      });
      errorRate.add(!ok);
      sleep(Math.random() * 2 + 1); // 1 a 3 s entre páginas (comportamento humano)
    }
  });

  group('2. Webhook do Mercado Pago deve REJEITAR sem assinatura', () => {
    // Primeira linha de defesa: rejeitar rápido (401) antes de tocar o banco.
    // Se MP_WEBHOOK_SECRET não estiver configurado no ambiente, a rota responde 503.
    const res = http.post(
      `${BASE_URL}/api/webhooks/mercadopago`,
      JSON.stringify({ type: 'payment', data: { id: '123' } }),
      { headers: { 'Content-Type': 'application/json' }, tags: { name: 'webhook_sem_assinatura' } },
    );
    check(res, { 'webhook rejeita sem assinatura (401)': (r) => r.status === 401 });
  });

  sleep(Math.random() * 3 + 2);
}

export function handleSummary(data) {
  const p95 = data.metrics.http_req_duration?.values['p(95)'] ?? 0;
  const falhas = (data.metrics.http_req_failed?.values.rate ?? 0) * 100;
  return {
    stdout: `
========================================================
 BORDA WEB — cenário: ${SCENARIO}
========================================================
 Requisições : ${data.metrics.http_reqs?.values.count ?? 0}
 p95         : ${p95.toFixed(0)} ms
 Falhas HTTP : ${falhas.toFixed(2)} % (inclui os 401 esperados do webhook)
--------------------------------------------------------
 O limite de simultâneos é o nº de VUs no momento em que
 a p95 dispara e as falhas passam de ~1%.
========================================================
`,
    ['load-tests/resultado-web-' + SCENARIO + '.json']: JSON.stringify(data, null, 2),
  };
}
