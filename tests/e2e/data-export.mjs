// "Baixar meus dados": cada pessoa só baixa os próprios dados.
//
//   E2E_BASE_URL=http://localhost:3000 E2E_SUPABASE_URL=https://xxx.supabase.co E2E_SUPABASE_KEY=sb_publishable_... \
//   E2E_USER_A=a@ex.com:senha E2E_USER_B=b@ex.com:senha node tests/e2e/data-export.mjs
//
// Cada conta exporta UMA vez (o limite é 1 exportação a cada 10 minutos).
const base = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3100";
const supabase = process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:59999";
const key = process.env.E2E_SUPABASE_KEY ?? "sb_publishable_teste";
const accounts = [process.env.E2E_USER_A, process.env.E2E_USER_B];
if (accounts.some((account) => !account)) {
  console.error("Informe E2E_USER_A e E2E_USER_B (email:senha).");
  process.exit(2);
}

async function signIn(account) {
  const [email, ...rest] = account.split(":");
  const response = await fetch(`${supabase}/auth/v1/token?grant_type=password`, {
    method: "POST", headers: { apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: rest.join(":") }),
  });
  const body = await response.json();
  if (!body.access_token) throw new Error(`Não foi possível entrar com ${email}`);
  return { email, token: body.access_token, id: body.user.id };
}

const exportFor = (token, query = "") => fetch(`${base}/api/conta/exportar?formato=json${query}`, {
  headers: token ? { Authorization: `Bearer ${token}` } : {},
});

const [a, b] = [await signIn(accounts[0]), await signIn(accounts[1])];
let failures = 0;
const check = (ok, message) => { console.log(`${ok ? "ok  " : "FALHA"} ${message}`); if (!ok) failures += 1; };

const anonymous = await exportFor(null);
check(anonymous.status === 401, `sem sessão → ${anonymous.status}`);

// A tenta pedir os dados de B pelo endereço: a rota ignora e devolve os de A.
const asA = await exportFor(a.token, `&id=${b.id}&user_id=${b.id}`);
const dataA = await asA.json();
check(asA.ok && dataA.conta?.email === a.email, `A recebe os próprios dados (${dataA.conta?.email})`);
check(!JSON.stringify(dataA).includes(b.email), "nada de B aparece no arquivo de A");

const asB = await exportFor(b.token);
const dataB = await asB.json();
check(asB.ok && dataB.conta?.email === b.email, `B recebe os próprios dados (${dataB.conta?.email})`);

process.exit(failures ? 1 : 0);
