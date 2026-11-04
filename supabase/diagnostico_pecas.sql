-- Diagnóstico: por que uma peça não aparece na vitrine? (somente leitura)
-- Rode no SQL Editor do Supabase. Mostra as 30 peças mais recentes com o
-- motivo de cada uma estar (ou não) visível para os clientes.
-- Para olhar uma peça específica, troque o filtro do final por:
--   where p.name ilike '%parte do nome%'

select
  p.name                                   as peca,
  to_char(p.created_at at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') as criada_em,
  coalesce(art.store_name, art.full_name)  as loja,
  case
    when not p.active                          then 'NÃO APARECE: está como rascunho/pausada. No catálogo da loja, clique em "Publicar".'
    when art.account_type::text <> 'artisan'   then 'NÃO APARECE: a conta dona da peça não é de loja.'
    when art.approval_status::text <> 'active' then 'NÃO APARECE: a loja ainda não foi aprovada (situação: ' || art.approval_status::text || ').'
    when coalesce(art.account_status, 'active') <> 'active'
                                               then 'NÃO APARECE: a conta da loja está em exclusão/excluída.'
    when p.category_id is not null and not coalesce(cat.active, false)
                                               then 'APARECE SÓ NA HOME: a categoria "' || coalesce(cat.name, '?') || '" está desativada (some da listagem e da busca).'
    when p.category_id is null                 then 'APARECE, mas sem categoria (não entra no filtro por categoria).'
    when p.availability = 'sold_out'           then 'APARECE como "Esgotado": sem estoque e a loja não aceita encomendas (Minha loja > aceitar encomendas).'
    when p.availability = 'made_to_order'      then 'APARECE como "Sob encomenda" (não entra em "Pronta entrega" nem no filtro "Só pronta entrega").'
    else 'APARECE como "Pronta entrega".'
  end                                      as situacao,
  p.active                                 as publicada,
  p.availability                           as disponibilidade,
  p.stock                                  as estoque,
  cat.name                                 as categoria,
  cat.active                               as categoria_ativa,
  art.approval_status::text                as aprovacao_da_loja,
  s.accepts_custom_orders                  as loja_aceita_encomendas,
  s.vacation_mode                          as loja_em_ferias
from public.products p
join public.profiles art on art.id = p.artisan_id
left join public.storefront_categories cat on cat.id = p.category_id
left join public.artisan_store_settings s on s.artisan_id = p.artisan_id
order by p.created_at desc
limit 30;
