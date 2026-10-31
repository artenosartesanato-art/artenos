"use client";

import { useCallback, useEffect, useState } from "react";
import { UserRound } from "@/components/icons";
import { AdminPageHead, Badge, LoadState, Pagination, SearchBar, friendlyError } from "@/components/admin-ui";
import { SuspensionStatus, useAdminSuspensions } from "@/components/admin-suspensions";
import { getSupabase } from "@/lib/supabase";
import { PAGE_SIZE, brl, formatDate } from "@/lib/admin";

type ClientRow = {
  client_id: string; full_name: string; email: string | null; phone: string | null; city: string | null; state: string | null;
  joined_at: string; orders_count: number; total_spent: number; last_order_at: string | null; total_count: number;
};

export default function ClientsPage() {
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [rows, setRows] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const { suspensions, reloadSuspensions } = useAdminSuspensions();

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data, error: loadError } = await getSupabase().rpc("admin_list_clients", {
      p_query: query || null, p_limit: PAGE_SIZE, p_offset: offset,
    });
    if (loadError) setError(friendlyError(loadError, "Não foi possível carregar os clientes."));
    else setRows((data ?? []) as ClientRow[]);
    setLoading(false);
  }, [query, offset]);

  useEffect(() => { queueMicrotask(() => void load()); }, [load]);

  const total = Number(rows[0]?.total_count ?? 0);
  return (
    <div className="adm-page">
      <AdminPageHead eyebrow="Operação" title="Clientes"
        description="Contas de quem compra, com o histórico de pedidos. Dados pessoais: use apenas para atendimento." />
      <div className="adm-toolbar">
        <SearchBar label="Buscar clientes" value={input} onChange={setInput} placeholder="Nome, e-mail, telefone ou cidade"
          onSubmit={() => { setOffset(0); setQuery(input.trim()); }} />
      </div>
      <LoadState loading={loading} error={error} onRetry={() => void load()}>
        {rows.length ? (
          <>
            <p className="adm-count" aria-live="polite">{total} {total === 1 ? "cliente" : "clientes"}</p>
            <div className="adm-table-wrap" tabIndex={0} role="region" aria-label="Tabela de clientes">
              <table className="adm-table">
                <thead>
                  <tr>
                    <th scope="col">Cliente</th>
                    <th scope="col">Contato</th>
                    <th scope="col">Situação</th>
                    <th scope="col">Cidade</th>
                    <th scope="col" className="is-num">Pedidos</th>
                    <th scope="col" className="is-num">Total comprado</th>
                    <th scope="col">Última compra</th>
                    <th scope="col">Desde</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.client_id}>
                      <th scope="row"><strong>{row.full_name}</strong></th>
                      <td><span className="adm-stack"><span>{row.email || "—"}</span><small>{row.phone || ""}</small></span></td>
                      <td>
                        {suspensions.get(row.client_id)
                          ? <SuspensionStatus userId={row.client_id} until={suspensions.get(row.client_id)!} onChanged={() => void reloadSuspensions()} />
                          : <Badge tone="ok">Ativa</Badge>}
                      </td>
                      <td>{[row.city, row.state].filter(Boolean).join("/") || "—"}</td>
                      <td className="is-num">{row.orders_count}</td>
                      <td className="is-num">{brl(row.total_spent)}</td>
                      <td>{row.last_order_at ? formatDate(row.last_order_at) : "—"}</td>
                      <td>{formatDate(row.joined_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination offset={offset} total={total} pageSize={PAGE_SIZE} onChange={setOffset} />
          </>
        ) : (
          <div className="adm-state"><UserRound size={26} /><p>Nenhum cliente encontrado.</p></div>
        )}
      </LoadState>
    </div>
  );
}
