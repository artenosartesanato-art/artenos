// Gera supabase/moderacao_termos.sql a partir de config/termos-bloqueados.json.
// Uso: npm run moderacao:sql (depois execute o arquivo gerado no SQL Editor).
import { readFileSync, writeFileSync } from "node:fs";

const root = new URL("..", import.meta.url);
const { termos } = JSON.parse(readFileSync(new URL("config/termos-bloqueados.json", root), "utf8"));
const unique = [...new Set(termos.map((term) => String(term).trim().toLowerCase()).filter(Boolean))].sort();
const quote = (value) => `'${value.replace(/'/g, "''")}'`;

const sql = `-- GERADO por scripts/gerar-termos-moderacao.mjs a partir de config/termos-bloqueados.json.
-- Não edite à mão: altere o JSON e rode \`npm run moderacao:sql\`.
-- Execute no SQL Editor depois de migrations/20261029_moderacao_chat.sql.
begin;
delete from public.moderation_blocked_terms;
insert into public.moderation_blocked_terms(term) values
${unique.map((term) => `  (${quote(term)})`).join(",\n")};
commit;
`;
writeFileSync(new URL("supabase/moderacao_termos.sql", root), sql);
console.log(`${unique.length} termos gravados em supabase/moderacao_termos.sql`);
