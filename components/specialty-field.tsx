"use client";

import { useId, useState } from "react";
import { findBlockedTerm } from "@/lib/moderation";
import {
  OTHER_SPECIALTY, SPECIALTY_MAX, STORE_SPECIALTIES, resolveSpecialty, splitSpecialty,
} from "@/lib/store-specialties";

/**
 * Especialidade da loja: lista de opções e, em "Outro", um campo para digitar.
 * Avisa na hora se o texto tiver termo não permitido. Entrega ao pai o valor
 * final (o item da lista ou o que foi digitado). Para recarregar com um valor
 * vindo do servidor, troque a `key`.
 */
export function SpecialtyField({ value, onChange, labelClassName, label = "Especialidade principal", disabled = false }: {
  value: string;
  onChange: (value: string) => void;
  labelClassName?: string;
  label?: string;
  disabled?: boolean;
}) {
  const [initial] = useState(() => splitSpecialty(value));
  const [choice, setChoice] = useState(initial.choice);
  const [other, setOther] = useState(initial.other);
  // Foca o campo só quando a pessoa escolhe "Outro" (não ao abrir a página).
  const [picked, setPicked] = useState(false);
  const warningId = useId();
  const blocked = choice === OTHER_SPECIALTY && Boolean(findBlockedTerm(other));

  function update(nextChoice: string, nextOther: string) {
    setChoice(nextChoice);
    setOther(nextOther);
    onChange(resolveSpecialty(nextChoice, nextOther));
  }

  return (
    <>
      <label className={labelClassName}>
        <span>{label}</span>
        <select value={choice} onChange={(event) => { setPicked(true); update(event.target.value, other); }} required disabled={disabled}>
          <option value="" disabled>Selecione</option>
          {STORE_SPECIALTIES.map((item) => <option key={item}>{item}</option>)}
        </select>
      </label>
      {choice === OTHER_SPECIALTY && (
        <label className={labelClassName}>
          <span>Qual é a sua especialidade?</span>
          <input value={other} onChange={(event) => update(choice, event.target.value)} maxLength={SPECIALTY_MAX} required
            placeholder="Ex.: marchetaria, vitral, cestaria" disabled={disabled} autoFocus={picked}
            aria-invalid={blocked || undefined} aria-describedby={blocked ? warningId : undefined} />
          {blocked && (
            <small id={warningId} className="specialty-field-warning" role="alert">
              Esse texto tem termos que não são permitidos na Artenós.
            </small>
          )}
        </label>
      )}
    </>
  );
}
