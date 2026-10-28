export type MessageTopic = "geral" | "produto" | "personalizacao" | "prazo" | "entrega" | "outro";
export type MessageRole = "client" | "artisan";

export const messageTopics: { value: MessageTopic; label: string }[] = [
  { value: "geral", label: "Geral" },
  { value: "produto", label: "Sobre a peça" },
  { value: "personalizacao", label: "Personalização" },
  { value: "prazo", label: "Prazo" },
  { value: "entrega", label: "Entrega" },
  { value: "outro", label: "Outro assunto" },
];

const templates: Record<MessageTopic, Record<MessageRole, string[]>> = {
  geral: {
    client: [
      "Olá! Tenho uma dúvida sobre {item}. Você pode me ajudar?",
      "Oi! Gostaria de conversar com a loja antes de pedir {item}.",
      "Olá! {item} ainda está disponível?",
      "Você pode me contar um pouco mais sobre {item}?",
      "Oi! Qual é a melhor forma de tirar dúvidas sobre {item}?",
    ],
    artisan: [
      "Olá! Recebi sua mensagem sobre {item}. Como posso ajudar?",
      "Oi! Obrigado pelo contato. Qual detalhe de {item} você gostaria de saber?",
      "Olá! Posso verificar sua dúvida sobre {item} e responder por aqui.",
      "Oi! Se quiser, me conte o que você procura em {item}.",
      "Olá! Estou à disposição para explicar os detalhes de {item}.",
    ],
  },
  produto: {
    client: [
      "Qual é o material usado em {item}?",
      "Quais são as medidas exatas de {item}?",
      "As cores de {item} são iguais às da foto?",
      "Você pode me mostrar mais detalhes do acabamento de {item}?",
      "Como devo cuidar de {item} depois da compra?",
    ],
    artisan: [
      "Posso explicar os materiais de {item}. Qual parte você quer conhecer melhor?",
      "Vou conferir as medidas de {item} e informar por aqui.",
      "Posso explicar como a cor de {item} aparece nas fotos e na peça real.",
      "Vou verificar os detalhes do acabamento de {item} para você.",
      "Posso orientar sobre os cuidados recomendados para {item}.",
    ],
  },
  personalizacao: {
    client: [
      "É possível personalizar {item}?",
      "Você consegue fazer {item} em outra cor?",
      "Posso pedir uma medida diferente para {item}?",
      "Quanto custaria uma versão personalizada de {item}?",
      "Como funciona a aprovação dos detalhes antes de produzir {item}?",
    ],
    artisan: [
      "Conte quais mudanças você gostaria de fazer em {item}.",
      "Posso verificar as opções de cores disponíveis para {item}.",
      "Envie as medidas desejadas para eu avaliar a personalização de {item}.",
      "Com os detalhes da personalização, consigo preparar um valor para {item}.",
      "Podemos confirmar os detalhes de {item} antes de iniciar a produção.",
    ],
  },
  prazo: {
    client: [
      "Qual é o prazo de produção de {item}?",
      "{item} está pronta para envio ou será produzida após o pedido?",
      "Você consegue informar quando {item} poderá ser postada?",
      "Há possibilidade de antecipar a produção de {item}?",
      "Como acompanho o andamento da produção de {item}?",
    ],
    artisan: [
      "Vou confirmar o prazo de produção de {item} para você.",
      "Posso verificar se {item} está pronta para postagem.",
      "Informarei a previsão de postagem de {item} assim que confirmar a produção.",
      "Vou avaliar se é possível antecipar a produção de {item}.",
      "Posso atualizar você por aqui sobre o andamento de {item}.",
    ],
  },
  entrega: {
    client: [
      "Você pode me explicar como será enviado {item}?",
      "Qual é o prazo estimado de entrega de {item} para meu CEP?",
      "Como {item} será embalada para o transporte?",
      "Receberei um código de rastreamento para {item}?",
      "Quais opções de frete estão disponíveis para {item}?",
    ],
    artisan: [
      "Posso explicar como preparamos {item} para o envio.",
      "O prazo de entrega de {item} depende do CEP e da opção de frete escolhida.",
      "Vou confirmar os cuidados de embalagem de {item} para o transporte.",
      "Posso orientar você sobre o acompanhamento da entrega de {item}.",
      "Confira as opções de frete no carrinho; se tiver dúvidas, me avise.",
    ],
  },
  outro: {
    client: [
      "Olá! Tenho outra dúvida sobre {item}. Podemos conversar?",
      "Posso fazer uma pergunta antes de comprar {item}?",
      "Você pode me orientar sobre uma necessidade específica relacionada a {item}?",
      "Gostaria de confirmar uma informação sobre {item} que não encontrei na página.",
      "Olá! Preciso de ajuda com um assunto diferente sobre {item}.",
    ],
    artisan: [
      "Claro! Conte qual outra dúvida você tem sobre {item}.",
      "Posso ajudar com essa questão. Você pode me dar mais detalhes?",
      "Vou verificar sua pergunta sobre {item} e responder por aqui.",
      "Se puder descrever a sua necessidade, consigo orientar melhor.",
      "Estou à disposição para esclarecer outros pontos sobre {item}.",
    ],
  },
};

export function getMessageSuggestions(topic: MessageTopic, item: string, role: MessageRole): string[] {
  return templates[topic][role].map((template) => template.replaceAll("{item}", item));
}
