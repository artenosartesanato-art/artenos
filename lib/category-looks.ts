// Aparência de cada categoria na vitrine quando ela ainda não tem foto:
// um padrão de tecido/papel e um ícone da técnica. Achado por palavra-chave
// no nome ou endereço, para categorias novas também ganharem um visual.

export type CategoryLook = { icon: string; pattern: number };

const LOOKS: { match: RegExp; look: CategoryLook }[] = [
  { match: /ceramic|barro|argila/, look: { icon: "cup-hot", pattern: 1 } },
  { match: /croche|trico|amigurumi-e-croche/, look: { icon: "globe2", pattern: 2 } },
  { match: /bordado|renda/, look: { icon: "flower1", pattern: 3 } },
  { match: /tecelagem|tear/, look: { icon: "grid-3x3", pattern: 4 } },
  { match: /macrame/, look: { icon: "bezier2", pattern: 5 } },
  { match: /fibra|palha|cestaria/, look: { icon: "basket", pattern: 6 } },
  { match: /madeira|marcenaria/, look: { icon: "tree", pattern: 7 } },
  { match: /costura/, look: { icon: "scissors", pattern: 8 } },
  { match: /joia|bijuteria|acessorio/, look: { icon: "gem", pattern: 9 } },
  { match: /papelaria|encaderna|caderno/, look: { icon: "journal-bookmark", pattern: 10 } },
  { match: /vela|aroma|sabonete/, look: { icon: "fire", pattern: 11 } },
  { match: /\barte\b|pintura|ilustra/, look: { icon: "palette", pattern: 12 } },
  { match: /decora/, look: { icon: "house-heart", pattern: 13 } },
  { match: /brinquedo|amigurumi/, look: { icon: "puzzle", pattern: 14 } },
  { match: /moda|roupa|vestuario/, look: { icon: "handbag", pattern: 15 } },
];

export const PATTERN_COUNT = 15;

const fold = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function categoryLook(category: { name: string; slug?: string | null }, index = 0): CategoryLook {
  const text = fold(`${category.slug ?? ""} ${category.name}`);
  const found = LOOKS.find((entry) => entry.match.test(text));
  return found?.look ?? { icon: "stars", pattern: (index % PATTERN_COUNT) + 1 };
}
