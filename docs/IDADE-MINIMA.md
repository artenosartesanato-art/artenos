# Idade mínima (18 anos) e data de nascimento — só para vendedores

A idade mínima de 18 anos vale **só para quem vende** (contas de loja). Clientes
(compradores) não informam a data de nascimento e não passam pela regra. Desde a migração
`supabase/migrations/20261114_data_nascimento.sql`:

- **Cadastro novo de loja** (com e-mail e senha ou com Google): a data de nascimento é
  obrigatória. Menor de 18 não cria a loja — o site avisa no campo e o banco recusa de
  novo ao criar o profile (gatilho `profile_birth_date_on_insert`). O cadastro de
  cliente não tem o campo.
- **Cliente que pede para abrir loja** (Perfil → Venda na Artenós): o formulário pede a
  data, se ainda não houver. Menor de 18 não envia o pedido e a conta de cliente segue
  normal (`set_my_birth_date` recusa sem gravar; o gatilho `seller_upgrade_age_guard`
  em `artisan_applications` confere de novo).
- **Loja que já existia**: no próximo acesso aparece um aviso que cobre a tela e só sai
  depois de a data ser informada (`components/age-gate.tsx` → `set_my_birth_date`). As
  páginas de Termos, Privacidade e Ajuda continuam abertas.
- **Loja que declara menos de 18**: o site pede uma confirmação (para evitar bloqueio
  por erro de digitação) e, confirmada, a conta fica **bloqueada até a pessoa completar
  18 anos**. Ela entra e navega, mas o banco recusa compras, favoritos, mensagens,
  avaliações e alterações na loja (gatilho `account_age_guard`, nas mesmas tabelas da
  suspensão).
- A data é informada uma única vez. A própria pessoa não altera depois (a coluna fica
  fora do grant de `update` de `profiles`).

## A data é declarada, não conferida

O site **não confere** a data com uma fonte oficial: vale o que a pessoa declara (é o
que a maioria dos marketplaces faz). Não existe consulta pública e gratuita que confirme
a data de nascimento de um CPF. As opções são pagas e exigem contrato:

| Serviço | O que confere | Observação |
|---|---|---|
| Serpro — Consulta CPF | Nome, situação cadastral e data de nascimento do CPF na Receita Federal | Fonte oficial; cobrança por consulta, contrato com o Serpro |
| Serpro — Datavalid | Confere se nome, CPF e data de nascimento batem (e biometria facial, opcional) | Fonte oficial; devolve "confere / não confere" |
| Birôs e intermediários (Serasa, BigDataCorp, idwall, Unico...) | Dados cadastrais e validação de identidade | Mais simples de contratar; preço por consulta |

Para ligar uma dessas consultas depois, o ponto certo é o servidor (uma rota em
`app/api/`, com a chave do serviço só no servidor), chamada antes de `set_my_birth_date`
e no cadastro: comparar a data declarada com a devolvida para o CPF. O CPF e a data já
ficam em `profiles` (`document`, `birth_date`). Contas com CNPJ não têm data de
nascimento na Receita: nelas a data continua sendo a declarada pelo responsável.

## Rotinas da equipe (SQL Editor do Supabase)

Quantas lojas ainda não informaram a data e quantas estão bloqueadas:

```sql
select count(*) filter (where birth_date is null) as sem_data,
       count(*) filter (where birth_date is not null and public.age_in_years(birth_date) < 18) as bloqueadas
from public.profiles where account_type = 'artisan';
```

A pessoa digitou o ano errado e ficou bloqueada (ou precisa corrigir a data): apague a
data e o site volta a pedir no próximo acesso.

```sql
update public.profiles set birth_date = null, age_blocked_at = null where email = 'pessoa@exemplo.com';
```

Contas da equipe (administração) não passam pelo aviso.
