"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Download, LoaderCircle, Trash2 } from "@/components/icons";
import { Dialog } from "@/components/ui/dialog";
import { getSupabase } from "@/lib/supabase";
import { endSession } from "@/lib/session";

async function authHeader() {
  const { data } = await getSupabase().auth.getSession();
  if (!data.session) throw new Error("Sua sessão expirou. Entre novamente.");
  return { Authorization: `Bearer ${data.session.access_token}` };
}

/** "Privacidade e dados" em Minha conta: baixar os dados e excluir a conta (LGPD, art. 18). */
export function AccountPrivacy() {
  const [exporting, setExporting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  async function exportData() {
    setExporting(true);
    try {
      const response = await fetch("/api/conta/exportar", { headers: await authHeader() });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || "Não foi possível gerar o arquivo agora.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `artenos-meus-dados-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success("Arquivo com seus dados baixado.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível gerar o arquivo agora.");
    } finally {
      setExporting(false);
    }
  }

  async function deleteAccount() {
    setDeleting(true);
    setDeleteError("");
    try {
      const response = await fetch("/api/conta/excluir", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ confirm: confirmText }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(body.error || "Não foi possível excluir a conta agora.");
      await endSession("local").catch(() => null);
      window.location.assign("/?conta=excluida");
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Não foi possível excluir a conta agora.");
      setDeleting(false);
    }
  }

  return (
    <section className="profile-card profile-privacy" aria-labelledby="privacidade-titulo">
      <h2 id="privacidade-titulo">Privacidade e dados</h2>
      <p>Você pode baixar uma cópia dos seus dados ou excluir sua conta. Saiba mais na <a href="/privacidade">Política de Privacidade</a>.</p>
      <div className="profile-privacy-actions">
        <button type="button" className="an-btn an-btn--secondary" onClick={() => void exportData()} disabled={exporting} aria-busy={exporting}>
          {exporting ? <LoaderCircle size={16} className="spin" /> : <Download size={16} />} Baixar meus dados
        </button>
        <button type="button" className="an-btn an-btn--danger" onClick={() => { setConfirmText(""); setDeleteError(""); setConfirmOpen(true); }}>
          <Trash2 size={16} /> Excluir minha conta
        </button>
      </div>
      <Dialog open={confirmOpen} onClose={() => { if (!deleting) setConfirmOpen(false); }} labelledBy="excluir-conta-titulo" closeButton>
        <div className="profile-delete-dialog">
          <h2 id="excluir-conta-titulo">Excluir sua conta?</h2>
          <p>Seu nome, documento, contatos, endereço, favoritos, carrinho e avisos são apagados ou anonimizados, e o acesso é encerrado. Lojas têm as peças retiradas da vitrine.</p>
          <p>Pedidos, pagamentos e notas fiscais ficam guardados pelo prazo exigido por lei, sem os seus dados de contato. Não é possível excluir com pedidos em andamento ou repasses pendentes.</p>
          <label className="an-field">
            <span>Para confirmar, digite EXCLUIR</span>
            <input value={confirmText} onChange={(event) => setConfirmText(event.target.value)} autoComplete="off" data-autofocus />
          </label>
          {deleteError && <p className="an-field-error" role="alert">{deleteError}</p>}
          <div className="profile-delete-actions">
            <button type="button" className="an-btn an-btn--ghost" onClick={() => setConfirmOpen(false)} disabled={deleting}>Cancelar</button>
            <button type="button" className="an-btn an-btn--danger" onClick={() => void deleteAccount()}
              disabled={deleting || confirmText.trim().toUpperCase() !== "EXCLUIR"} aria-busy={deleting}>
              {deleting && <LoaderCircle size={16} className="spin" />} Excluir definitivamente
            </button>
          </div>
        </div>
      </Dialog>
    </section>
  );
}
