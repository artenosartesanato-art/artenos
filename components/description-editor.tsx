"use client";

import { useEffect, useId, useRef, useState } from "react";
import { DESCRIPTION_MAX_LENGTH, blocksToRichText, richTextToHtml, type Block, type Inline } from "@/lib/rich-text";

type Command = "bold" | "insertUnorderedList" | "insertOrderedList" | "undo" | "redo" | "removeFormat";

/** Lê o conteúdo do editor (DOM) como blocos: parágrafos e listas, com negrito. */
function readBlocks(root: HTMLElement): Block[] {
  const blocks: Block[] = [];
  let loose: Inline[][] = [[]];
  const isBold = (element: Element) => /^(B|STRONG)$/.test(element.tagName)
    || Number.parseInt(getComputedStyle(element).fontWeight, 10) >= 600;

  function inline(node: Node, bold: boolean, lines: Inline[][]) {
    if (node.nodeType === Node.TEXT_NODE) {
      lines[lines.length - 1].push({ text: (node.textContent ?? "").replace(/ /g, " ").replace(/\n/g, " "), bold });
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    if (node.tagName === "BR") { lines.push([]); return; }
    const childBold = bold || isBold(node);
    node.childNodes.forEach((child) => inline(child, childBold, lines));
  }
  const flushLoose = () => {
    if (loose.some((line) => line.length)) blocks.push({ type: "paragraph", lines: loose });
    loose = [[]];
  };
  function block(node: Node) {
    if (node instanceof HTMLElement && /^(UL|OL)$/.test(node.tagName)) {
      flushLoose();
      const items: Inline[][] = [];
      node.querySelectorAll(":scope > li").forEach((li) => {
        const lines: Inline[][] = [[]];
        inline(li, false, lines);
        items.push(lines.flat());
      });
      blocks.push({ type: "list", ordered: node.tagName === "OL", items });
      return;
    }
    if (node instanceof HTMLElement && /^(P|DIV|H\d|BLOCKQUOTE)$/.test(node.tagName)) {
      // Um parágrafo (Enter cria outro); dentro dele, Shift+Enter quebra a linha.
      if (node.querySelector("ul, ol")) { flushLoose(); node.childNodes.forEach(block); flushLoose(); return; }
      flushLoose();
      const lines: Inline[][] = [[]];
      inline(node, false, lines);
      if (lines.length > 1 && !lines[lines.length - 1].length) lines.pop();
      blocks.push({ type: "paragraph", lines });
      return;
    }
    inline(node, false, loose);
  }
  root.childNodes.forEach(block);
  flushLoose();
  return blocks;
}

/**
 * Descrição com barra de ferramentas (negrito, listas, desfazer), como num
 * editor de texto: o que a pessoa vê é o que vai aparecer na página. O texto é
 * guardado no mesmo formato simples de sempre (**negrito**, "- " e "1. "),
 * então nada do que a loja escreve vira HTML na vitrine.
 */
export function DescriptionEditor({ value, onChange, label = "Descrição", minLength = 20, maxLength = DESCRIPTION_MAX_LENGTH, placeholder }: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  minLength?: number;
  maxLength?: number;
  placeholder?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const lastValue = useRef<string | null>(null);
  const labelId = useId();
  const helpId = useId();
  const [active, setActive] = useState({ bold: false, ul: false, ol: false });

  // Mostra o texto vindo de fora (abrir para editar, limpar o formulário) sem
  // reescrever enquanto a pessoa digita (o cursor pularia).
  useEffect(() => {
    const element = ref.current;
    if (!element || value === lastValue.current) return;
    element.innerHTML = richTextToHtml(value);
    lastValue.current = value;
  }, [value]);

  useEffect(() => {
    try { document.execCommand("defaultParagraphSeparator", false, "p"); } catch { /* navegador sem suporte */ }
    const update = () => {
      const element = ref.current;
      if (!element || !element.contains(document.getSelection()?.anchorNode ?? null)) return;
      setActive({
        bold: document.queryCommandState("bold"),
        ul: document.queryCommandState("insertUnorderedList"),
        ol: document.queryCommandState("insertOrderedList"),
      });
    };
    document.addEventListener("selectionchange", update);
    return () => document.removeEventListener("selectionchange", update);
  }, []);

  function sync() {
    const element = ref.current;
    if (!element) return;
    const next = blocksToRichText(readBlocks(element));
    lastValue.current = next;
    onChange(next);
  }

  function run(command: Command) {
    ref.current?.focus();
    document.execCommand(command, false);
    sync();
  }

  const length = value.length;
  const tools: { command: Command; label: string; icon: React.ReactNode; pressed?: boolean; shortcut?: string }[] = [
    { command: "bold", label: "Negrito", shortcut: "Ctrl+B", pressed: active.bold, icon: <b className="rte-bold-icon">B</b> },
    { command: "insertUnorderedList", label: "Lista com marcadores", pressed: active.ul, icon: <ListIcon /> },
    { command: "insertOrderedList", label: "Lista numerada", pressed: active.ol, icon: <NumberedIcon /> },
    { command: "removeFormat", label: "Limpar formatação", icon: <ClearIcon /> },
    { command: "undo", label: "Desfazer", shortcut: "Ctrl+Z", icon: <UndoIcon /> },
    { command: "redo", label: "Refazer", shortcut: "Ctrl+Y", icon: <UndoIcon flip /> },
  ];

  return (
    <div className="description-editor rte">
      <span id={labelId} className="rte-label">{label}</span>
      <div className="rte-box">
        <div className="rte-toolbar" role="toolbar" aria-label="Formatação do texto" aria-controls={`${labelId}-campo`}>
          {tools.map((tool, index) => (
            <button key={tool.command} type="button" className={index === 3 ? "rte-tool rte-tool--sep" : "rte-tool"}
              onMouseDown={(event) => event.preventDefault()} onClick={() => run(tool.command)}
              aria-label={tool.label} title={tool.shortcut ? `${tool.label} (${tool.shortcut})` : tool.label}
              aria-pressed={tool.pressed === undefined ? undefined : tool.pressed}>
              {tool.icon}
            </button>
          ))}
        </div>
        <div ref={ref} id={`${labelId}-campo`} className="rte-area" contentEditable suppressContentEditableWarning
          role="textbox" aria-multiline="true" aria-labelledby={labelId} aria-describedby={helpId}
          data-placeholder={placeholder} data-empty={length === 0 ? "true" : undefined}
          onInput={sync}
          onBeforeInput={(event) => {
            // Limite de caracteres: bloqueia só o que acrescenta texto.
            const type = (event.nativeEvent as InputEvent).inputType ?? "";
            if (length >= maxLength && type.startsWith("insert") && type !== "insertParagraph") event.preventDefault();
          }}
          onPaste={(event) => {
            // Colar sempre como texto simples (sem cores e fontes de outros sites).
            event.preventDefault();
            const text = event.clipboardData.getData("text/plain").slice(0, Math.max(0, maxLength - length));
            document.execCommand("insertText", false, text);
            sync();
          }} />
      </div>
      <small id={helpId} className={`rte-help${length > maxLength ? " is-over" : ""}`}>
        {length}/{maxLength} caracteres{length > 0 && length < minLength ? ` · mínimo de ${minLength}` : ""}
        <span> · Enter cria um parágrafo; Shift+Enter quebra a linha.</span>
      </small>
    </div>
  );
}

function ListIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <circle cx="3.5" cy="4.5" r="1.5" fill="currentColor" /><circle cx="3.5" cy="9" r="1.5" fill="currentColor" /><circle cx="3.5" cy="13.5" r="1.5" fill="currentColor" />
      <path d="M7 4.5h9M7 9h9M7 13.5h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function NumberedIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <text x="0.5" y="6.5" fontSize="5.5" fontWeight="700" fill="currentColor" fontFamily="system-ui, sans-serif">1</text>
      <text x="0.5" y="11" fontSize="5.5" fontWeight="700" fill="currentColor" fontFamily="system-ui, sans-serif">2</text>
      <text x="0.5" y="15.5" fontSize="5.5" fontWeight="700" fill="currentColor" fontFamily="system-ui, sans-serif">3</text>
      <path d="M7 4.5h9M7 9h9M7 13.5h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function ClearIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M4 4h10M9 4l-2.5 10" /><path d="M11.5 11.5l4 4M15.5 11.5l-4 4" />
    </svg>
  );
}

function UndoIcon({ flip = false }: { flip?: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6"
      strokeLinecap="round" strokeLinejoin="round" style={flip ? { transform: "scaleX(-1)" } : undefined}>
      <path d="M6 4L2.5 7.5 6 11" /><path d="M3 7.5h7.5a4.5 4.5 0 010 9H8" />
    </svg>
  );
}
