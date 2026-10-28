"use client";

// Peças visuais do painel administrativo: cabeçalho de página, cartões de
// número, gráfico de barras (uma série, tooltip e tabela acessível), barras
// horizontais, busca, paginação e estados vazios/erro.
import { useId, useState } from "react";
import { AlertTriangle, ArrowRight, Loader2, RefreshCw, Search } from "@/components/icons";
import Link from "next/link";

export function AdminPageHead({ eyebrow, title, description, actions }: {
  eyebrow: string; title: string; description?: string; actions?: React.ReactNode;
}) {
  return (
    <header className="adm-head">
      <div>
        <p className="seller-eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {description && <p className="adm-head-text">{description}</p>}
      </div>
      {actions && <div className="adm-head-actions">{actions}</div>}
    </header>
  );
}

export function StatCard({ label, value, hint, delta, href, icon: Icon }: {
  label: string;
  value: string;
  hint?: string;
  /** Variação % sobre o período anterior; null = sem base de comparação. */
  delta?: number | null;
  href?: string;
  icon?: React.ComponentType<{ size?: number }>;
}) {
  const body = (
    <>
      <span className="adm-stat-label">{Icon && <Icon size={16} />} {label}</span>
      <strong className="adm-stat-value">{value}</strong>
      {(hint || delta !== undefined) && (
        <span className="adm-stat-foot">
          {delta !== undefined && delta !== null && (
            <span className={`adm-delta ${delta > 0 ? "is-up" : delta < 0 ? "is-down" : ""}`}>
              {delta > 0 ? "▲" : delta < 0 ? "▼" : "•"} {Math.abs(delta)}%
              <span className="an-visually-hidden"> em relação ao período anterior</span>
            </span>
          )}
          {hint && <span>{hint}</span>}
        </span>
      )}
      {href && <ArrowRight size={15} className="adm-stat-go" />}
    </>
  );
  return href
    ? <Link className="adm-stat is-link" href={href}>{body}</Link>
    : <div className="adm-stat">{body}</div>;
}

export type BarDatum = { key: string; label: string; short: string; value: number; detail?: string };

/**
 * Colunas de uma série (ex.: vendas por dia). Uma cor só (argila); o valor
 * aparece no tooltip e na tabela, nunca só pela altura ou cor.
 */
export function ColumnChart({ data, format, caption, height = 180 }: {
  data: BarDatum[]; format: (value: number) => string; caption: string; height?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const tableId = useId();
  const max = Math.max(...data.map((item) => item.value), 0);
  const ticks = max > 0 ? [max, max / 2, 0] : [0];
  // Rótulos do eixo X: no máximo ~8, para não encavalar.
  const every = Math.max(1, Math.ceil(data.length / 8));
  const current = hover !== null ? data[hover] : null;
  return (
    <figure className="adm-chart">
      <div className="adm-chart-plot" style={{ height }} onMouseLeave={() => setHover(null)}>
        <div className="adm-chart-grid" aria-hidden="true">
          {ticks.map((tick, index) => (
            <span key={index} style={{ bottom: `${max ? (tick / max) * 100 : 0}%` }}>{max ? format(tick) : ""}</span>
          ))}
        </div>
        {/* Só para o mouse: quem usa teclado ou leitor de tela lê a tabela abaixo. */}
        <div className="adm-chart-bars" aria-hidden="true">
          {data.map((item, index) => (
            <span key={item.key} className={`adm-chart-col${hover === index ? " is-hover" : ""}`}
              onMouseEnter={() => setHover(index)}>
              <span className="adm-chart-fill" style={{ height: `${max ? Math.max((item.value / max) * 100, item.value > 0 ? 2 : 0) : 0}%` }} />
            </span>
          ))}
        </div>
        {current && hover !== null && (
          <div className="adm-chart-tip" aria-hidden="true"
            style={{ left: `${((hover + 0.5) / data.length) * 100}%` }}>
            <strong>{format(current.value)}</strong>
            <span>{current.label}{current.detail ? ` · ${current.detail}` : ""}</span>
          </div>
        )}
      </div>
      <div className="adm-chart-axis" aria-hidden="true">
        {data.map((item, index) => {
          const last = index === data.length - 1;
          // O último sempre aparece; os regulares saem se ficarem colados nele.
          const show = last || (index % every === 0 && data.length - 1 - index >= every);
          return <span key={item.key}>{show ? item.short : ""}</span>;
        })}
      </div>
      <figcaption>
        {caption}. Passe o mouse nas colunas ou abra a tabela.
        <details>
          <summary>Ver em tabela</summary>
          <table id={tableId} className="adm-table adm-table--compact">
            <thead><tr><th scope="col">Período</th><th scope="col">Valor</th><th scope="col">Detalhe</th></tr></thead>
            <tbody>
              {data.map((item) => <tr key={item.key}><th scope="row">{item.label}</th><td>{format(item.value)}</td><td>{item.detail ?? ""}</td></tr>)}
            </tbody>
          </table>
        </details>
      </figcaption>
    </figure>
  );
}

/** Ranking em barras horizontais com nome e valor sempre escritos. */
export function RankBars({ items, format, empty }: {
  items: { key: string; label: string; value: number; detail?: string; href?: string }[];
  format: (value: number) => string;
  empty: string;
}) {
  if (!items.length) return <p className="adm-empty-line">{empty}</p>;
  const max = Math.max(...items.map((item) => item.value), 1);
  return (
    <ol className="adm-rank">
      {items.map((item) => {
        const content = (
          <>
            <span className="adm-rank-top">
              <span className="adm-rank-name">{item.label}</span>
              <strong>{format(item.value)}</strong>
            </span>
            <span className="adm-rank-track" aria-hidden="true">
              <span style={{ width: `${(item.value / max) * 100}%` }} />
            </span>
            {item.detail && <small>{item.detail}</small>}
          </>
        );
        return <li key={item.key}>{item.href ? <Link href={item.href}>{content}</Link> : <div>{content}</div>}</li>;
      })}
    </ol>
  );
}

export function SearchBar({ value, onChange, onSubmit, placeholder, label }: {
  value: string; onChange: (value: string) => void; onSubmit: () => void; placeholder: string; label: string;
}) {
  return (
    <form className="adm-search" role="search" onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
      <Search size={17} />
      <label className="an-visually-hidden" htmlFor={`${label}-busca`}>{label}</label>
      <input id={`${label}-busca`} type="search" value={value} onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder} maxLength={100} />
      <button type="submit">Buscar</button>
    </form>
  );
}

