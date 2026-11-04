import { Fragment } from "react";
import { parseRichText, type Inline } from "@/lib/rich-text";

function Line({ parts }: { parts: Inline[] }) {
  return <>{parts.map((part, index) => part.bold ? <strong key={index}>{part.text}</strong> : <Fragment key={index}>{part.text}</Fragment>)}</>;
}

/** Descrição da peça: parágrafos, negrito e listas, sem HTML vindo do banco. */
export function RichText({ text, className }: { text: string | null | undefined; className?: string }) {
  const blocks = parseRichText(text);
  return (
    <div className={className}>
      {blocks.map((block, index) => block.type === "paragraph" ? (
        <p key={index}>
          {block.lines.map((line, lineIndex) => (
            <Fragment key={lineIndex}>{lineIndex > 0 && <br />}<Line parts={line} /></Fragment>
          ))}
        </p>
      ) : block.ordered ? (
        <ol key={index}>{block.items.map((item, itemIndex) => <li key={itemIndex}><Line parts={item} /></li>)}</ol>
      ) : (
        <ul key={index}>{block.items.map((item, itemIndex) => <li key={itemIndex}><Line parts={item} /></li>)}</ul>
      ))}
    </div>
  );
}
