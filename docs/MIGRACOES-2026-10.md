# Migrações de outubro/2026 — ordem de execução

Rode no SQL Editor do Supabase, **nesta ordem**, uma de cada vez (cada arquivo é uma transação;
se der erro, nada daquele arquivo é aplicado). Todas podem ser executadas de novo; se reexecutar
uma, reexecute também as seguintes.

| # | Arquivo | Item |
|---|---|---|
| 1 | `supabase/migrations/20261029_validacao_textos_loja.sql` | 8 – história da loja com texto real |
| 2 | `supabase/migrations/20261029_disponibilidade_estoque.sql` | 2 – pronta entrega × sob encomenda |
| 3 | `supabase/migrations/20261029_moderacao_chat.sql` | 5 – filtro de termos e denúncias |
| 4 | `supabase/moderacao_termos.sql` | 5 – lista de termos (gerada de `config/termos-bloqueados.json`) |
| 5 | `supabase/migrations/20261029_descricao_observacoes.sql` | 11 – descrição e observações |
| 6 | `supabase/migrations/20261029_comprar_agora.sql` | 9 – comprar agora |
| 7 | `supabase/migrations/20261029_avaliacoes.sql` | 6 – avaliações |
| 8 | `supabase/migrations/20261029_status_encomenda.sql` | 10 – status de produção |
| 9 | `supabase/migrations/20261029_central_ajuda.sql` | 7 – chamados e limite de envios |
| 10 | `supabase/migrations/20261029_seguranca_privacidade.sql` | 3 – acesso, anonimização, limites |
| 11 | `supabase/migrations/20261029_notas_fiscais.sql` | 12 – fila de nota fiscal |

Depois:

1. Publique de novo a Edge Function: `supabase functions deploy calculate-shipping` (aceita o modo "comprar agora").
2. Rode `supabase/validar_migracoes.sql` (só leitura): todas as linhas devem vir "OK"; as que faltarem aparecem no topo com o script a rodar de novo.
3. Rode `supabase/auditoria_rls.sql` (só leitura) e confira o resultado.
4. Configure os agendamentos diários/periódicos (`/api/cron/manutencao`, `/api/cron/avaliacoes`, `/api/cron/notas-fiscais`).

A migração 2 confere se existe `public.artisan_store_settings(accepts_custom_orders)`; se não existir, ela
para com uma mensagem e nada é alterado.

## Testes SQL

Os arquivos em `supabase/tests/` rodam **somente em banco local de teste** (o sandbox de
`docs/redesign/sandbox/`), cada um dentro de uma transação desfeita no final:

```bash
for t in disponibilidade_estoque moderacao_chat comprar_agora avaliacoes status_encomenda seguranca_privacidade notas_fiscais; do psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/$t.sql; done
```
