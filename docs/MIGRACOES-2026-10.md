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

## Novembro/2026 — fotos, variações e senha forte

| Arquivo | O que faz |
|---|---|
| `supabase/migrations/20261113_fotos_variacoes_produto.sql` | Até 3 fotos por peça (capa + 2) e variações (cor, tamanho, estilo...) com preço e estoque por opção; carrinho, "Comprar agora", checkout, cancelamento e pedido passam a usar a opção escolhida |

- Rode **depois** de `20261112_notificacoes_lidas_por_conversa.sql`. Pode ser repetida. Exige Postgres 15+ (todo projeto Supabase atual).
- Ela troca `add_to_cart(uuid, integer)` e `start_buy_now(uuid, integer)` pelas versões com `p_variant_id` (opcional): publique o site junto com a migração.
- `products.stock` passa a ser a soma do estoque das opções e `products.price` o menor preço ("a partir de") quando a peça tem variações; peças sem variação continuam iguais.
- Teste local: `psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/fotos_variacoes_produto.sql`.

**Senha forte:** o site passa a exigir letra minúscula, maiúscula, número, símbolo e 8+ caracteres
(cadastro, redefinição e troca no perfil), com medidor de 4 barras. Para a regra valer também
fora do site, no Supabase marque **Authentication → Providers → Email → Password requirements:
"Lowercase, uppercase letters, digits and symbols"** e **Minimum password length: 8**.
Contas antigas continuam entrando com a senha atual; a regra vale ao criar ou trocar a senha.

## Novembro/2026 — idade mínima (18 anos) e custo por item

| Arquivo | O que faz |
|---|---|
| `supabase/migrations/20261114_data_nascimento.sql` | Idade mínima de 18 anos **só para vendedores**: data de nascimento no cadastro de loja e no pedido de abrir loja, bloqueio de lojas de menores e pedido da data, no próximo acesso, para lojas que já existiam (clientes não informam a data) |
| `supabase/migrations/20261115_custo_por_item.sql` | Custo fixo por item (R$ 4,00): caixa de seleção na calculadora e no cadastro da peça, com liga/desliga na tela Tarifa do painel |

- Rode as duas **depois** de `20261113_fotos_variacoes_produto.sql`, nessa ordem. Podem ser repetidas.
- Pode rodar antes de publicar o site: a versão antiga do site continua funcionando (cadastros sem a
  data nascem normalmente e a pessoa informa a data no primeiro acesso depois da publicação).
- Não rode `20261111_taxa_pagamento_calculadora.sql` de novo depois da `20261115`: ela recriaria as
  versões antigas de `save_pricing_calculation`/`update_my_pricing_calculation` e as chamadas ficariam
  ambíguas (`validar_migracoes.sql` avisa em "ordem dos scripts"; a correção é rodar a `20261115` de novo).
- Testes locais: `psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/data_nascimento.sql` e
  `psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/custo_por_item.sql`.
- Detalhes, limites e como corrigir uma data digitada errada: [`docs/IDADE-MINIMA.md`](IDADE-MINIMA.md).
- O custo por item nasce **desativado** (a loja escolhe no cadastro da peça se soma o valor). Ao ativar em **Administração → Tarifa → Custo por item**, ele passa a ser **obrigatório** em toda peça cadastrada ou editada — a loja não consegue desmarcar.
