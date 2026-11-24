# Dossiê para revisão jurídica: Termos de Uso e Política de Privacidade

Atualizado em 24/11/2026. Este documento acompanha as páginas `/termos` e `/privacidade` e descreve
**o que o sistema faz hoje**, para que o advogado valide os textos com base na prática real.

## 1. Dados da empresa

| Item | Valor | Situação |
|---|---|---|
| Nome fantasia | Artenós | definido |
| Razão social | — | **pendente** (`NEXT_PUBLIC_COMPANY_LEGAL_NAME`) |
| CNPJ | 70.263.461/0001-32 | definido |
| Endereço da sede | — | **pendente** (`NEXT_PUBLIC_COMPANY_ADDRESS`) |
| Telefone e WhatsApp de atendimento | (11) 92515-0088 | definido |
| E-mail de atendimento | — | **pendente** (`NEXT_PUBLIC_SUPPORT_EMAIL`) |
| Encarregado (DPO): nome e e-mail | — | **pendente** (`NEXT_PUBLIC_DPO_NAME`, `NEXT_PUBLIC_DPO_EMAIL`) |

Os campos pendentes aparecem como "a definir" nas páginas até serem preenchidos nas variáveis de ambiente.

## 2. Inventário de dados pessoais (banco de dados)

| Tabela / local | Dados pessoais | Finalidade | Quem acessa | Retenção |
|---|---|---|---|---|
| `profiles` | nome, e-mail, CPF/CNPJ, telefone, CEP, endereço, foto (opcional), data de aceite dos Termos; lojas: data de nascimento, nome da loja, especialidade, história, fotos | conta, compras, entrega, análise de lojas | a própria pessoa; equipe | enquanto a conta existir; anonimizado 30 dias após pedido de exclusão |
| Supabase Auth (`auth.users`) | e-mail, hash bcrypt da senha, identidade Google (nome, e-mail, foto) | login | serviço de autenticação | idem |
| Storage `artenos-profile-avatars` e fotos de loja/peças | imagens enviadas | perfil e vitrine | público (vitrine) / dono | até remoção |
| `artisan_applications`, `artisan_application_audit` | dados do pedido de abertura de loja e histórico da análise | aprovação de lojas | equipe | enquanto necessário |
| `payout_accounts` | tipo e chave Pix da loja | repasses | loja; equipe; servidor | apagada na exclusão definitiva |
| `seller_fiscal_profiles` | PF/PJ, CPF/CNPJ, razão social, regime tributário, IE/IM, endereço fiscal | nota fiscal | loja; equipe | prazo fiscal |
| `checkouts`, `checkout_items`, `orders`, `payouts`, `invoice_jobs` | itens, valores, endereço de entrega, frete, rastreio, ID/situação do pagamento, tarifas, repasses, dados da nota | compra, pagamento, repasse, nota fiscal | comprador; loja do pedido; equipe | prazos legais (em regra 5 anos), mesmo após exclusão |
| `conversations`, `messages` | mensagens entre comprador e loja | atendimento do pedido | participantes; equipe em denúncias | enquanto a conta existir |
| `moderation_attempts` | textos bloqueados pelo filtro de termos | moderação | equipe | 6 meses (limpeza automática) |
| `conversation_reports`, `moderation_suspensions` | denúncias, motivo e prazo de suspensão | segurança | equipe | sem prazo automático (**definir**) |
| `product_reviews`, `store_reviews` | nota, comentário, data; primeiro nome público | avaliações | público | enquanto a conta existir |
| `storefront_favorites`, carrinho, `buy_now_intents`, `shipping_quotes` | preferências e intenção de compra | uso da loja | a própria pessoa | apagado na exclusão |
| `notifications` | avisos da plataforma | comunicação | a própria pessoa | apagado na exclusão |
| `support_tickets` | nome, e-mail, assunto, mensagem, número do pedido | atendimento | equipe | sem prazo automático (**definir**) |
| `access_logs` | IP, navegador, data/hora de login, saída, troca de senha, exportação e exclusão | Marco Civil art. 15, segurança | só servidor | 12 meses (limpeza automática) |
| `rate_limit_events` | contadores de envio | anti-abuso | só servidor | curto prazo |
| `admin_user_audit`, `platform_fee_audit` | quem da equipe alterou papéis e tarifas | auditoria interna | equipe | sem prazo automático |

