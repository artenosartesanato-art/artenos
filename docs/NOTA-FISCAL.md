# Nota fiscal por compra

## O que verifiquei sobre o Mercado Pago

Não encontrei API pública do Mercado Pago para **emitir** NF-e ou NFS-e. O que o Mercado Pago oferece é
um emissor no painel (Sistema de Gestão, para NF-e/NFC-e), sem endpoint documentado para integração.
A busca foi feita em 29/10/2026; o site do Mercado Pago não abriu neste ambiente, então confirme em
<https://www.mercadopago.com.br/developers> antes de decidir. Por isso o código **não** tem um
`MercadoPagoInvoiceProvider` com endpoints inventados.

Ponto legal importante: em marketplace, a NF-e do produto é emitida por **cada loja** (a vendedora),
não pela Artenós. A Artenós emite, no máximo, NFS-e da própria tarifa de intermediação. Artesãs sem
CNPJ (pessoa física) em geral não emitem NF-e; MEI emite. Confirme as regras com uma contabilidade.

## O que está pronto

- `lib/invoices/types.ts`: interface `InvoiceProvider` (`emitir`, `consultar`, `cancelar`) e o rascunho `InvoiceDraft`;
- `lib/invoices/build-draft.ts`: monta o rascunho com emitente (loja: CPF/CNPJ, razão social, regime, IE/IM, endereço),
  destinatário (nome, CPF/CNPJ, e-mail, endereço de entrega), itens (descrição, quantidade, valor, NCM, CFOP, origem),
  frete, desconto, total e o ID do pagamento no Mercado Pago; lista o que faltar;
- `lib/invoices/providers.ts`: `manual` (a loja emite e informa número/link em Vendas) e `fake` (sandbox/testes);
- fila `invoice_jobs`: o pedido pago (confirmado pelo webhook do Mercado Pago, com assinatura validada) entra na fila
  uma única vez; `/api/cron/notas-fiscais` processa com retentativas (5 tentativas, intervalo crescente) e grava
  `orders.nf_status`, `nf_numero`, `nf_url_pdf`, `nf_xml`, `nf_erro`;
- dados fiscais da loja e NCM/CFOP das peças em **Painel da loja › Dados fiscais**;
- `invoice_settings.required = true` impede publicar peça sem dados fiscais completos.

## Configuração

- `INVOICE_PROVIDER=off` (padrão), `manual` ou `fake`;
- agendar `GET /api/cron/notas-fiscais` a cada 10–15 min com `Authorization: Bearer <CRON_SECRET>`;
- quando a nota for obrigatória: `update public.invoice_settings set required = true where id = 1;`

## Para emitir automaticamente (alternativas)

Escolha um emissor com API e suporte a vários emitentes (uma empresa por loja), por exemplo NFe.io,
Focus NFe, PlugNotas ou Nota Gateway (antigo eNotas). A integração é uma classe nova que implementa
`InvoiceProvider` e entra em `invoiceProviderFromEnv`; credenciais só em variáveis de ambiente, com modo sandbox.
Cada loja precisa ter certificado digital/credenciamento no emissor escolhido.
