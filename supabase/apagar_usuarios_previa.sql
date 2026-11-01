-- PRÉVIA (não apaga nada): o que supabase/apagar_usuarios_manter_admin.sql vai apagar.
-- Rode antes para conferir os números.
select
  (select count(*) from public.admin_users where active) as admins_que_ficam,
  (select string_agg(u.email, ', ') from auth.users u where u.id in (select user_id from public.admin_users)) as emails_dos_admins,
  (select count(*) from auth.users u where u.id not in (select user_id from public.admin_users)) as contas_que_serao_apagadas,
  (select count(*) from public.profiles p where p.account_type = 'client' and p.id not in (select user_id from public.admin_users)) as clientes,
  (select count(*) from public.profiles p where p.account_type = 'artisan' and p.id not in (select user_id from public.admin_users)) as vendedores,
  (select count(*) from public.products) as pecas,
  (select count(*) from public.orders) as pedidos,
  (select count(*) from public.checkouts) as compras_e_pagamentos,
  (select count(*) from public.messages) as mensagens;
