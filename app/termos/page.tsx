import type { Metadata } from "next";
import Link from "next/link";
import { PENDING, formatPhone, siteConfig } from "@/lib/site-config";
import "../storefront.css";
import "../privacidade/privacy.css";

export const metadata: Metadata = {
  title: "Termos de Uso | Artenós",
  description: "Regras de uso da Artenós para quem compra e para quem vende: conta, lojas, compras, pagamentos, tarifas, repasses, moderação e exclusão.",
};

// Texto alinhado ao que o sistema faz hoje (cadastro, análise de lojas, idade
// mínima, checkout pelo Mercado Pago, tarifas, repasses, avaliações, moderação,
// suspensão e exclusão em 30 dias). Ao mudar uma regra, atualize aqui e a data em
// NEXT_PUBLIC_TERMS_UPDATED_AT. Revisão jurídica obrigatória antes do lançamento.
export default function TermsPage() {
  const c = siteConfig;
  const legalName = c.companyLegalName || PENDING;
  const phone = c.supportPhone ? formatPhone(c.supportPhone) : "";
  const phoneHref = `tel:+55${c.supportPhone.replace(/\D/g, "").replace(/^55/, "")}`;
  return (
    <main id="conteudo" tabIndex={-1} className="store-container legal privacy">
      <p className="store-eyebrow">Regras da Artenós</p>
      <h1>Termos de Uso</h1>
      <p className="privacy-updated">Última atualização: {c.termsUpdatedAt}</p>
      {!c.companyLegalName && (
        <p className="privacy-notice" role="note">A razão social da empresa está sendo atualizada.</p>
      )}

      <nav className="privacy-toc" aria-label="Seções">
        <ol>
          <li><a href="#quem-somos">Quem somos e aceite</a></li>
          <li><a href="#papel">O papel da Artenós</a></li>
          <li><a href="#conta">Conta e cadastro</a></li>
          <li><a href="#lojas">Lojas: cadastro e responsabilidades</a></li>
          <li><a href="#anuncios">Peças anunciadas e conteúdo proibido</a></li>
          <li><a href="#compras">Compras, pagamento e entrega</a></li>
          <li><a href="#desistencia">Desistência, trocas e defeitos</a></li>
          <li><a href="#tarifas">Tarifas e repasses às lojas</a></li>
          <li><a href="#mensagens">Mensagens, avaliações e moderação</a></li>
          <li><a href="#suspensao">Suspensão e bloqueio</a></li>
          <li><a href="#exclusao">Exclusão da conta</a></li>
          <li><a href="#propriedade">Propriedade intelectual</a></li>
          <li><a href="#responsabilidade">Limites de responsabilidade</a></li>
          <li><a href="#alteracoes">Alterações, lei aplicável e contato</a></li>
        </ol>
      </nav>

      <section id="quem-somos">
        <h2>1. Quem somos e aceite</h2>
        <p>
          A Artenós é um marketplace de artesanato operado por {legalName}, CNPJ {c.companyCnpj || PENDING}
          {c.companyAddress ? `, com sede em ${c.companyAddress}` : ""}. Na plataforma, lojas aprovadas publicam peças e
          compradores compram, favoritam, avaliam e conversam com as lojas.
        </p>
        <p>
          Ao criar uma conta, você declara ter lido e aceito estes Termos e a{" "}
          <Link href="/privacidade">Política de Privacidade</Link>, que explica como tratamos seus dados pessoais. A data
          do aceite fica registrada no seu cadastro. Se não concordar, não crie a conta.
        </p>
      </section>

      <section id="papel">
        <h2>2. O papel da Artenós</h2>
        <p>
          A Artenós <strong>intermedeia</strong> a venda: oferece a vitrine, o carrinho, o pagamento (pelo Mercado Pago), o
          cálculo de frete, as conversas e a Central de Ajuda. <strong>Quem vende a peça é a loja</strong>, que a produz,
          embala, envia, emite a nota fiscal quando for obrigada e responde pela qualidade e pela descrição do que anuncia.
        </p>
        <p>
          A Artenós analisa os cadastros de lojas, modera conteúdos e atende reclamações, mas não fabrica nem guarda as
          peças em estoque.
        </p>
      </section>

      <section id="conta">
        <h2>3. Conta e cadastro</h2>
        <ul>
          <li>Você pode criar a conta com e-mail e senha ou entrar com o Google; em ambos os casos, completa os dados obrigatórios (nome, CPF ou CNPJ, telefone e endereço).</li>
          <li>Os dados informados precisam ser verdadeiros e estar atualizados. Cada CPF ou CNPJ e cada e-mail só pode ter uma conta.</li>
          <li>A conta é pessoal: guarde sua senha, não a compartilhe e encerre a sessão em aparelhos de outras pessoas. Por segurança, a sessão pode ser encerrada após um período sem uso.</li>
          <li>A Artenós é destinada a maiores de 18 anos. Menores só podem comprar com a participação de pai, mãe ou responsável legal, que responde pela conta.</li>
        </ul>
      </section>

      <section id="lojas">
        <h2>4. Lojas: cadastro e responsabilidades</h2>
        <ul>
          <li><strong>Análise:</strong> todo cadastro de loja passa pela análise da equipe. Enviar o formulário não garante aprovação; a resposta chega por e-mail.</li>
          <li><strong>Idade mínima:</strong> para vender é preciso ter 18 anos ou mais. A data de nascimento é declarada no cadastro e informada uma única vez; se indicar menos de 18 anos, a loja não é aberta ou, se já existia, fica bloqueada até a maioridade. Declarar data falsa é motivo de encerramento da loja.</li>
          <li><strong>Uma loja por pessoa:</strong> quem já é comprador pode pedir para abrir a loja na mesma conta, mantendo pedidos e histórico.</li>
          <li><strong>Obrigações da loja:</strong> anunciar com fotos e descrição fiéis; cumprir o prazo de produção e de envio informado; informar o código de rastreio; atender pela conversa do pedido; respeitar o Código de Defesa do Consumidor; emitir nota fiscal quando a lei exigir; e manter corretos os dados fiscais e a chave Pix.</li>
        </ul>
      </section>

      <section id="anuncios">
        <h2>5. Peças anunciadas e conteúdo proibido</h2>
        <p>É proibido anunciar ou publicar na Artenós (em peças, fotos, nomes de loja, histórias, mensagens ou avaliações):</p>
        <ul>
          <li>produtos ilegais, falsificados, roubados ou que dependam de autorização que a loja não tenha;</li>
          <li>conteúdo que viole direitos autorais, marcas ou imagem de terceiros;</li>
          <li>ofensas, discriminação, assédio, ameaças ou conteúdo sexual;</li>
          <li>golpes, spam, ou tentativas de levar o pagamento para fora da plataforma;</li>
          <li>dados pessoais de outras pessoas sem autorização.</li>
        </ul>
        <p>Textos de lojas e peças passam por um filtro de termos. A Artenós pode recusar, ocultar ou remover conteúdos que descumpram estas regras.</p>
      </section>

      <section id="compras">
        <h2>6. Compras, pagamento e entrega</h2>
        <ul>
          <li><strong>Preço e frete:</strong> o preço é definido pela loja. O frete é calculado pelas transportadoras disponíveis entre o CEP da loja e o seu, e aparece antes de você pagar.</li>
          <li><strong>Pagamento:</strong> é feito pelo Mercado Pago, por Pix ou cartão. A Artenós não recebe o número completo do cartão. O pedido só é confirmado depois que o Mercado Pago aprova o pagamento.</li>
          <li><strong>Sob encomenda:</strong> peças feitas depois do pedido têm prazo de produção informado na peça, que se soma ao prazo de entrega. Detalhes (cor, nome, tamanho) podem ser combinados nas observações e na conversa.</li>
          <li><strong>Orçamentos:</strong> pedidos de orçamento são combinados entre você e a loja; o pagamento deve ser feito pela plataforma.</li>
          <li><strong>Acompanhamento:</strong> a situação do pedido, da produção e do envio aparece em Meus pedidos.</li>
        </ul>
      </section>

      <section id="desistencia">
        <h2>7. Desistência, trocas e defeitos</h2>
        <ul>
          <li>Em compras pela internet, você pode desistir em até <strong>7 dias</strong> do recebimento (art. 49 do Código de Defesa do Consumidor), com devolução dos valores pagos.</li>
          <li>Peças feitas sob medida ou personalizadas a seu pedido podem ter condições próprias, que devem ser combinadas com a loja antes da produção, sempre respeitados os direitos previstos em lei.</li>
          <li>Peça com defeito ou diferente do anunciado: fotografe a peça e a embalagem e fale com a loja pela conversa do pedido. Sem solução, abra um chamado na <Link href="/ajuda">Central de Ajuda</Link> com o número do pedido.</li>
        </ul>
      </section>

      <section id="tarifas">
        <h2>8. Tarifas e repasses às lojas</h2>
        <ul>
          <li>Comprar na Artenós não tem custo além do preço da peça e do frete.</li>
          <li>A cada venda, a loja paga à Artenós uma <strong>porcentagem sobre o valor das peças</strong> e uma <strong>tarifa fixa por item</strong>, nos valores mostrados no painel da loja (calculadora de precificação). O frete não entra na tarifa. Os valores vigentes no momento da compra ficam congelados para aquele pedido.</li>
          <li>A taxa do meio de pagamento também é descontada do valor da venda.</li>
          <li>O valor líquido é repassado para a chave Pix cadastrada pela loja, na data de liberação mostrada em Repasses. A loja é responsável por manter a chave correta.</li>
          <li>Mudanças nas tarifas são avisadas com antecedência e valem só para vendas futuras.</li>
        </ul>
      </section>

      <section id="mensagens">
        <h2>9. Mensagens, avaliações e moderação</h2>
        <ul>
          <li><strong>Mensagens:</strong> compradores e lojas conversam pela plataforma. Mensagens com termos ofensivos são bloqueadas antes do envio, e qualquer pessoa pode denunciar uma conversa. A equipe analisa as denúncias.</li>
          <li><strong>Avaliações:</strong> só avalia quem comprou e teve o pedido entregue, uma vez por peça e por loja. A avaliação pode ser editada por 30 dias e a loja pode responder publicamente uma vez. O primeiro nome de quem avaliou aparece publicamente.</li>
          <li>Avaliações devem ser honestas e sobre a experiência real; é proibido avaliar a própria loja ou oferecer vantagem em troca de avaliação.</li>
          <li>Há limites de envio (mensagens, avaliações, denúncias, orçamentos e chamados) para evitar abuso.</li>
        </ul>
      </section>

      <section id="suspensao">
        <h2>10. Suspensão e bloqueio</h2>
        <p>
          Quem descumprir estes Termos pode ter a conta <strong>suspensa</strong> por prazo determinado ou encerrada. Durante a
          suspensão, a pessoa pode entrar e navegar, mas não compra, não favorita, não envia mensagens nem avaliações, e a loja
          sai da vitrine. A loja suspensa continua podendo atualizar o andamento dos pedidos já pagos, para não prejudicar quem
          comprou. A Central de Ajuda e as denúncias continuam disponíveis, e a pessoa é avisada da suspensão e do seu fim.
        </p>
      </section>

      <section id="exclusao">
        <h2>11. Exclusão da conta</h2>
        <p>
          Você pode excluir a conta em Meu perfil › Privacidade e dados. A conta é desativada na hora e fica guardada por{" "}
          <strong>30 dias</strong>, prazo em que pode ser reativada a pedido pelo atendimento. Depois disso, a exclusão é
          definitiva. A exclusão pode ser impedida enquanto houver pedidos ou repasses em andamento. Dados que a lei manda
          guardar (como pedidos, pagamentos e dados fiscais) são mantidos sem identificação de contato, como descrito na{" "}
          <Link href="/privacidade">Política de Privacidade</Link>.
        </p>
      </section>

      <section id="propriedade">
        <h2>12. Propriedade intelectual</h2>
        <p>
          A marca, o nome, o visual e o código da Artenós pertencem à {legalName === PENDING ? "Artenós" : legalName}. Cada
          loja continua dona das fotos, textos e criações que publica e autoriza a Artenós a exibi-los na plataforma e em
          divulgações da própria plataforma enquanto o anúncio estiver ativo.
        </p>
      </section>

      <section id="responsabilidade">
        <h2>13. Limites de responsabilidade</h2>
        <ul>
          <li>A Artenós se esforça para manter a plataforma no ar e segura, mas pode haver interrupções para manutenção ou por falhas de fornecedores (pagamento, frete, hospedagem).</li>
          <li>A Artenós não responde por atos de terceiros fora da plataforma, como pagamentos ou combinações feitos por fora.</li>
          <li>Nada nestes Termos afasta os direitos do consumidor previstos em lei.</li>
        </ul>
      </section>

      <section id="alteracoes">
        <h2>14. Alterações, lei aplicável e contato</h2>
        <p>
          Podemos atualizar estes Termos quando a plataforma mudar. A data de última atualização fica no topo da página e,
          em mudanças relevantes, avisaremos por e-mail ou na plataforma. Estes Termos seguem a lei brasileira; para
          consumidores, vale o foro do seu domicílio.
        </p>
        <p>
          Dúvidas: {phone ? <>telefone <a href={phoneHref}>{phone}</a>, </> : null}
          {c.supportEmail ? <>e-mail <a href={`mailto:${c.supportEmail}`}>{c.supportEmail}</a> ou </> : null}
          <Link href="/ajuda">Central de Ajuda</Link> ({c.supportHours}).
        </p>
      </section>
    </main>
  );
}
