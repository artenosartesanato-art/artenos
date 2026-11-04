/**
 * Artenós — teste do LIMITE DE TENTATIVAS (rate limit) da tela de login
 * =====================================================================
 * Confere, no site no ar, que a rota /api/acesso/situacao (usada pela tela de
 * login) recusa a pessoa depois de 10 tentativas em 10 minutos, e que não dá
 * para burlar o limite fingindo ser outro endereço de internet (cabeçalho
 * X-Forwarded-For falso).
 *
 * É seguro: usa um e-mail que não existe (domínio .invalid), não cria conta,
 * não cria nada no banco e não envia e-mail. São só ~16 requisições, uma de
 * cada vez.
 *
 * ⚠️  Depois de rodar, o SEU endereço de internet fica bloqueado nessa rota por
 * 10 minutos. O login continua funcionando; só a mensagem de "conta em
 * exclusão" deixa de aparecer nesse período. Para rodar de novo, espere 10 min.
 *
 * Como rodar (no PowerShell, dentro da pasta do projeto):
 *   k6 run -e BASE_URL="https://SEU-SITE" load-tests/k6-rate-limit.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = (__ENV.BASE_URL || '').replace(/\/$/, '');
if (!BASE_URL) {
  throw new Error('Defina o endereço do site: -e BASE_URL="https://seu-site"');
}

const LIMITE = 10;          // o mesmo p_limit do código da rota
const TENTATIVAS = 13;      // um pouco acima do limite
const TENTATIVAS_BURLA = 3; // com X-Forwarded-For falso, depois de bloqueado

// Uma execução só, com 1 "pessoa": o teste é de regra, não de carga.
export const options = {
  scenarios: { limite: { executor: 'per-vu-iterations', vus: 1, iterations: 1, maxDuration: '2m' } },
  thresholds: { checks: ['rate==1.0'] }, // qualquer verificação falhando reprova o teste
};

const corpo = JSON.stringify({ email: 'teste-limite@exemplo.invalid', password: 'senha-errada-de-teste' });
const cabecalhos = {
  'Content-Type': 'application/json',
  Origin: BASE_URL, // a rota só aceita chamadas vindas do próprio site
};

function tentar(extras, nome) {
  return http.post(`${BASE_URL}/api/acesso/situacao`, corpo, {
    headers: Object.assign({}, cabecalhos, extras),
    tags: { name: nome },
  });
}

function ipFalso() {
  const n = () => Math.floor(Math.random() * 254) + 1;
  return `${n()}.${n()}.${n()}.${n()}`;
}

export default function () {
  // 1) Tentativas normais até passar do limite.
  const status = [];
  for (let i = 1; i <= TENTATIVAS; i++) {
    const res = tentar({}, 'tentativa_normal');
    status.push(res.status);
    console.log(`Tentativa ${String(i).padStart(2)}: ${res.status === 429 ? '429 (bloqueado)' : res.status}`);
    sleep(0.3);
  }

  const primeiroBloqueio = status.indexOf(429); // -1 se nunca bloqueou
  const naoHouveErro = status.every((s) => s === 200 || s === 429);

  check(status, {
    'respostas esperadas (200 ou 429, sem erro 4xx/5xx)': () => naoHouveErro,
    [`bloqueou até a tentativa ${LIMITE + 1}`]: () => primeiroBloqueio !== -1 && primeiroBloqueio <= LIMITE,
    'continuou bloqueado depois do primeiro 429': () =>
      primeiroBloqueio !== -1 && status.slice(primeiroBloqueio).every((s) => s === 429),
  });

  // 2) Já bloqueado: tenta burlar fingindo ser outro endereço de internet.
  const burla = [];
  for (let i = 1; i <= TENTATIVAS_BURLA; i++) {
    const res = tentar({ 'X-Forwarded-For': ipFalso() }, 'tentativa_burla');
    burla.push(res.status);
    const rotulo = res.status === 429 ? '429 (bloqueado, ótimo)' : res.status === 200 ? '200 (PASSOU, problema!)' : String(res.status);
    console.log(`Burla      ${i}: ${rotulo}`);
    sleep(0.3);
  }
  check(burla, {
    'não dá para burlar o limite com endereço falso': () => burla.every((s) => s === 429),
  });

  // Dicas quando algo sai do esperado.
  if (status.some((s) => s === 403)) {
    console.warn('Recebeu 403: o site recusou a origem. Confira se o BASE_URL é exatamente o endereço do site (com https://).');
  }
  if (primeiroBloqueio === 0) {
    console.warn('Já começou bloqueado: provavelmente rodou há menos de 10 minutos. O limite está ativo; espere 10 min para o teste completo.');
  }
}

function listarChecks(grupo, linhas) {
  for (const c of grupo.checks || []) linhas.push(`   ${c.fails === 0 ? '✓' : '✗'} ${c.name}`);
  for (const g of grupo.groups || []) listarChecks(g, linhas);
  return linhas;
}

export function handleSummary(data) {
  const ok = (data.metrics.checks?.values.rate ?? 0) === 1;
  return {
    stdout: `
========================================================
 LIMITE DE TENTATIVAS (tela de login)
========================================================
${listarChecks(data.root_group, []).join('\n')}

 Resultado: ${ok ? '✅ APROVADO: o limite funciona e não dá para burlar' : '❌ REPROVADO: veja acima a verificação marcada com ✗'}
 Lembrete : seu endereço fica bloqueado nessa rota por 10 min.
========================================================
`,
  };
}
