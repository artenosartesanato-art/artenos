"use client";

import { useEffect, useState } from "react";
import { LoaderCircle } from "@/components/icons";
import { StarRating } from "@/components/stars";
import { getSupabase } from "@/lib/supabase";

type Review = {
  review_id: string; rating: number; comment: string | null; author_name: string; created_at: string;
  store_reply: string | null; store_reply_at: string | null; total_count: number;
};

const date = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" });

/** Avaliações públicas de uma peça ou de uma loja, com a resposta da loja. */
export function ReviewsList({ kind, id, storeName, pageSize = 5 }: {
  kind: "product" | "store"; id: string; storeName?: string | null; pageSize?: number;
}) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  async function load(offset: number) {
    setLoading(true);
    const fn = kind === "product" ? "list_product_reviews" : "list_store_reviews";
    const args = kind === "product" ? { p_product_id: id } : { p_artisan_id: id };
    const { data, error } = await getSupabase().rpc(fn, { ...args, p_limit: pageSize, p_offset: offset });
    if (error) setFailed(true);
    else {
      const rows = (data ?? []) as Review[];
      setReviews((current) => (offset ? [...current, ...rows] : rows));
      setTotal(Number(rows[0]?.total_count ?? (offset ? total : 0)));
    }
    setLoading(false);
  }

  useEffect(() => {
    queueMicrotask(() => void load(0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, id]);

  if (failed) return null;
  if (loading && !reviews.length) return <p className="an-reviews-state" role="status"><LoaderCircle size={14} className="spin" /> Carregando avaliações…</p>;
  if (!reviews.length) return <p className="an-reviews-state">Ainda não há avaliações. Elas aparecem depois que compradores recebem os pedidos.</p>;
  return (
    <>
      <ul className="an-reviews">
        {reviews.map((review) => (
          <li key={review.review_id} className="an-review">
            <header>
              <StarRating avg={review.rating} showCount={false} />
              <strong>{review.author_name}</strong>
              <small>{date.format(new Date(review.created_at))}</small>
            </header>
            {review.comment && <p>{review.comment}</p>}
            {review.store_reply && (
              <p className="an-review-reply"><strong>Resposta de {storeName || "loja"}:</strong> {review.store_reply}</p>
            )}
          </li>
        ))}
      </ul>
      {reviews.length < total && (
        <button type="button" className="an-btn an-btn--ghost an-btn--sm" disabled={loading} onClick={() => void load(reviews.length)}>
          {loading ? "Carregando…" : "Ver mais avaliações"}
        </button>
      )}
    </>
  );
}
