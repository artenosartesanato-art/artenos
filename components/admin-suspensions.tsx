"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge, friendlyError } from "@/components/admin-ui";
import { getSupabase } from "@/lib/supabase";
import { formatDate } from "@/lib/admin";

/** Suspensões de conta ativas (decisões de denúncias), por id da conta. */
export function useAdminSuspensions() {
  const [map, setMap] = useState<Map<string, string>>(new Map());
  const reload = useCallback(async () => {
    try {
      const { data, error } = await getSupabase().rpc("admin_list_suspensions");
      if (error) return; // migração ainda não rodada: sem a coluna de suspensão
      setMap(new Map(((data ?? []) as { user_id: string; suspended_until: string }[]).map((row) => [row.user_id, row.suspended_until])));
    } catch { /* segue sem */ }
  }, []);
  useEffect(() => { queueMicrotask(() => void reload()); }, [reload]);
  return { suspensions: map, reloadSuspensions: reload };
}

/** Selo "Suspensa até ..." com o botão para retirar a suspensão. */
export function SuspensionStatus({ userId, until, onChanged }: { userId: string; until: string; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  async function lift() {
    if (!window.confirm("Retirar a suspensão? A conta volta a funcionar normalmente.")) return;
    setBusy(true);
    const { error } = await getSupabase().rpc("admin_lift_suspension", { p_user_id: userId });
    setBusy(false);
    if (error) return toast.error(friendlyError(error, "Não foi possível retirar a suspensão."));
    toast.success("Suspensão retirada.");
    onChanged();
  }
  return (
    <span className="adm-stack adm-suspension">
      <Badge tone="alert">Suspensa até {formatDate(until)}</Badge>
      <button type="button" className="adm-link-btn" onClick={() => void lift()} disabled={busy}>Retirar suspensão</button>
    </span>
  );
}