export function FilterChips<T extends string>({ value, options, onChange, label }: {
  value: T; options: { value: T; label: string; count?: number }[]; onChange: (value: T) => void; label: string;
}) {
  return (
    <div className="adm-chips" role="group" aria-label={label}>
      {options.map((option) => (
        <button key={option.value} type="button" aria-pressed={value === option.value} onClick={() => onChange(option.value)}>
          {option.label}
          {option.count !== undefined && <small>{option.count}</small>}
        </button>
      ))}
    </div>
  );
}

export function Pagination({ offset, total, pageSize, onChange }: {
  offset: number; total: number; pageSize: number; onChange: (offset: number) => void;
}) {
  if (total <= pageSize) return null;
  const page = Math.floor(offset / pageSize) + 1;
  const pages = Math.ceil(total / pageSize);
  return (
    <nav className="adm-pagination" aria-label="Paginação">
      <button type="button" disabled={offset === 0} onClick={() => onChange(Math.max(0, offset - pageSize))}>Anterior</button>
      <span>Página {page} de {pages}</span>
      <button type="button" disabled={offset + pageSize >= total} onClick={() => onChange(offset + pageSize)}>Próxima</button>
    </nav>
  );
}

export function LoadState({ loading, error, onRetry, children }: {
  loading: boolean; error: string; onRetry: () => void; children: React.ReactNode;
}) {
  if (loading) {
    return <div className="adm-state" role="status"><Loader2 className="admin-spin" size={26} /> Carregando…</div>;
  }
  if (error) {
    return (
      <div className="adm-state" role="alert">
        <AlertTriangle size={26} />
        <p>{error}</p>
        <button type="button" className="adm-btn" onClick={onRetry}><RefreshCw size={15} /> Tentar novamente</button>
      </div>
    );
  }
  return <>{children}</>;
}

export function Badge({ tone, children }: { tone: "ok" | "wait" | "alert" | "muted"; children: React.ReactNode }) {
  return <span className={`adm-badge is-${tone}`}>{children}</span>;
}

/** Mensagem de erro das funções do banco, sem detalhes técnicos. */
export function friendlyError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : typeof error === "object" && error && "message" in error
    ? String((error as { message: unknown }).message) : "";
  const known = ["Somente a proprietária", "Nenhuma conta com este e-mail", "Você não pode alterar", "Já existe uma categoria",
    "Nome da categoria", "Endereço da categoria", "Imagem da categoria", "orientação pública", "não é permitida"];
  if (message.includes("Could not find the function") || message.includes("PGRST202")) {
    return "O banco ainda não tem esta função. Execute supabase/painel_admin_completo.sql no SQL Editor.";
  }
  return known.some((text) => message.includes(text)) ? message : fallback;
}
