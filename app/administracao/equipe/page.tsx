"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, ShieldCheck, UserRoundCheck } from "@/components/icons";
import { useAdmin } from "@/components/admin-shell";
import { AdminPageHead, Badge, LoadState, friendlyError } from "@/components/admin-ui";
import { getSupabase } from "@/lib/supabase";
import { ADMIN_ROLE_LABEL, formatDate, type AdminRole } from "@/lib/admin";

type Member = {
  user_id: string; email: string; display_name: string; role: AdminRole; active: boolean; created_at: string; last_sign_in_at: string | null;
};

export default function TeamPage() {
  const { account } = useAdmin();
  const owner = account.role === "owner";
  const [rows, setRows] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AdminRole>("reviewer");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data, error: loadError } = await getSupabase().rpc("admin_list_team");
    if (loadError) setError(friendlyError(loadError, "Não foi possível carregar a equipe."));
    else setRows((data ?? []) as Member[]);
    setLoading(false);
  }, []);

  useEffect(() => { queueMicrotask(() => void load()); }, [load]);

  async function saveMember(memberEmail: string, memberRole: AdminRole, active: boolean, key: string, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return false;
    setBusy(key);
    const { error: saveError } = await getSupabase().rpc("admin_save_team_member", {
      p_email: memberEmail, p_role: memberRole, p_active: active,
    });
    setBusy(null);
    if (saveError) {
      toast.error(friendlyError(saveError, "Não foi possível atualizar a equipe."));
      return false;
    }
    void load();
    return true;
  }

  async function add(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const clean = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
      toast.error("Informe um e-mail válido.");
      return;
    }
    if (await saveMember(clean, role, true, "novo", `Dar acesso de ${ADMIN_ROLE_LABEL[role].toLowerCase()} para ${clean}?`)) {
      toast.success("Acesso concedido. A pessoa entra com a própria conta.");
      setEmail("");
    }
  }

  return (
    <div className="adm-page">
      <AdminPageHead eyebrow="Plataforma" title="Equipe administrativa"
        description="Quem acessa este painel. Revisoras analisam lojas e acompanham a operação; a proprietária também altera tarifa e equipe." />
      {owner ? (
        <form className="adm-card adm-form adm-form--inline" onSubmit={add}>
          <h2><UserRoundCheck size={18} /> Dar acesso</h2>
          <label className="adm-field">
            <span>E-mail da conta Artenós</span>
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="pessoa@exemplo.com" required />
          </label>
          <label className="adm-field">
            <span>Papel</span>
            <select value={role} onChange={(event) => setRole(event.target.value as AdminRole)}>
              <option value="reviewer">Revisora</option>
              <option value="owner">Proprietária</option>
            </select>
          </label>
          <button type="submit" className="adm-btn" disabled={busy === "novo"}>
            {busy === "novo" && <Loader2 size={15} className="admin-spin" />} Dar acesso
          </button>
          <small>A pessoa precisa ter criado a conta no site antes.</small>
        </form>
      ) : <p className="adm-note">Somente a proprietária pode alterar a equipe.</p>}

      <LoadState loading={loading} error={error} onRetry={() => void load()}>
        <div className="adm-table-wrap" tabIndex={0} role="region" aria-label="Tabela da equipe">
          <table className="adm-table">
            <thead>
              <tr>
                <th scope="col">Pessoa</th>
                <th scope="col">Papel</th>
                <th scope="col">Situação</th>
                <th scope="col">Último acesso</th>
                {owner && <th scope="col"><span className="an-visually-hidden">Ações</span></th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const self = row.user_id === account.userId;
                return (
                  <tr key={row.user_id}>
                    <th scope="row"><span className="adm-stack"><strong>{row.display_name}{self ? " (você)" : ""}</strong><small>{row.email}</small></span></th>
                    <td>
                      {owner && !self ? (
                        <select aria-label={`Papel de ${row.display_name}`} value={row.role} disabled={busy === row.user_id}
                          onChange={(event) => void saveMember(row.email, event.target.value as AdminRole, row.active, row.user_id,
                            `Mudar ${row.display_name} para ${ADMIN_ROLE_LABEL[event.target.value as AdminRole]}?`)}>
                          <option value="reviewer">Revisora</option>
                          <option value="owner">Proprietária</option>
                        </select>
                      ) : ADMIN_ROLE_LABEL[row.role]}
                    </td>
                    <td><Badge tone={row.active ? "ok" : "muted"}>{row.active ? "Ativa" : "Sem acesso"}</Badge></td>
                    <td>{row.last_sign_in_at ? formatDate(row.last_sign_in_at, true) : "—"}</td>
                    {owner && (
                      <td>
                        {!self && (
                          <button type="button" className="adm-link-btn" disabled={busy === row.user_id}
                            onClick={() => void saveMember(row.email, row.role, !row.active, row.user_id,
                              row.active ? `Retirar o acesso de ${row.display_name}?` : `Devolver o acesso de ${row.display_name}?`)}>
                            {row.active ? "Retirar acesso" : "Devolver acesso"}
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="adm-note"><ShieldCheck size={14} /> Toda mudança de acesso fica registrada em Atividade.</p>
      </LoadState>
    </div>
  );
}
