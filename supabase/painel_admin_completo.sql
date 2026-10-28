-- Painel administrativo completo: métricas, vendedores, pedidos, clientes,
-- categorias, equipe e atividade. Execute no SQL Editor depois de
-- administracao_aprovacao.sql, painel_administrativo.sql e tarifa_plataforma.sql.
-- Pode ser executado de novo.
--
-- Segurança: todas as funções são security definer e começam conferindo se
-- quem chama é administrador ativo (public.is_active_admin). Gestão da equipe
-- exige papel "owner". Nenhuma tabela ganha política nova: o navegador só lê
-- o que estas funções devolvem.
begin;

-- Barreira comum. p_owner = true exige a proprietária.
create or replace function public.admin_assert(p_owner boolean default false)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not coalesce(public.is_active_admin(), false) then
    raise exception 'Acesso administrativo não autorizado';
  end if;
  if p_owner and not exists (
    select 1 from public.admin_users a
    where a.user_id = auth.uid() and a.active and a.role = 'owner'
  ) then
    raise exception 'Somente a proprietária pode fazer esta alteração';
  end if;
end;
$$;

-- Visão geral: tudo calculado na hora a partir das tabelas reais.
-- Venda válida = pedido que não foi cancelado nem reembolsado.
create or replace function public.admin_dashboard(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  days integer := least(greatest(coalesce(p_days, 30), 1), 365);
  since timestamptz := date_trunc('day', now()) - make_interval(days => days - 1);
  previous_since timestamptz := since - make_interval(days => days);
  result jsonb;
begin
  perform public.admin_assert();

  select jsonb_build_object(
    'period_days', days,
    'since', since,
    'sales', (
      select jsonb_build_object(
        'orders', count(*),
        'gmv', coalesce(sum(o.total_amount), 0),
        'products_amount', coalesce(sum(o.subtotal), 0),
        'shipping_amount', coalesce(sum(o.shipping_amount), 0),
        'platform_fee', coalesce(sum(o.platform_fee_amount), 0),
        'buyers', count(distinct o.client_id),
        'sellers', count(distinct o.artisan_id))
      from public.orders o
      where o.created_at >= since and o.status not in ('cancelled', 'refunded')),
    'sales_previous', (
      select jsonb_build_object(
        'orders', count(*),
        'gmv', coalesce(sum(o.total_amount), 0),
        'platform_fee', coalesce(sum(o.platform_fee_amount), 0))
      from public.orders o
      where o.created_at >= previous_since and o.created_at < since
        and o.status not in ('cancelled', 'refunded')),
    'cancelled', (
      select count(*) from public.orders o
      where o.created_at >= since and o.status in ('cancelled', 'refunded')),
    'orders_by_status', (
      select coalesce(jsonb_agg(jsonb_build_object('status', s.status, 'total', s.total) order by s.total desc), '[]'::jsonb)
      from (
        select o.status, count(*) as total from public.orders o
        where o.created_at >= since group by o.status
      ) s),
    'daily', (
      select jsonb_agg(jsonb_build_object(
          'day', d.day::date, 'orders', coalesce(x.orders, 0), 'gmv', coalesce(x.gmv, 0))
        order by d.day)
      from generate_series(since, date_trunc('day', now()), interval '1 day') as d(day)
      left join (
        select date_trunc('day', o.created_at) as day, count(*) as orders, sum(o.total_amount) as gmv
        from public.orders o
        where o.created_at >= since and o.status not in ('cancelled', 'refunded')
        group by 1
      ) x on x.day = d.day),
    'top_sellers', (
      select coalesce(jsonb_agg(t), '[]'::jsonb)
      from (
        select o.artisan_id,
          coalesce(nullif(p.store_name, ''), p.full_name, 'Loja') as store_name,
          count(*) as orders, sum(o.total_amount) as gmv
        from public.orders o
        left join public.profiles p on p.id = o.artisan_id
        where o.created_at >= since and o.status not in ('cancelled', 'refunded')
        group by o.artisan_id, p.store_name, p.full_name
        order by sum(o.total_amount) desc
        limit 5
      ) t),
    'top_categories', (
      select coalesce(jsonb_agg(t), '[]'::jsonb)
      from (
        select coalesce(c.name, 'Sem categoria') as name, sum(i.quantity) as units, sum(i.subtotal) as amount
        from public.order_items i
        join public.orders o on o.id = i.order_id
        left join public.products pr on pr.id = i.product_id
        left join public.storefront_categories c on c.id = pr.category_id
        where o.created_at >= since and o.status not in ('cancelled', 'refunded')
        group by c.name
        order by sum(i.subtotal) desc
        limit 5
      ) t),
    'sellers', (
      select jsonb_build_object(
        'active', count(*) filter (where p.approval_status = 'active'),
        'in_review', count(*) filter (where p.approval_status <> 'active'),
        'new', count(*) filter (where p.created_at >= since))
      from public.profiles p where p.account_type = 'artisan'),
    'applications', (
      select jsonb_build_object(
        'waiting', count(*) filter (where a.status in ('pending_review', 'under_review', 'changes_requested')),
        'suspended', count(*) filter (where a.status = 'suspended'))
      from public.artisan_applications a),
    'clients', (
      select jsonb_build_object(
        'total', count(*),
        'new', count(*) filter (where p.created_at >= since))
      from public.profiles p where p.account_type = 'client'),
    'products', (
      select jsonb_build_object(
        'active', count(*) filter (where pr.active),
        'out_of_stock', count(*) filter (where pr.active and pr.stock is not null and pr.stock <= 0),
        'new', count(*) filter (where pr.created_at >= since),
        'shops_with_products', count(distinct pr.artisan_id) filter (where pr.active))
      from public.products pr),
    'payouts', (
      select jsonb_build_object(
        'pending_amount', coalesce(sum(py.net_amount) filter (where py.status in ('pending', 'processing')), 0),
        'pending_count', count(*) filter (where py.status in ('pending', 'processing')),
        'failed_count', count(*) filter (where py.status = 'failed'),
        'paid_amount', coalesce(sum(py.net_amount) filter (where py.status = 'paid' and py.paid_at >= since), 0))
      from public.payouts py),
    'to_ship', (
      select count(*) from public.orders o where o.status in ('payment_confirmed', 'preparing')),
    'delivery_problems', (
      select count(*) from public.orders o where o.status = 'delivery_failed'),
    'messages', (select count(*) from public.messages m where m.created_at >= since),
    'custom_orders', (select count(*) from public.custom_order_requests r where r.created_at >= since)
  ) into result;

  return result;
end;
$$;

-- Vendedores (todas as contas de artesã), com números reais de cada loja.
-- p_status: active | suspended | in_review | rejected | null (todas).
create or replace function public.admin_list_sellers(
  p_status text default null,
  p_query text default null,
  p_limit integer default 30,
  p_offset integer default 0
)
returns table (
  artisan_id uuid,
  application_id uuid,
  seller_status text,
  store_name text,
  full_name text,
  email text,
  city text,
  state text,
  specialty text,
  joined_at timestamptz,
  products_active bigint,
  orders_total bigint,
  gmv numeric,
  last_order_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  term text := nullif(btrim(left(coalesce(p_query, ''), 100)), '');
begin
  perform public.admin_assert();
  return query
  with base as (
    select p.id, a.id as app_id,
      case
        when a.status = 'suspended' then 'suspended'
        when p.approval_status = 'active' then 'active'
        when a.status = 'rejected' then 'rejected'
        else 'in_review'
      end as status_value,
      p.store_name, p.full_name, p.email, p.city, p.state, p.specialty, p.created_at
    from public.profiles p
    left join public.artisan_applications a on a.artisan_id = p.id
    where p.account_type = 'artisan'
  ), filtered as (
    select b.* from base b
    where (p_status is null or b.status_value = p_status)
      and (term is null or concat_ws(' ', b.store_name, b.full_name, b.email, b.city, b.state, b.specialty) ilike '%' || term || '%')
  )
  select f.id, f.app_id, f.status_value, f.store_name, f.full_name, f.email, f.city, f.state, f.specialty, f.created_at,
    (select count(*) from public.products pr where pr.artisan_id = f.id and pr.active),
    s.orders, coalesce(s.gmv, 0), s.last_at,
    count(*) over ()
  from filtered f
  left join lateral (
    select count(*) as orders, sum(o.total_amount) as gmv, max(o.created_at) as last_at
    from public.orders o
    where o.artisan_id = f.id and o.status not in ('cancelled', 'refunded')
  ) s on true
  order by coalesce(s.gmv, 0) desc, f.created_at desc
  limit least(greatest(coalesce(p_limit, 30), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

-- Ficha completa de uma loja: dados, números, peças, pedidos e meses.
create or replace function public.admin_seller_detail(p_artisan_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  perform public.admin_assert();

  select jsonb_build_object(
    'artisan_id', p.id,
    'store_name', p.store_name,
    'full_name', p.full_name,
    'email', p.email,
    'phone', p.phone,
    'document', p.document,
    'city', p.city,
    'state', p.state,
    'specialty', p.specialty,
    'story', p.story,
    'approval_status', p.approval_status,
    'joined_at', p.created_at,
    'application', (
      select jsonb_build_object('id', a.id, 'number', a.application_number, 'status', a.status,
        'decision_reason', a.decision_reason, 'decided_at', a.decided_at)
      from public.artisan_applications a where a.artisan_id = p.id),
    'metrics', (
      select jsonb_build_object(
        'orders', count(*) filter (where o.status not in ('cancelled', 'refunded')),
        'cancelled', count(*) filter (where o.status in ('cancelled', 'refunded')),
        'gmv', coalesce(sum(o.total_amount) filter (where o.status not in ('cancelled', 'refunded')), 0),
        'platform_fee', coalesce(sum(o.platform_fee_amount) filter (where o.status not in ('cancelled', 'refunded')), 0),
        'to_ship', count(*) filter (where o.status in ('payment_confirmed', 'preparing')),
        'delivered', count(*) filter (where o.status = 'delivered'),
        'customers', count(distinct o.client_id),
        'last_order_at', max(o.created_at))
      from public.orders o where o.artisan_id = p.id),
    'catalog', (
      select jsonb_build_object(
        'active', count(*) filter (where pr.active),
        'inactive', count(*) filter (where not pr.active),
        'out_of_stock', count(*) filter (where pr.active and pr.stock is not null and pr.stock <= 0))
      from public.products pr where pr.artisan_id = p.id),
    'payouts', (
      select jsonb_build_object(
        'pending_amount', coalesce(sum(py.net_amount) filter (where py.status in ('pending', 'processing')), 0),
        'paid_amount', coalesce(sum(py.net_amount) filter (where py.status = 'paid'), 0))
      from public.payouts py where py.artisan_id = p.id),
    'products', (
      select coalesce(jsonb_agg(t order by t.created_at desc), '[]'::jsonb)
      from (
        select pr.id, pr.name, pr.price, pr.stock, pr.active, pr.image_url, pr.created_at
        from public.products pr where pr.artisan_id = p.id
        order by pr.created_at desc limit 12
      ) t),
    'recent_orders', (
      select coalesce(jsonb_agg(t order by t.created_at desc), '[]'::jsonb)
      from (
        select o.id, o.order_code, o.status, o.total_amount, o.created_at, o.product_name,
          c.full_name as client_name
        from public.orders o left join public.profiles c on c.id = o.client_id
        where o.artisan_id = p.id
        order by o.created_at desc limit 8
      ) t),
    'monthly', (
      select jsonb_agg(jsonb_build_object('month', m.month::date, 'orders', coalesce(x.orders, 0), 'gmv', coalesce(x.gmv, 0)) order by m.month)
      from generate_series(date_trunc('month', now()) - interval '5 months', date_trunc('month', now()), interval '1 month') as m(month)
      left join (
        select date_trunc('month', o.created_at) as month, count(*) as orders, sum(o.total_amount) as gmv
        from public.orders o
        where o.artisan_id = p.id and o.status not in ('cancelled', 'refunded')
          and o.created_at >= date_trunc('month', now()) - interval '5 months'
        group by 1
      ) x on x.month = m.month)
  ) into result
  from public.profiles p
  where p.id = p_artisan_id and p.account_type = 'artisan';

  if result is null then
    raise exception 'Vendedor não encontrado';
  end if;
  return result;
end;
$$;

-- Suspender/reativar pela tela de vendedores. Lojas aprovadas antes da fila
-- de aprovação não têm solicitação: ela é criada como "aprovada" (fica no
-- histórico como "Cadastro incluído") e a decisão segue o fluxo oficial.
create or replace function public.admin_seller_action(
  p_artisan_id uuid,
  p_action text,
  p_public_note text default null,
  p_internal_note text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  application_id uuid;
begin
  perform public.admin_assert();
  if p_action not in ('suspend', 'reactivate') then
    raise exception 'Esta ação não é permitida para a situação atual';
  end if;

  select a.id into application_id from public.artisan_applications a where a.artisan_id = p_artisan_id;
  -- Loja ativada direto no perfil, com a solicitação ainda em análise:
  -- alinha a solicitação ao perfil antes de decidir (fica no histórico).
  if application_id is not null then
    update public.artisan_applications a
    set status = 'approved', decided_at = coalesce(a.decided_at, now())
    from public.profiles p
    where a.id = application_id and p.id = a.artisan_id and p.approval_status = 'active'
      and a.status not in ('approved', 'suspended');
  end if;
  if application_id is null then
    insert into public.artisan_applications (artisan_id, status, submission_type, submitted_at, decided_at)
    select p.id, 'approved', 'standard', p.created_at, now()
    from public.profiles p
    where p.id = p_artisan_id and p.account_type = 'artisan' and p.approval_status = 'active'
    returning id into application_id;
  end if;
  if application_id is null then
    raise exception 'Vendedor não encontrado';
  end if;

  return public.admin_manage_artisan_application(application_id, p_action, p_public_note, p_internal_note);
end;
$$;

-- Pedidos de toda a plataforma. p_status: um status, 'open' (em andamento)
-- ou null (todos).
create or replace function public.admin_list_orders(
  p_status text default null,
  p_query text default null,
  p_limit integer default 30,
  p_offset integer default 0
)
returns table (
  order_id uuid,
  order_code text,
  status text,
  created_at timestamptz,
  product_name text,
  items_count bigint,
  subtotal numeric,
  shipping_amount numeric,
  total_amount numeric,
  platform_fee_amount numeric,
  client_name text,
  client_email text,
  artisan_id uuid,
  store_name text,
  shipping_city text,
  shipping_state text,
  carrier text,
  tracking_code text,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  term text := nullif(btrim(left(coalesce(p_query, ''), 100)), '');
begin
  perform public.admin_assert();
  return query
  select o.id, o.order_code, o.status, o.created_at, o.product_name,
    (select coalesce(sum(i.quantity), 0) from public.order_items i where i.order_id = o.id)::bigint,
    o.subtotal, o.shipping_amount, o.total_amount, o.platform_fee_amount,
    c.full_name, c.email, o.artisan_id, coalesce(nullif(s.store_name, ''), s.full_name),
    o.shipping_city, o.shipping_state, coalesce(o.shipping_company, o.carrier), o.tracking_code,
    count(*) over ()
  from public.orders o
  left join public.profiles c on c.id = o.client_id
  left join public.profiles s on s.id = o.artisan_id
  where (p_status is null
      or (p_status = 'open' and o.status in ('payment_confirmed', 'preparing', 'shipped', 'out_for_delivery', 'delivery_failed'))
      or o.status = p_status)
    and (term is null or concat_ws(' ', o.order_code, o.product_name, c.full_name, c.email, s.store_name, s.full_name, o.tracking_code)
      ilike '%' || term || '%')
  order by o.created_at desc
  limit least(greatest(coalesce(p_limit, 30), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

-- Clientes com o histórico de compras.
create or replace function public.admin_list_clients(
  p_query text default null,
  p_limit integer default 30,
  p_offset integer default 0
)
returns table (
  client_id uuid,
  full_name text,
  email text,
  phone text,
  city text,
  state text,
  joined_at timestamptz,
  orders_count bigint,
  total_spent numeric,
  last_order_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  term text := nullif(btrim(left(coalesce(p_query, ''), 100)), '');
begin
  perform public.admin_assert();
  return query
  select p.id, p.full_name, p.email, p.phone, p.city, p.state, p.created_at,
    coalesce(s.orders, 0), coalesce(s.spent, 0), s.last_at,
    count(*) over ()
  from public.profiles p
  left join lateral (
    select count(*) as orders, sum(o.total_amount) as spent, max(o.created_at) as last_at
    from public.orders o
    where o.client_id = p.id and o.status not in ('cancelled', 'refunded')
  ) s on true
  where p.account_type = 'client'
    and (term is null or concat_ws(' ', p.full_name, p.email, p.city, p.state, p.phone) ilike '%' || term || '%')
  order by p.created_at desc
  limit least(greatest(coalesce(p_limit, 30), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

-- Categorias da vitrine (inclusive as inativas) e o número de peças.
create or replace function public.admin_list_categories()
returns table (
  category_id uuid,
  name text,
  slug text,
  image_url text,
  sort_order integer,
  active boolean,
  products_active bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.admin_assert();
  return query
  select c.id, c.name, c.slug, c.image_url, c.sort_order, c.active,
    (select count(*) from public.products pr where pr.category_id = c.id and pr.active)
  from public.storefront_categories c
  order by c.sort_order, c.name;
end;
$$;

-- Cria (p_id nulo) ou altera uma categoria. Não apaga: desative para tirar da
-- vitrine sem soltar as peças da categoria.
create or replace function public.admin_save_category(
  p_id uuid,
  p_name text,
  p_slug text,
  p_image_url text,
  p_sort_order integer,
  p_active boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  clean_name text := btrim(coalesce(p_name, ''));
  clean_slug text := lower(btrim(coalesce(p_slug, '')));
  clean_image text := nullif(btrim(coalesce(p_image_url, '')), '');
  saved_id uuid;
begin
  perform public.admin_assert();
  if length(clean_name) < 2 or length(clean_name) > 60 then
    raise exception 'Nome da categoria: de 2 a 60 caracteres';
  end if;
  if clean_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(clean_slug) > 60 then
    raise exception 'Endereço da categoria: use letras minúsculas, números e hífens';
  end if;
  if clean_image is not null and (clean_image !~ '^https?://' or length(clean_image) > 600) then
    raise exception 'Imagem da categoria: endereço inválido';
  end if;
  if exists (select 1 from public.storefront_categories c where c.slug = clean_slug and c.id is distinct from p_id) then
    raise exception 'Já existe uma categoria com este endereço';
  end if;

  if p_id is null then
    insert into public.storefront_categories (name, slug, image_url, sort_order, active)
    values (clean_name, clean_slug, clean_image, coalesce(p_sort_order, 0), coalesce(p_active, true))
    returning id into saved_id;
  else
    update public.storefront_categories
    set name = clean_name, slug = clean_slug, image_url = clean_image,
      sort_order = coalesce(p_sort_order, sort_order), active = coalesce(p_active, active)
    where id = p_id
    returning id into saved_id;
    if saved_id is null then
      raise exception 'Categoria não encontrada';
    end if;
  end if;
  return saved_id;
end;
$$;

-- Equipe administrativa.
create or replace function public.admin_list_team()
returns table (
  user_id uuid,
  email text,
  display_name text,
  role text,
  active boolean,
  created_at timestamptz,
  last_sign_in_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.admin_assert();
  return query
  select a.user_id, u.email::text,
    coalesce(nullif(p.full_name, ''), nullif(u.raw_user_meta_data->>'full_name', ''), split_part(u.email::text, '@', 1)),
    a.role, a.active, a.created_at, u.last_sign_in_at
  from public.admin_users a
  join auth.users u on u.id = a.user_id
  left join public.profiles p on p.id = a.user_id
  order by a.active desc, a.role, a.created_at;
end;
$$;

-- Dá, altera ou retira acesso. A pessoa precisa ter conta na Artenós.
-- Ninguém altera o próprio acesso (evita a equipe ficar sem proprietária).
create or replace function public.admin_save_team_member(
  p_email text,
  p_role text,
  p_active boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  member_id uuid;
begin
  perform public.admin_assert(true);
  if p_role not in ('owner', 'reviewer') then
    raise exception 'Papel inválido';
  end if;
  select u.id into member_id from auth.users u where lower(u.email) = lower(btrim(coalesce(p_email, '')));
  if member_id is null then
    raise exception 'Nenhuma conta com este e-mail. Peça para a pessoa criar a conta na Artenós primeiro';
  end if;
  if member_id = auth.uid() then
    raise exception 'Você não pode alterar o seu próprio acesso';
  end if;

  insert into public.admin_users (user_id, role, active, created_by)
  values (member_id, p_role, coalesce(p_active, true), auth.uid())
  on conflict (user_id) do update set role = excluded.role, active = excluded.active, updated_at = now();
  return member_id;
end;
$$;

-- Atividade recente: decisões sobre lojas e mudanças na equipe.
create or replace function public.admin_recent_activity(p_limit integer default 60)
returns table (
  created_at timestamptz,
  area text,
  action text,
  actor_name text,
  subject_name text,
  status_from text,
  status_to text,
  public_note text,
  internal_note text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.admin_assert();
  return query
  select * from (
    select au.created_at, 'loja'::text, au.action,
      coalesce(nullif(actor.full_name, ''), nullif(actor_user.raw_user_meta_data->>'full_name', ''), actor_user.email::text, 'Sistema'),
      coalesce(nullif(subject.store_name, ''), subject.full_name, 'Loja'),
      au.status_from, au.status_to, au.public_note, au.internal_note
    from public.artisan_application_audit au
    left join public.profiles subject on subject.id = au.artisan_id
    left join public.profiles actor on actor.id = au.actor_user_id
    left join auth.users actor_user on actor_user.id = au.actor_user_id
    union all
    select tu.created_at, 'equipe'::text, tu.action,
      coalesce(nullif(actor.full_name, ''), nullif(actor_user.raw_user_meta_data->>'full_name', ''), actor_user.email::text, 'Sistema'),
      coalesce(subject_user.email::text, 'Conta removida'),
      tu.role_from, tu.role_to, null::text, null::text
    from public.admin_user_audit tu
    left join public.profiles actor on actor.id = tu.actor_user_id
    left join auth.users actor_user on actor_user.id = tu.actor_user_id
    left join auth.users subject_user on subject_user.id = tu.subject_user_id
  ) activity
  order by 1 desc
  limit least(greatest(coalesce(p_limit, 60), 1), 200);
end;
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.admin_assert(boolean)',
    'public.admin_dashboard(integer)',
    'public.admin_list_sellers(text, text, integer, integer)',
    'public.admin_seller_detail(uuid)',
    'public.admin_seller_action(uuid, text, text, text)',
    'public.admin_list_orders(text, text, integer, integer)',
    'public.admin_list_clients(text, integer, integer)',
    'public.admin_list_categories()',
    'public.admin_save_category(uuid, text, text, text, integer, boolean)',
    'public.admin_list_team()',
    'public.admin_save_team_member(text, text, boolean)',
    'public.admin_recent_activity(integer)'
  ] loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end $$;

commit;
