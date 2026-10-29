"use client";

import { useId, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Flag, LoaderCircle } from "@/components/icons";
import { Dialog } from "@/components/ui/dialog";
import { getSupabase } from "@/lib/supabase";

const REASONS = [
  { value: "ofensa", label: "Ofensa ou xingamento" },
  { value: "assedio", label: "Assédio ou ameaça" },
  { value: "golpe", label: "Tentativa de golpe ou pagamento por fora" },
  { value: "spam", label: "Propaganda ou spam" },
  { value: "outro", label: "Outro motivo" },
];

/** "Denunciar conversa": disponível para quem compra e para a loja. */
export function ReportConversationButton({ conversationId, partnerName }: { conversationId: string; partnerName: string }) {
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("ofensa");
  const [details, setDetails] = useState("");
  const [sending, setSending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    const { error } = await getSupabase().rpc("report_conversation", {
      p_conversation_id: conversationId, p_reason: reason, p_details: details.trim() || null,
    });
    setSending(false);
    if (error) return toast.error("Não foi possível enviar a denúncia agora. Tente novamente.");
    toast.success("Denúncia enviada. A equipe Artenós vai analisar a conversa.");
    setDetails("");
    setOpen(false);
  }

  return <>
    <button type="button" className="chat-report" onClick={() => setOpen(true)} aria-label="Denunciar conversa">
      <Flag size={15} /> <span>Denunciar</span>
    </button>
    <Dialog open={open} onClose={() => { if (!sending) setOpen(false); }} labelledBy={titleId} className="chat-report-dialog" closeButton>
      <form className="chat-report-body" onSubmit={submit}>
        <h2 id={titleId}>Denunciar conversa</h2>
        <p>Conte o que aconteceu na conversa com {partnerName}. A equipe Artenós lê as mensagens desta conversa para decidir.</p>
        <label className="an-field">
          <span>Motivo</span>
          <select value={reason} onChange={(event) => setReason(event.target.value)}>
            {REASONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
        <label className="an-field">
          <span>Detalhes (opcional)</span>
          <textarea rows={4} maxLength={1000} value={details} onChange={(event) => setDetails(event.target.value)} />
        </label>
        <div className="chat-report-actions">
          <button type="button" className="an-btn an-btn--ghost" onClick={() => setOpen(false)} disabled={sending}>Cancelar</button>
          <button type="submit" className="an-btn" disabled={sending} aria-busy={sending}>
            {sending && <LoaderCircle size={16} className="spin" />} Enviar denúncia
          </button>
        </div>
      </form>
    </Dialog>
  </>;
}
