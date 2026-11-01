# load-tests — teste de carga e capacidade (k6)

Rotina para medir o limite de usuários simultâneos **no seu próprio ambiente**
(de preferência staging ou um deploy de preview). Não é ataque: é um teste de
capacidade da sua infraestrutura.

## Pré-requisito
Instale o k6: https://grafana.com/docs/k6/latest/set-up/install-k6/

## Dois scripts (medem coisas diferentes)
- **`k6-carga.js`**: acessa as páginas públicas do Next.js (`/`, `/categorias`,
  `/lojas`) e confirma que o webhook do Mercado Pago recusa chamadas sem
  assinatura (401). Mede a Vercel e a renderização no servidor.
- **`k6-supabase-db.js`**: chama direto as funções públicas da vitrine no
  Supabase (`browse_storefront_products`, `search_storefront_products`,
  `list_storefront_shops`), com os mesmos parâmetros do app. **Este mede o banco**
  (pool de conexões, RLS, consultas do catálogo).

## Teste do limite de tentativas (rate limit)
**`k6-rate-limit.js`** confere, no site no ar, que a tela de login recusa a
pessoa depois de 10 tentativas em 10 minutos (resposta 429) e que não dá para
burlar o limite fingindo outro endereço de internet. Usa um e-mail que não
existe, não cria nada e faz só ~16 requisições. Não precisa de chave: só o
endereço do site.

```bash
k6 run -e BASE_URL="https://SEU-SITE" load-tests/k6-rate-limit.js
```

Depois de rodar, o seu endereço fica bloqueado nessa rota por 10 minutos (o
login continua funcionando). Para repetir o teste completo, espere 10 minutos.

## Quais chaves usar
Só duas coisas, em **Settings → API** do projeto Supabase de staging:
- **Project URL** (`https://xxxxx.supabase.co`)
- **anon / publishable key** (pública, respeita o RLS)

**Nunca** use a `service_role` nem a senha do banco nestes testes.

## Rodar
Comece sempre pelo `smoke`; se passar limpo, suba para `load`, `stress` e `spike`.

```bash
k6 run -e SCENARIO=smoke -e BASE_URL="https://seu-preview.vercel.app" load-tests/k6-carga.js
```

```bash
k6 run -e SCENARIO=smoke -e SUPABASE_URL="https://SEU-PROJETO.supabase.co" -e SUPABASE_ANON_KEY="sb_publishable_..." load-tests/k6-supabase-db.js
```

No PowerShell (Windows) o comando é o mesmo, numa linha só, rodado de dentro da
pasta do repositório.

Enquanto o `stress` roda, acompanhe o banco no SQL Editor do staging:

```sql
select count(*) as conexoes_ativas from pg_stat_activity where state = 'active';
show max_connections;
```

## Resultado
Cada execução imprime um resumo e grava `load-tests/resultado-*.json` (no
`.gitignore`). O **limite de simultâneos** é o nº de VUs no momento em que a
latência p95 passa de ~800 ms (web) / ~1 s (banco) e as falhas passam de ~1%.

## Dados para o teste
Um banco de staging vazio devolve listas vazias, e a carga fica irreal. Cadastre
algumas lojas e produtos de teste no staging pelo próprio app antes de rodar.
Não copie dados de produção (dados pessoais / LGPD).

## ⚠️ Antes de rodar em produção
Vercel e Supabase podem tratar carga alta como abuso e suspender a conta. Use
staging, ou avise os provedores. Nunca aponte para infraestrutura de terceiros.
