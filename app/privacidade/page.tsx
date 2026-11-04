import type { Metadata } from "next";
import Link from "next/link";
import { PENDING, siteConfig } from "@/lib/site-config";
import "../storefront.css";
import "./privacy.css";

export const metadata: Metadata = {
  title: "Política de Privacidade | Artenós",
  description: "Como a Artenós coleta, usa, compartilha e protege dados pessoais, e como exercer seus direitos pela LGPD.",
};

// Texto alinhado ao que o sistema faz hoje (dados coletados, serviços usados,
// prazos e ferramentas de direitos). Ao mudar uma prática, atualize aqui e a
// data em NEXT_PUBLIC_PRIVACY_UPDATED_AT. Revisão jurídica obrigatória antes do lançamento.
export default function PrivacyPage() {
  const c = siteConfig;
  const legalName = c.companyLegalName || PENDING;
  const cnpj = c.companyCnpj || PENDING;
  const contactEmail = c.dpoEmail || c.supportEmail;
  return (
    <main id="conteudo" tabIndex={-1} className="store-container legal privacy">
      <p className="store-eyebrow">Seus dados na Artenós</p>
      <h1>Política de Privacidade</h1>
      <p className="privacy-updated">Última atualização: {c.privacyUpdatedAt}</p>
      {!c.companyCnpj && (
        <p className="privacy-notice" role="note">Os dados de registro da empresa (razão social e CNPJ) estão sendo atualizados.</p>
      )}

      <nav className="privacy-toc" aria-label="Seções">
        <ol>
          <li><a href="#controlador">Quem somos</a></li>
          <li><a href="#papeis">Papéis da Artenós e das lojas</a></li>
          <li><a href="#dados">Dados que coletamos</a></li>
          <li><a href="#nao-guardamos">O que não guardamos</a></li>
          <li><a href="#finalidades">Para que usamos e bases legais</a></li>
          <li><a href="#compartilhamento">Com quem compartilhamos</a></li>
          <li><a href="#internacional">Transferência internacional</a></li>
          <li><a href="#cookies">Cookies e armazenamento no navegador</a></li>
          <li><a href="#retencao">Por quanto tempo guardamos</a></li>
          <li><a href="#direitos">Seus direitos</a></li>
          <li><a href="#seguranca">Segurança</a></li>
          <li><a href="#menores">Menores de 18 anos</a></li>
          <li><a href="#alteracoes">Alterações desta política</a></li>
          <li><a href="#encarregado">Encarregado (DPO)</a></li>
        </ol>
      </nav>

      <section id="controlador">
        <h2>1. Quem somos</h2>
        <p>
          A Artenós é um marketplace de artesanato: lojas aprovadas publicam peças e compradores compram, favoritam,
          avaliam e conversam com as lojas. A controladora dos dados tratados na plataforma é {legalName}, CNPJ {cnpj}
          {c.companyAddress ? `, com sede em ${c.companyAddress}` : ""}.
        </p>
        <p>
          Tratamos dados pessoais de acordo com a Lei Geral de Proteção de Dados (Lei 13.709/2018, “LGPD”) e o Marco
          Civil da Internet (Lei 12.965/2014).
        </p>
      </section>

      <section id="papeis">
        <h2>2. Papéis da Artenós e das lojas</h2>
        <p>
          <strong>A Artenós é controladora</strong> dos dados de contas, cadastro de lojas, pedidos, pagamentos,
          mensagens, avaliações, navegação e atendimento na plataforma.
        </p>
        <p>
          <strong>Cada loja é controladora</strong> dos dados que recebe para atender o seu pedido e trata nos próprios
          canais e obrigações, como produzir e enviar a peça, emitir nota fiscal e cumprir a garantia. A loja só vê os
          dados dos próprios pedidos e conversas.
        </p>
      </section>

      <section id="dados">
        <h2>3. Dados que coletamos</h2>
        <h3>Ao criar uma conta de comprador</h3>
        <p>Nome completo, e-mail, CPF ou CNPJ, telefone, CEP e endereço (rua, número, cidade e estado), foto de perfil (opcional) e a data de aceite dos Termos.</p>
        <h3>Ao cadastrar uma loja</h3>
        <p>Os dados acima e também nome da loja, especialidade, história da loja, capa e foto, CEP de origem dos envios, prazos de produção e a chave Pix para receber os repasses.</p>
        <h3>Ao comprar</h3>
        <p>
          Itens, quantidades e valores; endereço de entrega e frete escolhido; observações que você deixar para a loja
          em peças sob encomenda; situação do pedido, da produção e do envio (com código de rastreio); identificador,
          forma, situação e taxas do pagamento informados pelo Mercado Pago.
        </p>
        <h3>Ao usar a plataforma</h3>
        <ul>
          <li><strong>Mensagens</strong> trocadas com lojas ou compradores, denúncias de conversas e tentativas de envio bloqueadas pelo filtro de termos ofensivos;</li>
          <li><strong>Avaliações</strong> de peças e lojas (nota, comentário e data; o primeiro nome aparece publicamente);</li>
          <li><strong>Favoritos, carrinho</strong> e pedidos de orçamento sob encomenda;</li>
          <li><strong>Chamados</strong> da Central de Ajuda (nome, e-mail, assunto, mensagem e número do pedido, se informado);</li>
          <li><strong>Avisos</strong> da plataforma (sininho e e-mails de pedido e avaliação).</li>
        </ul>
        <h3>Dados técnicos</h3>
        <p>
          Endereço IP, navegador (user agent), data e hora de entrada, saída e troca de senha, e registros técnicos dos
          servidores. Contadores de tentativas são usados para limitar abusos (ex.: muitos envios seguidos).
        </p>
      </section>

      <section id="nao-guardamos">
        <h2>4. O que não guardamos</h2>
        <p>
          <strong>Não recebemos nem guardamos o número completo do cartão, a validade ou o código de segurança.</strong>{" "}
          Esses dados são digitados em campos do Mercado Pago e vão direto para ele. Guardamos apenas o identificador e
          a situação do pagamento. Também não guardamos sua senha: ela é armazenada pelo serviço de autenticação na
          forma de hash (bcrypt), que não permite recuperar a senha original.
        </p>
      </section>

      <section id="finalidades">
        <h2>5. Para que usamos os dados e bases legais (art. 7º da LGPD)</h2>
        <div className="privacy-table" role="region" aria-label="Finalidades e bases legais" tabIndex={0}>
          <table>
            <thead><tr><th scope="col">Finalidade</th><th scope="col">Base legal</th></tr></thead>
            <tbody>
              <tr><td>Criar e manter sua conta, entrar com segurança</td><td>Execução de contrato (inciso V)</td></tr>
              <tr><td>Processar compras, pagamentos, frete, entregas e repasses às lojas</td><td>Execução de contrato (V)</td></tr>
              <tr><td>Analisar e aprovar lojas; prevenir fraude e uso indevido</td><td>Legítimo interesse (IX) e execução de contrato (V)</td></tr>
              <tr><td>Mensagens entre compradores e lojas; moderação de termos ofensivos e denúncias</td><td>Execução de contrato (V) e legítimo interesse (IX)</td></tr>
              <tr><td>Publicar avaliações e médias de peças e lojas</td><td>Legítimo interesse (IX)</td></tr>
              <tr><td>Atendimento pela Central de Ajuda</td><td>Execução de contrato (V) e legítimo interesse (IX)</td></tr>
              <tr><td>Guardar registros de acesso (Marco Civil, art. 15) e dados fiscais e de pedidos</td><td>Cumprimento de obrigação legal (II)</td></tr>
              <tr><td>Defender direitos em processos judiciais ou administrativos</td><td>Exercício regular de direitos (VI)</td></tr>
              <tr><td>Avisos de pedido, de avaliação e de peças salvas</td><td>Execução de contrato (V) e legítimo interesse (IX)</td></tr>
              <tr><td>Cookies opcionais de análise, se um dia forem usados</td><td>Consentimento (I)</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section id="compartilhamento">
        <h2>6. Com quem compartilhamos</h2>
        <p><strong>Não vendemos dados pessoais.</strong> Compartilhamos somente o necessário com:</p>
        <ul>
          <li><strong>A loja vendedora:</strong> nome, endereço de entrega, itens, observações e mensagens do pedido, para produzir, enviar e atender;</li>
          <li><strong>Mercado Pago:</strong> dados da compra e do comprador para processar o pagamento (Pix ou cartão) e os repasses;</li>
          <li><strong>Melhor Envio e transportadoras:</strong> CEPs de origem e destino, peso e medidas para calcular o frete e, no envio, os dados de entrega;</li>
          <li><strong>ViaCEP:</strong> o CEP digitado, para preencher o endereço automaticamente;</li>
          <li><strong>Supabase:</strong> banco de dados, autenticação e armazenamento de imagens da plataforma;</li>
          <li><strong>Provedor de hospedagem</strong> da aplicação, que processa as páginas e os registros técnicos;</li>
          <li><strong>Serviço de e-mail</strong> (Gmail/Google Workspace ou Resend, conforme a configuração), para enviar confirmações, comprovantes, avisos e respostas da Central de Ajuda;</li>
          <li><strong>Cloudflare Turnstile,</strong> quando a verificação anti-robô estiver ativada nos formulários;</li>
          <li><strong>Autoridades públicas,</strong> quando houver obrigação legal ou ordem judicial.</li>
        </ul>
      </section>

      <section id="internacional">
        <h2>7. Transferência internacional</h2>
        <p>
          Alguns fornecedores acima (como o provedor de hospedagem, o Supabase e o serviço de e-mail) podem armazenar ou
          processar dados em servidores fora do Brasil, conforme a região contratada. Nesses casos, a transferência
          ocorre para a execução do contrato com você (art. 33, IX, da LGPD) e com fornecedores que adotam garantias de
          segurança e confidencialidade compatíveis com a LGPD.
        </p>
      </section>

      <section id="cookies">
        <h2>8. Cookies e armazenamento no navegador</h2>
        <p>
          Hoje a Artenós usa <strong>somente cookies e armazenamento essenciais</strong>. Não usamos cookies de
          publicidade nem de análise. Se cookies opcionais forem adicionados, eles só serão carregados depois que você
          tocar em “Aceitar todos” no aviso de cookies; você pode mudar a escolha em “Preferências de cookies”, no rodapé.
        </p>
        <div className="privacy-table" role="region" aria-label="Itens guardados no navegador" tabIndex={0}>
          <table>
            <thead><tr><th scope="col">Item</th><th scope="col">Para que serve</th><th scope="col">Tipo</th></tr></thead>
            <tbody>
              <tr><td>Sessão de login (cookies e armazenamento local)</td><td>Manter você conectado com segurança</td><td>Essencial</td></tr>
              <tr><td>artenos:lembrar, artenos:ultima-atividade</td><td>Lembrar este aparelho e encerrar a sessão após inatividade</td><td>Essencial</td></tr>
              <tr><td>artenos:tentativas-login</td><td>Limitar tentativas de login (guarda só um resumo do e-mail, nunca o endereço)</td><td>Essencial</td></tr>
              <tr><td>artenos_guest_cep</td><td>CEP informado por visitante para estimar frete</td><td>Funcional</td></tr>
              <tr><td>artenos:sons-*</td><td>Preferência de sons da interface</td><td>Funcional</td></tr>
              <tr><td>artenos:cookies</td><td>Guardar a sua escolha neste aviso</td><td>Essencial</td></tr>
            </tbody>
          </table>
        </div>
        <p>O carrinho de visitante fica só na memória da aba e some ao fechá-la. Páginas do Mercado Pago e do Cloudflare (quando ativo) podem usar os próprios cookies para segurança do pagamento e anti-robô.</p>
      </section>

      <section id="retencao">
        <h2>9. Por quanto tempo guardamos</h2>
        <ul>
          <li><strong>Registros de acesso</strong> (IP, data e hora): no mínimo 6 meses, como exige o art. 15 do Marco Civil; guardamos por 12 meses e depois apagamos automaticamente.</li>
          <li><strong>Pedidos, pagamentos, repasses e dados fiscais:</strong> pelos prazos legais (em regra, 5 anos), mesmo após a exclusão da conta.</li>
          <li><strong>Tentativas bloqueadas pelo filtro de termos:</strong> 6 meses.</li>
          <li><strong>Dados da conta:</strong> enquanto a conta estiver ativa. Ao pedir a exclusão, a conta é desativada na hora (o acesso é bloqueado, as sessões são encerradas e as peças de lojas saem da vitrine) e fica guardada por <strong>30 dias</strong>; nesse prazo, ela pode ser reativada a pedido, por e-mail{contactEmail ? <> para <a href={`mailto:${contactEmail}`}>{contactEmail}</a></> : null}. Depois dos 30 dias, a exclusão é definitiva: apagamos ou anonimizamos nome, documento, contatos, endereço, favoritos, carrinho, avisos e chave Pix; o que precisa ser mantido por lei fica sem identificação de contato.</li>
        </ul>
      </section>

      <section id="direitos">
        <h2>10. Seus direitos (art. 18 da LGPD)</h2>
        <p>Você pode pedir a confirmação do tratamento, acesso, correção, anonimização, bloqueio ou eliminação de dados desnecessários, portabilidade, informação sobre compartilhamento, revogação do consentimento e revisão de decisões automatizadas.</p>
        <ul>
          <li><strong>Baixar seus dados</strong> e <strong>excluir sua conta</strong>: em Meu perfil › Privacidade e dados;</li>
          <li><strong>Corrigir dados</strong>: em Meu perfil (alguns campos, como CPF/CNPJ, são corrigidos pelo atendimento);</li>
          <li><strong>Outros pedidos</strong>: pela <Link href="/ajuda">Central de Ajuda</Link> (assunto “Privacidade e dados pessoais”){contactEmail ? <> ou pelo e-mail <a href={`mailto:${contactEmail}`}>{contactEmail}</a></> : null}.</li>
        </ul>
        <p>Respondemos em até 15 dias. Você também pode reclamar à Autoridade Nacional de Proteção de Dados (ANPD).</p>
      </section>

      <section id="seguranca">
        <h2>11. Segurança</h2>
        <ul>
          <li>Conexão sempre criptografada (HTTPS, com HSTS) e cabeçalhos de proteção contra uso da página dentro de outros sites;</li>
          <li>Senhas guardadas com hash forte pelo serviço de autenticação; limite de tentativas de login e, quando ativada, verificação anti-robô;</li>
          <li>Regras de acesso no banco de dados: cada pessoa vê os próprios pedidos e conversas, e cada loja só os dados dos próprios pedidos;</li>
          <li>Chaves secretas (pagamento, banco, e-mail) somente no servidor, nunca no navegador;</li>
          <li>Proteção contra requisições de outros sites (CSRF) e limite de envios em formulários, chat e avaliações;</li>
          <li>Registros de acesso para investigar incidentes. Em caso de incidente relevante, avisaremos você e a ANPD.</li>
        </ul>
        <p>Nenhum sistema é totalmente imune a falhas; por isso, use uma senha exclusiva e encerre a sessão em aparelhos compartilhados.</p>
      </section>

      <section id="menores">
        <h2>12. Menores de 18 anos</h2>
        <p>A Artenós é destinada a maiores de 18 anos. Menores só podem comprar com a participação de pai, mãe ou responsável legal, que responde pela conta. Se identificarmos uma conta de menor sem essa participação, ela poderá ser suspensa.</p>
      </section>

      <section id="alteracoes">
        <h2>13. Alterações desta política</h2>
        <p>Podemos atualizar esta política quando a plataforma mudar. A data de última atualização fica no topo da página e, em mudanças relevantes, avisaremos por e-mail ou na plataforma.</p>
      </section>

      <section id="encarregado">
        <h2>14. Encarregado pelo tratamento de dados (DPO)</h2>
        <p>
          Encarregado: {c.dpoName || PENDING}
          {c.dpoEmail ? <> — <a href={`mailto:${c.dpoEmail}`}>{c.dpoEmail}</a></> : <> — e-mail: {PENDING}</>}.
        </p>
      </section>
    </main>
  );
}
