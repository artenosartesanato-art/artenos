# Login com Google, conclusão do cadastro e recuperação de senha

## Como funciona

1. **Continuar com o Google** aparece em Entrar, Criar conta e Vender
   (`components/google-button.tsx`). O clique guarda na aba o perfil
   escolhido (cliente/artesã) e para onde voltar, e chama
   `supabase.auth.signInWithOAuth({ provider: "google" })` com
   `prompt=select_account` (a pessoa sempre escolhe a conta).
2. O Google devolve para o Supabase, que devolve para **`/acesso/google`**.
   A página lê a sessão e consulta `my_signup_status()`:
   * administração → `/administracao`;
   * cadastro completo → área do perfil (artesã aprovada `/vendedor`,
     em análise `/cadastro-em-analise`, cliente → página de onde veio ou `/`);
   * sem cadastro → **`/concluir-cadastro?perfil=…`**.
3. **Conclusão do cadastro**: nome, e-mail e foto vêm do Google (o e-mail não
   é digitado). A tela pede só o que falta, com as mesmas regras do cadastro
   tradicional: CPF (ou CPF/CNPJ para loja), telefone com DDD, endereço com
   CEP, termos e, para loja, nome, especialidade e história (com opção de
   cadastro assistido). **Não há senha**: a conta continua entrando pelo
   Google. Se quiser também entrar com senha, a pessoa usa "Esqueceu sua
   senha?" e cria uma pelo link do e-mail.
4. `complete_oauth_signup` (banco, `supabase/login_google.sql`) valida tudo
   de novo (CPF/CNPJ com dígitos, telefone, CEP, UF, termos, CPF e e-mail
   únicos), grava o profile **da própria conta** (`auth.uid()`) e usa o
   e-mail da conta, nunca o do navegador. Loja nasce em análise e entra na
   fila de aprovação.

### Cadastro incompleto

* Conta sem profile = cadastro incompleto. O site leva para
  `/concluir-cadastro` em qualquer página (exceto acesso, termos,
  privacidade e redefinir senha) — `components/profile-completion-guard.tsx`.
* O banco também recusa: carrinho, pedidos, mensagens, notificações e
  encomendas exigem profile.
* Sair antes de concluir é permitido; ao entrar de novo (Google ou senha),
  volta para a conclusão com o perfil escolhido (guardado na conta).

### Contas duplicadas

* O Supabase vincula o Google à conta que já existe com o mesmo e-mail
  confirmado (vinculação automática de identidades): continua **um** usuário e
  o profile existente vale.
* A conclusão recusa e-mail ou CPF que já tenham cadastro.

### Recuperação de senha

* "Esqueceu sua senha?" no login → e-mail validado → `resetPasswordForEmail`
  com volta para `/redefinir-senha`. A resposta é a mesma para e-mail
  cadastrado ou não (não revela contas) e explica que contas do Google entram
  pelo Google.
* `/redefinir-senha`: nova senha + confirmação, mostrar/ocultar, mínimo de 8
  caracteres. Link expirado → "Este link expirou"; já usado ou inválido →
  "Este link não é válido", com "Pedir novo link". Só um link de recuperação
  libera a troca (estar conectado não basta).

## Configuração manual (produção)

### 1. Google Cloud Console

1. Crie (ou escolha) um projeto em <https://console.cloud.google.com/>.
2. **APIs e serviços → Tela de consentimento OAuth**: tipo *Externo*, nome
   "Artenós", e-mail de suporte, logo, domínios autorizados (o domínio do
   site e `supabase.co`), escopos `openid`, `email` e `profile`. Publique o
   app (status *Em produção*), senão só usuários de teste conseguem entrar.
3. **Credenciais → Criar credenciais → ID do cliente OAuth → Aplicativo da
   Web**:
   * Origens JavaScript autorizadas: `https://SEU-DOMINIO` (e
     `http://localhost:3000` para desenvolvimento).
   * URIs de redirecionamento autorizados:
     `https://SEU-PROJETO.supabase.co/auth/v1/callback` (está em Supabase →
     Authentication → Providers → Google, campo *Callback URL*).
4. Copie o **ID do cliente** e a **chave secreta**.

### 2. Supabase (painel do projeto)

1. **Authentication → Sign In / Providers → Google**: ative e cole o ID do
   cliente e a chave secreta. A chave fica só no Supabase; o site não usa
   nenhuma variável nova.
2. **Authentication → URL Configuration**:
   * Site URL: `https://SEU-DOMINIO`.
   * Redirect URLs: `https://SEU-DOMINIO/acesso/google`,
     `https://SEU-DOMINIO/redefinir-senha` e, para os previews da Vercel,
     `https://*-artenos.vercel.app/**`. Local: `http://localhost:3000/**`.
3. **Authentication → Emails**: confira o SMTP (os e-mails de recuperação
   precisam sair por ele em produção) e traduza o modelo *Reset password*.
   A validade do link fica em *Email OTP Expiration* (padrão 1 hora).
4. **SQL Editor**: execute `supabase/login_google.sql`. Depois,
   `supabase/verificar_instalacao.sql` mostra se ficou tudo OK.

### 3. Local (Supabase CLI)

```toml
[auth]
site_url = "http://localhost:3000"
additional_redirect_urls = ["http://localhost:3000/**"]

[auth.external.google]
enabled = true
client_id = "SEU-CLIENT-ID.apps.googleusercontent.com"
secret = "env(SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET)"
skip_nonce_check = true
```

No Google Cloud, inclua `http://127.0.0.1:54321/auth/v1/callback` nos URIs de
redirecionamento do cliente usado localmente.
