# E-mail pelo Gmail (SMTP)

A Artenós envia dois tipos de e-mail. Os dois usam a **mesma conta Gmail**, mas
são configurados em lugares diferentes:

| Tipo | Exemplos | Onde configurar |
|---|---|---|
| E-mails de conta (Supabase Auth) | confirmar cadastro, **esqueci minha senha**, trocar e-mail, reautenticação | Painel do Supabase → SMTP |
| E-mails da plataforma | comprovante de pagamento, Central de Ajuda, avisos | Variáveis `SMTP_*` do servidor Next.js |

## 1. Preparar a conta Gmail

1. Use uma conta só da Artenós (ex.: `artenos.artesanato@gmail.com`), não uma pessoal.
2. Ative a **Verificação em duas etapas**: <https://myaccount.google.com/security>.
3. Crie uma **Senha de app**: <https://myaccount.google.com/apppasswords>
   (nome: "Artenós SMTP"). O Google mostra 16 letras (ex.: `abcd efgh ijkl mnop`).
   Copie **sem os espaços**. Essa senha é o `SMTP_PASSWORD`; a senha normal da conta não funciona.
4. Nunca coloque essa senha no código, no Git ou em variável `NEXT_PUBLIC_`.

Dados do servidor do Gmail:

- Host: `smtp.gmail.com`
- Porta: `465` (SSL) — ou `587` (STARTTLS)
- Usuário: o endereço Gmail completo
- Senha: a senha de app
- Remetente: **o mesmo endereço Gmail** (o Gmail troca ou recusa outro remetente)

Limite: cerca de **500 destinatários por dia** numa conta Gmail gratuita (por SMTP
o Google pode limitar antes disso). Ao passar, o envio é bloqueado por até 24 h —
inclusive o "esqueci minha senha". Quando o volume crescer, troque para Google
Workspace (2.000/dia) ou um serviço transacional (Resend, Brevo, SES) com domínio próprio.

## 2. Supabase Auth (esqueci minha senha, confirmação de cadastro)

No painel do Supabase:

1. **Authentication → Emails → SMTP Settings** → ative *Enable custom SMTP*:
   - Sender email: `artenos.artesanato@gmail.com` (o mesmo da conta)
   - Sender name: `Artenós`
   - Host: `smtp.gmail.com`
   - Port: `465`
   - Username: `artenos.artesanato@gmail.com`
   - Password: a senha de app de 16 letras
   - Minimum interval between emails: `60` segundos (padrão)
2. **Authentication → Rate Limits** → *Rate limit for sending emails*: com SMTP próprio o
   padrão é baixo (cerca de 30/hora). Ajuste para algo como `100` por hora, sem passar do limite diário do Gmail.
3. **Authentication → URL Configuration**:
   - Site URL: `https://SEU-DOMINIO` (o mesmo de `NEXT_PUBLIC_SITE_URL`)
   - Redirect URLs: adicione
     - `https://SEU-DOMINIO/redefinir-senha`
     - `https://SEU-DOMINIO/perfil`
     - `https://SEU-DOMINIO/vendedor/perfil`
     - `http://localhost:3000/**` (só para testar localmente)

   O link de "esqueci minha senha" vai para `/redefinir-senha`
   (`app/acesso/page.tsx`). Se a URL não estiver na lista, o Supabase manda a pessoa para a Site URL.
4. **Authentication → Emails → Templates**: troque os textos padrão (em inglês) pelos modelos abaixo.
5. Teste: em `/acesso`, clique em "Esqueci minha senha" com um e-mail cadastrado.
   Se não chegar, veja **Logs → Auth** no Supabase (erros `535` = usuário/senha de app errados).

### Modelos em português

**Reset Password** — assunto: `Redefina sua senha na Artenós`

```html
<h2>Redefinir senha</h2>
<p>Recebemos um pedido para redefinir a senha da sua conta na Artenós.</p>
<p><a href="{{ .ConfirmationURL }}">Criar uma nova senha</a></p>
<p>O link vale por pouco tempo e só pode ser usado uma vez. Se você não pediu, ignore este e-mail: sua senha continua a mesma.</p>
<p>Artenós — feito à mão, encontrado aqui</p>
```

**Confirm signup** — assunto: `Confirme seu e-mail na Artenós`

```html
<h2>Boas-vindas à Artenós</h2>
<p>Confirme seu endereço de e-mail para ativar a conta:</p>
<p><a href="{{ .ConfirmationURL }}">Confirmar meu e-mail</a></p>
<p>Se você não criou uma conta, ignore este e-mail.</p>
```

**Change Email Address** — assunto: `Confirme seu novo e-mail na Artenós`

```html
<h2>Confirmar troca de e-mail</h2>
<p>Confirme a troca de {{ .Email }} para {{ .NewEmail }}:</p>
<p><a href="{{ .ConfirmationURL }}">Confirmar novo e-mail</a></p>
```

**Reauthentication** — assunto: `Seu código de confirmação da Artenós`

```html
<h2>Código de confirmação</h2>
<p>Use este código para confirmar a alteração na sua conta: <strong>{{ .Token }}</strong></p>
<p>Se não foi você, troque sua senha.</p>
```

## 3. E-mails da plataforma (servidor Next.js)

Configure no `.env.local` e no painel da hospedagem (Vercel → Settings → Environment Variables):

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=artenos.artesanato@gmail.com
SMTP_PASSWORD=senhadeappsemespacos
EMAIL_FROM=Artenós <artenos.artesanato@gmail.com>
```

Com `SMTP_*` preenchido, `lib/email.ts` envia pelo Gmail; sem ele, cai no Resend
(`RESEND_API_KEY`), como antes. Reinicie o servidor depois de mudar as variáveis.

## Entregabilidade

- E-mails vindos de `@gmail.com` por SMTP costumam chegar, mas podem ir para Spam nas
  primeiras semanas. Peça aos testadores para marcar "Não é spam".
- Não envie e-mail de marketing por essa conta: denúncias de spam bloqueiam também os e-mails de senha.
- Quando tiver domínio próprio (ex.: `artenos.com.br`), migre para um remetente do domínio com SPF, DKIM e DMARC.

## Modelo visual dos e-mails de conta

O e-mail de confirmação de cadastro com a identidade da Artenós está em
`supabase/email-templates/confirmar-cadastro.html`. Para usar: Supabase →
Authentication → Emails → **Confirm signup** → cole o arquivo inteiro em
**Body** e use o assunto "Confirme seu e-mail na Artenós". As variáveis
`{{ .ConfirmationURL }}`, `{{ .Email }}` e `{{ .SiteURL }}` são preenchidas
pelo Supabase.

O de redefinição de senha está em `supabase/email-templates/redefinir-senha.html`:
Supabase → Authentication → Emails → **Reset password**, assunto
"Redefinir sua senha na Artenós".

O aviso de senha alterada está em `supabase/email-templates/senha-alterada.html`:
Supabase → Authentication → Emails → notificações de segurança → **Password
changed** (ative a notificação), assunto "Sua senha da Artenós foi alterada".
