#!/bin/bash
# Aplica, NUM SUPABASE LOCAL DE TESTE, os scripts do repositório + a reconstrução
# das tabelas/RPCs que não estão versionadas. Nunca rode em produção.
# Uso: DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres ./aplicar.sh
set -euo pipefail
cd "$(dirname "$0")"
DB_URL=${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}
case "$DB_URL" in *127.0.0.1*|*localhost*) ;; *) echo "Recusado: use apenas um banco local."; exit 1;; esac
while read -r file; do
  [ -z "$file" ] && continue
  echo "→ $file"
  psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f "$file"
done < ordem.txt
psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f 90_rpcs_ausentes.sql
# Conversas por produto dependem de conversations.custom_order_request_id (criada acima).
for file in ../../../supabase/conversas_produtos_topicos.sql ../../../supabase/contexto_conversas_produtos.sql; do
  echo "→ $file"
  psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f "$file"
done
echo "Pronto. Gere as imagens (python3 gen_images.py img) e rode o seed (SRK=<service_role local> python3 seed.py)."