**Não guardamos:** número completo do cartão, validade e CVV (vão direto ao Mercado Pago); a senha em texto.

## 3. Compartilhamento com terceiros (operadores)

Mercado Pago (pagamento e repasses), Melhor Envio e transportadoras (frete), ViaCEP (CEP), Supabase (banco,
autenticação e arquivos), provedor de hospedagem (Vercel), Gmail/Google Workspace ou Resend (e-mails), Google
(login social), Cloudflare Turnstile (anti-robô, quando ativo), e a loja vendedora (dados do pedido; CPF/CNPJ e
e-mail do comprador quando houver nota fiscal). Não há venda de dados nem cookies de publicidade/análise.

## 4. Medidas de segurança implementadas

- HTTPS obrigatório com HSTS; X-Frame-Options/`frame-ancestors`, nosniff, Referrer-Policy, Permissions-Policy; CSP (em modo relatório, com opção de bloqueio).
- Senhas com hash bcrypt no Supabase Auth; senha forte obrigatória; limite de tentativas de login; verificação anti-robô opcional.
- Row Level Security em todas as tabelas: cada pessoa vê os próprios pedidos e conversas; cada loja só os próprios pedidos (`supabase/auditoria_rls.sql` confere).
- Chaves secretas só no servidor; webhook do Mercado Pago com assinatura validada.
- Proteção CSRF (verificação de origem) nas rotas de checkout, ajuda, exclusão de conta e registro de acesso.
- Limites de envio: chat 20/min, avaliações 20/h, denúncias e orçamentos 10/h, Central de Ajuda 5/h por IP e 3/h por e-mail, exportação de dados 5/h.
- Registro de acessos por 12 meses; exportação dos próprios dados e exclusão em duas etapas (30 dias) em Meu perfil.
- Suspensão de conta e bloqueio por idade aplicados no banco (gatilhos), não só na tela.

## 5. Pontos que pedem decisão ou validação do advogado

1. **Razão social, endereço e DPO**: preencher; a LGPD (art. 41) exige divulgar identidade e contato do encarregado.
2. **Papel de controlador da loja** (Política, seção 2): confirmar a divisão Artenós controladora / loja controladora.
3. **Peças sob medida e direito de arrependimento** (Termos, seção 7): o texto preserva o art. 49 do CDC e só remete a "condições próprias"; validar redação.
4. **Responsabilidade do marketplace** (Termos, seções 2 e 13): avaliar a responsabilidade solidária na cadeia de consumo (CDC arts. 7º e 25) frente ao texto.
5. **Aviso prévio de mudança de tarifas** (Termos, seção 8): o texto promete aviso com antecedência; definir o prazo (ex.: 30 dias). O sistema ainda não envia esse aviso automaticamente.
6. **Menores de 18 comprando com responsável** (ambos): o sistema não confere a idade de compradores; validar se a redação é suficiente.
7. **Data de nascimento declarada** para vendedores: não é conferida em base oficial (ver `docs/IDADE-MINIMA.md`).
8. **Prazos de retenção sem limite automático**: denúncias, suspensões, chamados, auditorias internas e mensagens; definir prazos.
9. **Transferência internacional** (Política, seção 7): confirmar a região do Supabase e da Vercel e a base legal (art. 33).
10. **Foro** (Termos, seção 14): está "domicílio do consumidor"; definir foro para relações com lojas (B2B).
11. **Prazo de resposta a titulares**: a Política diz 15 dias; confirmar.
12. **Nota fiscal**: em marketplace, a NF-e do produto é da loja; a Artenós emite NFS-e da tarifa de intermediação (ver `docs/NOTA-FISCAL.md`); confirmar com a contabilidade.

## 6. Onde fica cada coisa

- Textos: `app/termos/page.tsx`, `app/privacidade/page.tsx`
- Dados da empresa e datas de atualização: `lib/site-config.ts` e variáveis `NEXT_PUBLIC_*` (`.env.example`)
- Detalhes técnicos: `docs/PRIVACIDADE-SEGURANCA.md`, `docs/IDADE-MINIMA.md`, `docs/NOTA-FISCAL.md`
