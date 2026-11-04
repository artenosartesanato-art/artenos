# Split de pagamentos (caminho A) — plano em estudo

> Situação: **decidido seguir o caminho A, ainda não implementado.** Este documento
> reúne o que já se sabe, o que falta validar e a ordem de implementação.
> Nada aqui está ligado no site: hoje todo pagamento continua caindo na conta
> do Mercado Pago da Artenós e os repasses às lojas são feitos à mão.

## A ideia

Cada loja conecta **a própria conta do Mercado Pago** à Artenós uma única vez
(botão "Conectar Mercado Pago", autorização OAuth na tela do Mercado Pago). A
partir daí, cada cobrança é feita **em nome da loja**, informando a comissão da
Artenós (`application_fee`). No momento do pagamento o Mercado Pago divide
sozinho:

```
Cliente paga R$ 100,00 em peças + R$ 20,00 de frete = R$ 120,00
 ├─ Mercado Pago retira a taxa dele (ex.: Pix 0,99% de R$ 120 = R$ 1,19) do valor da loja
 ├─ Artenós recebe a comissão: 8% de R$ 100 (só peças) = R$ 8,00
 └─ Loja recebe o resto: R$ 120,00 − R$ 1,19 − R$ 8,00 = R$ 110,81
```

Vantagens: sem repasse manual nem Pix para terceiros; o dinheiro da loja não
passa pela conta da Artenós; reembolsos são divididos pelo próprio Mercado Pago.

## O que muda em relação a hoje

| Hoje (conta central) | Com split |
| --- | --- |
| Uma cobrança por compra, na conta da Artenós | **Uma cobrança por loja**, na conta de cada loja |
| Repasse manual por Pix (`payouts`) | Sem repasse: o Mercado Pago divide na hora |
| Taxa do Mercado Pago rateada entre as lojas | Cada loja paga a taxa da própria cobrança |
| Loja só cadastra a chave Pix | Loja conecta a conta do Mercado Pago (obrigatório para vender) |

## Já preparado no código (sem efeito no site)

- `lib/payment-split.ts`: separa a compra em uma cobrança por loja e calcula a
  comissão (só sobre as peças, arredondada ao centavo). Testes em
  `tests/unit/payment-split.test.ts`.
- `lib/mercadopago.ts`: `mpRequest` aceita `accessToken` para cobrar em nome da
  loja. Sem ele, continua usando a conta da Artenós (comportamento atual).

## A validar antes de implementar

1. **Pix no split**: testar no ambiente de testes do Mercado Pago se o Pix
   aceita `application_fee` com o token da loja (a documentação não deixa claro).
2. **Contador**: confirmar que a Artenós fatura só a comissão (8%) e como emitir
   nota da comissão; a loja emite a nota da venda.
3. **Mercado Pago (comercial)**: criar a aplicação de marketplace, confirmar
   taxas e prazos de liberação de saldo para as lojas.
4. **Carrinho com várias lojas**: no Pix, um QR Code por loja (o cliente paga 2
   vezes) ou limitar o pagamento a uma loja por vez? No cartão, várias cobranças
   em sequência. Decidir a experiência.
5. **Prazo de segurança**: liberar o saldo da loja só depois da entrega + 7 dias
   (direito de arrependimento) — conferir se o Mercado Pago permite configurar.
6. **Lojas sem conta no Mercado Pago**: exigir a conexão para publicar peças?
   Período de transição com o modelo atual?

## Ordem de implementação (quando aprovado)

1. **Aplicação no Mercado Pago**: criar a app de marketplace e guardar
   `MP_CLIENT_ID`, `MP_CLIENT_SECRET` e a URL de retorno nas variáveis da Vercel.
2. **Conectar conta (OAuth)**:
   - tabela `seller_payment_accounts` (loja, id do usuário no Mercado Pago,
     tokens **criptografados**, validade, situação) — lida só pelo servidor;
   - botão "Conectar Mercado Pago" em Minha loja e rota de retorno
     (`/api/mercadopago/oauth/callback`) que troca o código pelos tokens;
   - renovação automática dos tokens (tarefa agendada) e aviso quando a conexão
     cair.
3. **Checkout por loja**: criar uma cobrança por loja com o token dela e
   `application_fee` de `chargesByStore`; guardar cada pagamento ligado à compra.
4. **Avisos do Mercado Pago (webhook)**: identificar a loja de cada aviso e
   consultar o pagamento com o token dela; reembolso e contestação por loja.
5. **Painel**: lojas conectadas/pendentes; repasses manuais só para quem ainda
   estiver no modelo antigo.
6. **Testes**: ambiente de testes do Mercado Pago com contas de teste (loja e
   comprador), Pix e cartão, reembolso total e parcial, token expirado.
7. **Ligar**: variável `PAYMENTS_MODE=split`, primeiro para lojas piloto.

## Referências

- Mercado Pago — integrar marketplace (split):
  https://www.mercadopago.com.br/developers/pt/docs/split-payments/integration-configuration/integrate-marketplace
- Mercado Pago — split 1:1:
  https://www.mercadopago.com.br/developers/pt/docs/split-payments/split-1-1/integration-configuration/integrate-marketplace
