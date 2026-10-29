"use client";

import { useId, useState } from "react";
import { toast } from "sonner";
import { getSupabase } from "@/lib/supabase";
import { findBlockedTerm, moderationError } from "@/lib/moderation";
import { NOTES_MAX_LENGTH } from "@/lib/rich-text";

/** "Observações para a loja" em peças sob encomenda: salvas ao sair do campo. */
export function CartItemNotes({ itemId, initial }: { itemId: string; initial: string | null | undefined }) {
  const id = useId();
  const [value, setValue] = useState(initial ?? "");
  const [saved, setSaved] = useState(initial ?? "");
  const [state, setState] = useState<"" | "saving" | "saved" | "error">("");

  async function save() {
    const next = value.trim();
    if (next === saved.trim()) return;
    if (findBlockedTerm(next)) {
      setState("error");
      return toast.error("As observações contêm termos que não são permitidos na Artenós.");
    }
    setState("saving");
    const { error } = await getSupabase().rpc("set_cart_item_notes", { p_item_id: itemId, p_notes: next || null });
    if (error) {
      setState("error");
      return toast.error(moderationError(error) ?? "Não foi possível salvar as observações. Tente novamente.");
    }
    setSaved(next);
    setState("saved");
  }

  return (
    <div className="cart-item-notes">
      <label htmlFor={id}>Observações para a loja <small>(opcional)</small></label>
      <textarea id={id} rows={2} maxLength={NOTES_MAX_LENGTH} value={value}
        placeholder="Ex.: cor, nome para personalizar, tamanho"
        onChange={(event) => { setValue(event.target.value); setState(""); }} onBlur={() => void save()} />
      <small aria-live="polite">
        {state === "saving" ? "Salvando…" : state === "saved" ? "Observações salvas." : state === "error" ? "Não salvo." : `${value.length}/${NOTES_MAX_LENGTH}`}
      </small>
    </div>
  );
}
