# Sandbox local para auditoria

**Somente para testes locais.** Nada aqui deve ser executado no projeto
Supabase de produção (o `aplicar.sh` recusa URLs que não sejam locais).

O repositório não contém o schema completo da Artenós. Para navegar pela
plataforma com dados, montamos um Supabase local com:

1. todos os scripts SQL do repositório, na ordem de `ordem.txt`;
2. `05_base_produtos.sql` e `25_base_pedidos.sql`: tabelas mínimas ausentes
   (`products`, `cart_items`, colunas de `orders`, `order_items`,
   `order_status_history`, `artisan_store_settings`);
3. `90_rpcs_ausentes.sql`: RPCs usadas pelo front e ausentes no repositório
   (catálogo, loja pública, pedidos, encomendas...). **O comportamento foi
   inferido do código** e não é a implementação real. Em seguida, o
   `aplicar.sh` roda `supabase/conversas_produtos_topicos.sql` e
   `supabase/contexto_conversas_produtos.sql` (conversas por peça), que
   dependem de `conversations.custom_order_request_id`, criada no passo 3;
4. `seed.py`: contas de teste, imagens ilustrativas geradas por
   `gen_images.py` (sem fotos de terceiros), produtos, pedidos e mensagens.

## Passo a passo

```bash
npx supabase@2 init
```

Deixe `[realtime] enabled = true` em `supabase/config.toml` (as mensagens
chegam em tempo real por ele).

```bash
SUPABASE_INTERNAL_IMAGE_REGISTRY=docker.io npx supabase@2 start -x studio,imgproxy,logflare,vector,supavisor,edge-runtime,mailpit,postgres-meta
```

```bash
./aplicar.sh
```

```bash
python3 gen_images.py img
```

```bash
SRK=<SERVICE_ROLE_KEY local exibida pelo supabase start> python3 seed.py
```

Depois, no `.env.local` do app (ignorado pelo Git):

```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<PUBLISHABLE_KEY local>
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

## Contas de teste (senha `Artenos@2026`)

| E-mail | Perfil |
| --- | --- |
| `cliente@sandbox.artenos.test` | cliente com 3 pedidos |
| `barro@sandbox.artenos.test` | artesã aprovada (Ateliê Fio de Barro) |
| `linha@sandbox.artenos.test` | artesã aprovada, nome de loja muito longo |
| `sementes@sandbox.artenos.test` | artesã aprovada, não aceita encomendas |
| `pendente@sandbox.artenos.test` | artesã em análise |
| `admin@sandbox.artenos.test` | administradora |

## Limitações conhecidas

- A Edge Function `calculate-shipping` não roda (sem `edge-runtime` e sem
  token do Melhor Envio): o carrinho mostra o estado "frete indisponível".
- Mercado Pago, Resend e ViaCEP não são chamados de verdade.
- O seed aprova artesãs direto em `profiles` com gatilhos desativados; por
  isso a fila do admin mostra essas lojas ainda como "pendentes".
