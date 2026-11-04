"use client";

import { useState } from "react";
import { toast } from "sonner";
import { LoaderCircle } from "@/components/icons";
import { StarInput, StarRating } from "@/components/stars";
import { getSupabase } from "@/lib/supabase";
import { findBlockedTerm, moderationError } from "@/lib/moderation";
import { canEditReview, REVIEW_MAX_LENGTH } from "@/lib/reviews";

export type Reviewable = {
  order_id: string; order_item_id: string; product_id: string | null; product_name: string;
  artisan_id: string; store_name: string;
  product_review_id: string | null; product_rating: number | null; product_comment: string | null; product_reviewed_at: string | null;
  store_review_id: string | null; store_rating: number | null; store_comment: string | null; store_reviewed_at: string | null;
};

function ReviewForm({ title, rating: initialRating, comment: initialComment, reviewedAt, onSubmit }: {
  title: string; rating: number | null; comment: string | null; reviewedAt: string | null;
  onSubmit: (rating: number, comment: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(!initialRating);
  const [rating, setRating] = useState(initialRating ?? 0);
  const [comment, setComment] = useState(initialComment ?? "");
  const [saving, setSaving] = useState(false);
  const editable = canEditReview(reviewedAt);

  async function save() {
    if (!rating) return toast.error("Escolha de 1 a 5 estrelas.");
    if (findBlockedTerm(comment)) return toast.error("O comentário contém termos que não são permitidos na Artenós.");
    setSaving(true);
    try {
      await onSubmit(rating, comment.trim());
      setEditing(false);
      toast.success("Avaliação salva. Obrigada!");
    } catch (error) {
      toast.error(moderationError(error) ?? (error instanceof Error ? error.message : "Não foi possível salvar a avaliação."));
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <div className="review-form is-done">
        <strong>{title}</strong>
        <StarRating avg={rating} showCount={false} />
        {comment && <p>{comment}</p>}
        {editable && <button type="button" className="an-btn an-btn--ghost an-btn--sm" onClick={() => setEditing(true)}>Editar avaliação</button>}
      </div>
    );
  }
  return (
    <div className="review-form">
      <StarInput label={title} value={rating} onChange={setRating} disabled={saving} />
      <label className="an-field">
        <span>Comentário (opcional)</span>
        <textarea rows={3} maxLength={REVIEW_MAX_LENGTH} value={comment} onChange={(event) => setComment(event.target.value)}
          placeholder="O que achou da peça, do acabamento, da embalagem?" />
      </label>
      <button type="button" className="an-btn an-btn--sm" onClick={() => void save()} disabled={saving} aria-busy={saving}>
        {saving && <LoaderCircle size={14} className="spin" />} Enviar avaliação
      </button>
    </div>
  );
}

/** Avaliação das peças e da loja num pedido entregue. */
export function OrderReviewPanel({ rows, onSaved }: { rows: Reviewable[]; onSaved: () => void }) {
  if (!rows.length) return null;
  const first = rows[0];
  async function call(fn: string, args: Record<string, unknown>) {
    const { error } = await getSupabase().rpc(fn, args);
    if (error) throw error;
    onSaved();
  }
  return (
    <section className="order-reviews" aria-label="Avaliar o pedido">
      <h3>Avalie sua compra</h3>
      <p>Sua avaliação aparece na página da peça e da loja, só com o seu primeiro nome. Você pode editar por 30 dias.</p>
      {rows.map((row) => (
        <ReviewForm key={row.order_item_id} title={`Peça: ${row.product_name}`} rating={row.product_rating}
          comment={row.product_comment} reviewedAt={row.product_reviewed_at}
          onSubmit={(rating, comment) => call("submit_product_review", { p_order_item_id: row.order_item_id, p_rating: rating, p_comment: comment || null })} />
      ))}
      <ReviewForm title={`Loja: ${first.store_name} (atendimento, prazo e embalagem)`} rating={first.store_rating}
        comment={first.store_comment} reviewedAt={first.store_reviewed_at}
        onSubmit={(rating, comment) => call("submit_store_review", { p_order_id: first.order_id, p_rating: rating, p_comment: comment || null })} />
    </section>
  );
}
