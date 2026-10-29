"use client";

import { useRef, useState } from "react";
import { RichText } from "@/components/rich-text";
import { DESCRIPTION_MAX_LENGTH } from "@/lib/rich-text";

/** Descrição com negrito e listas (marcações simples, sem HTML) e prévia. */
export function DescriptionEditor({ value, onChange, label = "Descrição", minLength = 20, maxLength = DESCRIPTION_MAX_LENGTH, placeholder }: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  minLength?: number;
  maxLength?: number;
  placeholder?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [preview, setPreview] = useState(false);

  function apply(kind: "bold" | "list") {
    const area = ref.current;
    if (!area) return;
    const { selectionStart: start, selectionEnd: end } = area;
    const selected = value.slice(start, end);
    let insert: string;
    if (kind === "bold") insert = `**${selected || "texto em negrito"}**`;
    else {
      const lines = (selected || "item da lista").split("\n");
      insert = lines.map((line) => (line.trim().startsWith("- ") ? line : `- ${line.trim()}`)).join("\n");
      if (start > 0 && value[start - 1] !== "\n") insert = `\n${insert}`;
    }
    const next = `${value.slice(0, start)}${insert}${value.slice(end)}`.slice(0, maxLength);
    onChange(next);
    requestAnimationFrame(() => { area.focus(); area.setSelectionRange(start + insert.length, start + insert.length); });
  }

  return (
    <div className="description-editor">
      <div className="description-editor-head">
        <span id="descricao-rotulo">{label}</span>
        <div className="description-editor-tools" role="toolbar" aria-label="Formatação">
          <button type="button" onClick={() => apply("bold")} aria-label="Negrito"><strong>N</strong></button>
          <button type="button" onClick={() => apply("list")}>Lista</button>
          <button type="button" aria-pressed={preview} onClick={() => setPreview((open) => !open)}>Prévia</button>
        </div>
      </div>
      {preview ? (
        <RichText className="description-editor-preview product-details-description" text={value || "Nada escrito ainda."} />
      ) : (
        <textarea ref={ref} aria-labelledby="descricao-rotulo" value={value} onChange={(event) => onChange(event.target.value)}
          minLength={minLength} maxLength={maxLength} rows={7} placeholder={placeholder} required aria-describedby="descricao-ajuda" />
      )}
      <small id="descricao-ajuda">
        {value.length}/{maxLength} · **negrito**, linhas com “- ” viram lista e linha em branco separa parágrafos.
      </small>
    </div>
  );
}
