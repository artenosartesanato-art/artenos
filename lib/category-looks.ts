// Aparência de cada categoria: um padrão de tecido/papel (quando não tem foto)
// e o ícone da técnica — o mesmo na home, no menu de categorias, na página da
// categoria e no cadastro de peça. Achado por palavra-chave no nome ou
// endereço, para categorias novas também ganharem um visual.
// Ícones "art-*" são desenhos próprios (public/icons/artenos-categorias.svg);
// os demais vêm do Bootstrap Icons.

export type CategoryLook = { icon: string; pattern: number };

const LOOKS: { match: RegExp; look: CategoryLook }[] = [
  { match: /ceramic|barro|argila/, look: { icon: "art-ceramica", pattern: 1 } },
  { match: /croche|trico|amigurumi-e-croche/, look: { icon: "art-croche", pattern: 2 } },
  { match: /bordado|renda/, look: { icon: "art-bordado", pattern: 3 } },
  { match: /tecelagem|tear/, look: { icon: "art-tear", pattern: 4 } },
  { match: /macrame/, look: { icon: "art-macrame", pattern: 5 } },
  { match: /fibra|palha|cestaria/, look: { icon: "art-cesto", pattern: 6 } },
  { match: /madeira|marcenaria/, look: { icon: "art-madeira", pattern: 7 } },
  { match: /costura/, look: { icon: "art-costura", pattern: 8 } },
  { match: /joia|bijuteria|acessorio/, look: { icon: "gem", pattern: 9 } },
  { match: /papelaria|encaderna|caderno/, look: { icon: "book", pattern: 10 } },
  { match: /vela|aroma|sabonete/, look: { icon: "art-vela", pattern: 11 } },
  { match: /\barte\b|pintura|ilustra/, look: { icon: "palette", pattern: 12 } },
  { match: /decora/, look: { icon: "art-decoracao", pattern: 13 } },
  { match: /brinquedo|amigurumi/, look: { icon: "art-brinquedo", pattern: 14 } },
  { match: /moda|roupa|vestuario/, look: { icon: "art-moda", pattern: 15 } },
];

export const PATTERN_COUNT = 15;

/** Categoria sem técnica reconhecida: etiqueta neutra. */
export const DEFAULT_CATEGORY_ICON = "tag";

const fold = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function categoryLook(category: { name: string; slug?: string | null }, index = 0): CategoryLook {
  const text = fold(`${category.slug ?? ""} ${category.name}`);
  const found = LOOKS.find((entry) => entry.match.test(text));
  return found?.look ?? { icon: DEFAULT_CATEGORY_ICON, pattern: (index % PATTERN_COUNT) + 1 };
}
