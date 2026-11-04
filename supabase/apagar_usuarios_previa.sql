-- PRÉVIA (não apaga nada): o que supabase/apagar_usuarios_manter_admin.sql vai apagar.
-- Fica só a conta artenosartesanato@gmail.com.
select
  (select count(*) from auth.users where lower(email) = 'artenosartesanato@gmail.com') as conta_mantida_encontrada,
  (select count(*) from public.admin_users a join auth.users u on u.id = a.user_id
     where lower(u.email) = 'artenosartesanato@gmail.com' and a.active) as conta_mantida_e_admin,
  (select string_agg(u.email, ', ') from public.admin_users a join auth.users u on u.id = a.user_id
     where lower(u.email) <> 'artenosartesanato@gmail.com') as outros_admins_que_serao_apagados,
  (select count(*) from auth.users where lower(email) <> 'artenosartesanato@gmail.com') as contas_que_serao_apagadas,
  (select count(*) from public.products) as pecas,
  (select count(*) from public.orders) as pedidos,
  (select count(*) from public.checkouts) as compras_e_pagamentos,
  (select count(*) from public.messages) as mensagens;
