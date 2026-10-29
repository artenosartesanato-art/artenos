"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { LoaderCircle, Star } from "@/components/icons";
import { StarRating } from "@/components/stars";
import { getSupabase } from "@/lib/supabase";
import { findBlockedTerm, moderationError } from "@/lib/moderation";
import { REVIEW_MAX_LENGTH } from "@/lib/reviews";
import "./reviews.css";

type Received = {
  kind: "product" | "store"; review_id: string; rating: number; comment: string | null; author_name: string;
  product_name: string | null; created_at: string; store_reply: string | null; store_reply_at: string | null;
};

const date = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" });

function ReplyForm({ review, onSaved }: { review: Received; onSaved: () => void }) {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  async function save() {
    if (!text.trim()) return toast.error("Escreva a resposta.");
    if (findBlockedTerm(text)) return toast.error("A resposta contém termos que não são permitidos na Artenós.");
    if (!window.confirm("A resposta fica pública e não pode ser editada depois. Publicar?")) return;
    setSaving(true);
    const { error } = await getSupabase().rpc("reply_to_review", { p_kind: review.kind, p_review_id: review.review_id, p_reply: text.trim() });
    setSaving(false);
    if (error) return toast.error(moderationError(error) ?? "Não foi possível publicar a resposta.");
    toast.success("Resposta publicada.");
    onSaved();
  }
  return (
    <div className="seller-review-reply-form">
      <label className="an-field">
        <span>Responder publicamente (uma única vez)</span>
        <textarea rows={2} maxLength={REVIEW_MAX_LENGTH} value={text} onChange={(event) => setText(event.target.value)}
          placeholder="Agradeça, explique ou ofereça ajuda pelas mensagens." />
      </label>
      <button type="button" className="an-btn an-btn--sm" onClick={() => void save()} disabled={saving} aria-busy={saving}>
        {saving && <LoaderCircle size={14} className="spin" />} Publicar resposta
      </button>
    </div>
  );
}

export default function SellerReviewsPage() {
  const [rows, setRows] = useState<Received[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"all" | "pending">("all");

  const load = useCallback(async () => {
    const { data, error: loadError } = await getSupabase().rpc("list_my_received_reviews");
    if (loadError) setError("Não foi possível carregar as avaliações agora.");
    else { setRows((data ?? []) as Received[]); setError(""); }
    setLoading(false);
  }, []);
  useEffect(() => { queueMicrotask(() => void load()); }, [load]);

  const store = rows.filter((row) => row.kind === "store");
  const average = store.length ? store.reduce((sum, row) => sum + row.rating, 0) / store.length : null;
  const visible = rows.filter((row) => filter === "all" || !row.store_reply);

  return (
    <div className="seller-reviews">
      <header className="seller-reviews-heading">
        <p className="seller-eyebrow">Gestão da loja</p>
        <h1>Avaliações</h1>
        <p>O que compradoras e compradores disseram das suas peças e da loja. Responda com cuidado: a resposta é pública.</p>
        {average !== null && <StarRating avg={average} count={store.length} size={18} />}
      </header>
      <div className="seller-reviews-filter" role="group" aria-label="Mostrar">
        <button type="button" aria-pressed={filter === "all"} onClick={() => setFilter("all")}>Todas ({rows.length})</button>
        <button type="button" aria-pressed={filter === "pending"} onClick={() => setFilter("pending")}>
          Sem resposta ({rows.filter((row) => !row.store_reply).length})
        </button>
      </div>
      {loading ? (
        <p role="status"><LoaderCircle size={16} className="spin" /> Carregando…</p>
      ) : error ? (
        <p role="alert">{error}</p>
      ) : !visible.length ? (
        <div className="an-state"><Star size={28} /><p>Nenhuma avaliação por aqui ainda.</p></div>
      ) : (
        <ul className="an-reviews seller-reviews-list">
          {visible.map((review) => (
            <li key={`${review.kind}-${review.review_id}`} className="an-review">
              <header>
                <StarRating avg={review.rating} showCount={false} />
                <strong>{review.author_name}</strong>
                <small>{review.kind === "store" ? "Avaliação da loja" : `Peça: ${review.product_name}`} · {date.format(new Date(review.created_at))}</small>
              </header>
              {review.comment ? <p>{review.comment}</p> : <p className="seller-reviews-empty">Sem comentário.</p>}
              {review.store_reply
                ? <p className="an-review-reply"><strong>Sua resposta:</strong> {review.store_reply}</p>
                : <ReplyForm review={review} onSaved={() => void load()} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
