import { Check } from "@/components/icons";
import { storyChecklist } from "@/lib/text-quality";

/** O que falta na história da loja, marcado enquanto a pessoa digita. */
export function StoryChecklist({ value }: { value: string }) {
  return (
    <ul className="story-checklist" aria-label="Requisitos da história da loja">
      {storyChecklist(value).map((item) => (
        <li key={item.label} className={item.done ? "is-done" : ""}>
          <span aria-hidden="true">{item.done ? <Check size={12} /> : null}</span>
          {item.label}
          <span className="an-visually-hidden">{item.done ? " — ok" : " — pendente"}</span>
        </li>
      ))}
    </ul>
  );
}
