-- Artenós: avaliações de peças e de lojas (estrelas + comentário).
-- Execute UMA vez depois de 20261029_comprar_agora.sql (usa o filtro de
-- termos e a disponibilidade). Pode ser repetido.
--
-- Regras:
--   * só avalia quem comprou e teve o pedido marcado como entregue;
--   * uma avaliação por item de pedido (peça) e uma por pedido (loja);
--   * quem avaliou pode editar por 30 dias;
--   * a loja responde publicamente uma única vez por avaliação;
--   * comentários e respostas passam pelo filtro de termos;
--   * média e quantidade ficam em products/artisan_store_settings (trigger),
--     para o card, a loja e a ordenação "Mais bem avaliados".

begin;

alter table public.orders add column if not exists delivered_at timestamptz;
alter table public.orders add column if not exists review_reminder_sent_at timestamptz;

create table if not exists public.product_reviews (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null unique references public.order_items(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  artisan_id uuid not null references public.profiles(id) on delete cascade,
  client_id uuid not null references public.profiles(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  comment text check (comment is null or char_length(comment) <= 1000),
  status text not null default 'published' check (status in ('published', 'hidden')),
  store_reply text check (store_reply is null or char_length(store_reply) <= 1000),
  store_reply_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists product_reviews_product_idx on public.product_reviews (product_id, created_at desc);
create index if not exists product_reviews_artisan_idx on public.product_reviews (artisan_id, created_at desc);

create table if not exists public.store_reviews (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  artisan_id uuid not null references public.profiles(id) on delete cascade,
  client_id uuid not null references public.profiles(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  comment text check (comment is null or char_length(comment) <= 1000),
  status text not null default 'published' check (status in ('published', 'hidden')),
  store_reply text check (store_reply is null or char_length(store_reply) <= 1000),
  store_reply_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists store_reviews_artisan_idx on public.store_reviews (artisan_id, created_at desc);

alter table public.product_reviews enable row level security;
alter table public.store_reviews enable row level security;
revoke all on public.product_reviews, public.store_reviews from public, anon, authenticated;

alter table public.products
  add column if not exists rating_avg numeric(3,2),
  add column if not exists rating_count integer not null default 0;
alter table public.artisan_store_settings
  add column if not exists rating_avg numeric(3,2),
  add column if not exists rating_count integer not null default 0;

-- Comentário e resposta passam pelo filtro de termos.
create or replace function public.moderate_review_texts()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.comment is distinct from old.comment then perform public.moderation_assert_clean(new.comment); end if;
  if tg_op = 'INSERT' or new.store_reply is distinct from old.store_reply then perform public.moderation_assert_clean(new.store_reply); end if;
  return new;
end $$;
drop trigger if exists moderate_product_review on public.product_reviews;
create trigger moderate_product_review before insert or update on public.product_reviews
  for each row execute function public.moderate_review_texts();
drop trigger if exists moderate_store_review on public.store_reviews;
create trigger moderate_store_review before insert or update on public.store_reviews
  for each row execute function public.moderate_review_texts();

-- Médias em cache.
create or replace function public.refresh_rating_cache()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_product uuid; v_artisan uuid;
begin
  if tg_table_name = 'product_reviews' then
    for v_product in select unnest(array[case when tg_op <> 'INSERT' then old.product_id end,
                                         case when tg_op <> 'DELETE' then new.product_id end]) loop
      continue when v_product is null;
      update public.products p set
        rating_avg = (select round(avg(r.rating)::numeric, 2) from public.product_reviews r where r.product_id = v_product and r.status = 'published'),
        rating_count = (select count(*) from public.product_reviews r where r.product_id = v_product and r.status = 'published')
      where p.id = v_product;
    end loop;
  else
    v_artisan := coalesce(case when tg_op <> 'DELETE' then new.artisan_id end, old.artisan_id);
    insert into public.artisan_store_settings(artisan_id) values (v_artisan) on conflict (artisan_id) do nothing;
    update public.artisan_store_settings s set
      rating_avg = (select round(avg(r.rating)::numeric, 2) from public.store_reviews r where r.artisan_id = v_artisan and r.status = 'published'),
      rating_count = (select count(*) from public.store_reviews r where r.artisan_id = v_artisan and r.status = 'published')
    where s.artisan_id = v_artisan;
  end if;
  return null;
end $$;
drop trigger if exists refresh_product_rating on public.product_reviews;
create trigger refresh_product_rating after insert or update or delete on public.product_reviews
  for each row execute function public.refresh_rating_cache();
drop trigger if exists refresh_store_rating on public.store_reviews;
create trigger refresh_store_rating after insert or update or delete on public.store_reviews
  for each row execute function public.refresh_rating_cache();

-- Pedido entregue marca a data (para o lembrete de avaliação).
create or replace function public.stamp_order_delivered()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status = 'delivered' and new.delivered_at is null then new.delivered_at := now(); end if;
  return new;
end $$;
drop trigger if exists stamp_order_delivered on public.orders;
create trigger stamp_order_delivered before insert or update of status on public.orders
  for each row execute function public.stamp_order_delivered();

-- O que a pessoa pode avaliar (pedidos entregues) e o que já avaliou.
create or replace function public.list_my_reviewables()
returns table (
  order_id uuid, order_item_id uuid, product_id uuid, product_name text, image_url text,
  artisan_id uuid, store_name text, delivered_at timestamptz,
  product_review_id uuid, product_rating smallint, product_comment text, product_reviewed_at timestamptz,
  store_review_id uuid, store_rating smallint, store_comment text, store_reviewed_at timestamptz
) language sql stable security definer set search_path = '' as $$
  select o.id, i.id, i.product_id, i.product_name, i.image_url, o.artisan_id,
    coalesce(a.store_name, a.full_name), coalesce(o.delivered_at, o.updated_at),
    pr.id, pr.rating, pr.comment, pr.created_at, sr.id, sr.rating, sr.comment, sr.created_at
  from public.orders o
  join public.order_items i on i.order_id = o.id
  join public.profiles a on a.id = o.artisan_id
  left join public.product_reviews pr on pr.order_item_id = i.id
  left join public.store_reviews sr on sr.order_id = o.id
  where o.client_id = auth.uid() and o.status = 'delivered'
  order by coalesce(o.delivered_at, o.updated_at) desc, i.product_name;
$$;
revoke all on function public.list_my_reviewables() from public, anon;
grant execute on function public.list_my_reviewables() to authenticated;

create or replace function public.submit_product_review(p_order_item_id uuid, p_rating integer, p_comment text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_item record; v_existing public.product_reviews; v_id uuid;
begin
  if auth.uid() is null then raise exception 'Faça login para avaliar'; end if;
  if p_rating is null or p_rating not between 1 and 5 then raise exception 'Escolha de 1 a 5 estrelas'; end if;
  if char_length(coalesce(p_comment, '')) > 1000 then raise exception 'Use no máximo 1000 caracteres no comentário'; end if;
  select i.id, i.order_id, i.product_id, o.artisan_id, o.client_id, o.status into v_item
    from public.order_items i join public.orders o on o.id = i.order_id where i.id = p_order_item_id;
  if not found or v_item.client_id <> auth.uid() then raise exception 'Item de pedido não encontrado'; end if;
  if v_item.status <> 'delivered' then raise exception 'Você pode avaliar depois que o pedido for entregue'; end if;
  select * into v_existing from public.product_reviews where order_item_id = p_order_item_id;
  if found then
    if v_existing.created_at < now() - interval '30 days' then raise exception 'O prazo para editar esta avaliação terminou'; end if;
    update public.product_reviews set rating = p_rating, comment = nullif(btrim(p_comment), ''), updated_at = now()
      where id = v_existing.id returning id into v_id;
  else
    insert into public.product_reviews(order_item_id, order_id, product_id, artisan_id, client_id, rating, comment)
      values (p_order_item_id, v_item.order_id, v_item.product_id, v_item.artisan_id, auth.uid(), p_rating, nullif(btrim(p_comment), ''))
      returning id into v_id;
  end if;
  return v_id;
end $$;
revoke all on function public.submit_product_review(uuid, integer, text) from public, anon;
grant execute on function public.submit_product_review(uuid, integer, text) to authenticated;

create or replace function public.submit_store_review(p_order_id uuid, p_rating integer, p_comment text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_order public.orders; v_existing public.store_reviews; v_id uuid;
begin
  if auth.uid() is null then raise exception 'Faça login para avaliar'; end if;
  if p_rating is null or p_rating not between 1 and 5 then raise exception 'Escolha de 1 a 5 estrelas'; end if;
  if char_length(coalesce(p_comment, '')) > 1000 then raise exception 'Use no máximo 1000 caracteres no comentário'; end if;
  select * into v_order from public.orders where id = p_order_id;
  if not found or v_order.client_id <> auth.uid() then raise exception 'Pedido não encontrado'; end if;
  if v_order.status <> 'delivered' then raise exception 'Você pode avaliar depois que o pedido for entregue'; end if;
  select * into v_existing from public.store_reviews where order_id = p_order_id;
  if found then
    if v_existing.created_at < now() - interval '30 days' then raise exception 'O prazo para editar esta avaliação terminou'; end if;
    update public.store_reviews set rating = p_rating, comment = nullif(btrim(p_comment), ''), updated_at = now()
      where id = v_existing.id returning id into v_id;
  else
    insert into public.store_reviews(order_id, artisan_id, client_id, rating, comment)
      values (p_order_id, v_order.artisan_id, auth.uid(), p_rating, nullif(btrim(p_comment), ''))
      returning id into v_id;
  end if;
  return v_id;
end $$;
revoke all on function public.submit_store_review(uuid, integer, text) from public, anon;
grant execute on function public.submit_store_review(uuid, integer, text) to authenticated;

-- Resposta pública da loja: uma vez por avaliação.
create or replace function public.reply_to_review(p_kind text, p_review_id uuid, p_reply text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Faça login para responder'; end if;
  if nullif(btrim(coalesce(p_reply, '')), '') is null then raise exception 'Escreva a resposta'; end if;
  if char_length(p_reply) > 1000 then raise exception 'Use no máximo 1000 caracteres na resposta'; end if;
  if p_kind = 'product' then
    update public.product_reviews set store_reply = btrim(p_reply), store_reply_at = now()
      where id = p_review_id and artisan_id = auth.uid() and store_reply is null;
  elsif p_kind = 'store' then
    update public.store_reviews set store_reply = btrim(p_reply), store_reply_at = now()
      where id = p_review_id and artisan_id = auth.uid() and store_reply is null;
  else
    raise exception 'Tipo de avaliação inválido';
  end if;
  if not found then raise exception 'Avaliação não encontrada ou já respondida'; end if;
end $$;
revoke all on function public.reply_to_review(text, uuid, text) from public, anon;
grant execute on function public.reply_to_review(text, uuid, text) to authenticated;

-- Públicas: só o primeiro nome de quem avaliou.
create or replace function public.list_product_reviews(p_product_id uuid, p_limit integer default 10, p_offset integer default 0)
returns table (review_id uuid, rating smallint, comment text, author_name text, created_at timestamptz,
  store_reply text, store_reply_at timestamptz, total_count bigint)
language sql stable security definer set search_path = '' as $$
  select r.id, r.rating, r.comment, split_part(btrim(c.full_name), ' ', 1), r.created_at,
    r.store_reply, r.store_reply_at, count(*) over()
  from public.product_reviews r join public.profiles c on c.id = r.client_id
  where r.product_id = p_product_id and r.status = 'published'
  order by r.created_at desc
  limit least(greatest(coalesce(p_limit, 10), 1), 50) offset greatest(coalesce(p_offset, 0), 0);
$$;
revoke all on function public.list_product_reviews(uuid, integer, integer) from public;
grant execute on function public.list_product_reviews(uuid, integer, integer) to anon, authenticated;

create or replace function public.list_store_reviews(p_artisan_id uuid, p_limit integer default 10, p_offset integer default 0)
returns table (review_id uuid, rating smallint, comment text, author_name text, created_at timestamptz,
  store_reply text, store_reply_at timestamptz, total_count bigint, rating_avg numeric, rating_count integer)
language sql stable security definer set search_path = '' as $$
  select r.id, r.rating, r.comment, split_part(btrim(c.full_name), ' ', 1), r.created_at,
    r.store_reply, r.store_reply_at, count(*) over(), s.rating_avg, s.rating_count
  from public.store_reviews r join public.profiles c on c.id = r.client_id
  left join public.artisan_store_settings s on s.artisan_id = r.artisan_id
  where r.artisan_id = p_artisan_id and r.status = 'published'
  order by r.created_at desc
  limit least(greatest(coalesce(p_limit, 10), 1), 50) offset greatest(coalesce(p_offset, 0), 0);
$$;
revoke all on function public.list_store_reviews(uuid, integer, integer) from public;
grant execute on function public.list_store_reviews(uuid, integer, integer) to anon, authenticated;

create or replace function public.get_store_rating(p_artisan_id uuid)
returns table (rating_avg numeric, rating_count integer)
language sql stable security definer set search_path = '' as $$
  select s.rating_avg, coalesce(s.rating_count, 0) from public.artisan_store_settings s where s.artisan_id = p_artisan_id;
$$;
revoke all on function public.get_store_rating(uuid) from public;
grant execute on function public.get_store_rating(uuid) to anon, authenticated;

-- Painel da loja: avaliações recebidas (peças e loja) para responder.
create or replace function public.list_my_received_reviews()
returns table (kind text, review_id uuid, rating smallint, comment text, author_name text, product_name text,
  created_at timestamptz, store_reply text, store_reply_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select 'product', r.id, r.rating, r.comment, split_part(btrim(c.full_name), ' ', 1), i.product_name,
    r.created_at, r.store_reply, r.store_reply_at
  from public.product_reviews r join public.profiles c on c.id = r.client_id
  join public.order_items i on i.id = r.order_item_id
  where r.artisan_id = auth.uid()
  union all
  select 'store', r.id, r.rating, r.comment, split_part(btrim(c.full_name), ' ', 1), null,
    r.created_at, r.store_reply, r.store_reply_at
  from public.store_reviews r join public.profiles c on c.id = r.client_id
  where r.artisan_id = auth.uid()
  order by 7 desc
  limit 300;
$$;
revoke all on function public.list_my_received_reviews() from public, anon;
grant execute on function public.list_my_received_reviews() to authenticated;

-- Lembrete: pedidos entregues há 3+ dias, sem avaliação e sem lembrete.
-- Chamado pela rota /api/cron/avaliacoes (service_role), que também envia o e-mail.
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('mensagem', 'pedido', 'venda', 'encomenda', 'produto', 'avaliacao'));

create or replace function public.claim_review_reminders(p_limit integer default 50)
returns table (order_id uuid, client_id uuid, client_email text, client_name text, store_name text, product_name text)
language plpgsql security definer set search_path = '' as $$
begin
  return query
  with due as (
    select o.id from public.orders o
    where o.status = 'delivered' and o.review_reminder_sent_at is null
      and coalesce(o.delivered_at, o.updated_at) < now() - interval '3 days'
      and not exists (select 1 from public.store_reviews r where r.order_id = o.id)
    order by coalesce(o.delivered_at, o.updated_at)
    limit least(greatest(coalesce(p_limit, 50), 1), 200)
    for update skip locked
  ), marked as (
    update public.orders o set review_reminder_sent_at = now() from due where o.id = due.id
    returning o.id, o.client_id, o.artisan_id, o.product_name
  )
  select m.id, m.client_id, c.email, c.full_name, coalesce(a.store_name, a.full_name), m.product_name
  from marked m join public.profiles c on c.id = m.client_id join public.profiles a on a.id = m.artisan_id;
end $$;
revoke all on function public.claim_review_reminders(integer) from public, anon, authenticated;
grant execute on function public.claim_review_reminders(integer) to service_role;

create or replace function public.notify_review_reminder(p_order_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_order public.orders;
begin
  select * into v_order from public.orders where id = p_order_id;
  if not found then return; end if;
  perform public.push_notification(v_order.client_id, 'avaliacao', 'Como foi sua compra?',
    'Avalie ' || coalesce(v_order.product_name, 'a peça') || ' e a loja. Leva menos de um minuto.',
    '/pedidos?avaliar=' || v_order.id::text, v_order.id);
end $$;
revoke all on function public.notify_review_reminder(uuid) from public, anon, authenticated;
grant execute on function public.notify_review_reminder(uuid) to service_role;

-- Meta das peças para listas que não trazem disponibilidade/avaliação.
drop function if exists public.get_products_availability(uuid[]);
create function public.get_products_availability(p_ids uuid[])
returns table (id uuid, availability text, stock integer, max_quantity integer, rating_avg numeric, rating_count integer)
language sql stable security definer set search_path = '' as $$
  select product.id, product.availability, product.stock, public.product_max_quantity(product),
    product.rating_avg, product.rating_count
  from public.products product
  where product.id = any(p_ids[1:200]) and product.active
    and public.is_public_artisan(product.artisan_id);
$$;
revoke all on function public.get_products_availability(uuid[]) from public;
grant execute on function public.get_products_availability(uuid[]) to anon, authenticated;

-- Vitrine: devolvem a média e a quantidade de avaliações; browse aceita p_sort = 'rating'.
drop function if exists public.search_storefront_products(text, uuid, uuid, text, integer);
create function public.search_storefront_products(
  p_query text default null,
  p_category_id uuid default null,
  p_collection_id uuid default null,
  p_section text default 'all',
  p_limit integer default 12
)
returns table (
  id uuid, name text, description text, price numeric, image_url text,
  stock integer, ready_to_ship boolean, featured boolean, created_at timestamptz,
  category_id uuid, collection_id uuid, category_name text, shop_name text,
  shop_id uuid, availability text, rating_avg numeric, rating_count integer
)
language sql stable security definer set search_path = '' as $$
  select pr.id, pr.name, pr.description, pr.price, pr.image_url, pr.stock,
    pr.ready_to_ship, pr.featured, pr.created_at, pr.category_id, pr.collection_id,
    cat.name as category_name, art.store_name as shop_name, art.id as shop_id,
    pr.availability, pr.rating_avg, pr.rating_count
  from public.products pr
  join public.profiles art on art.id = pr.artisan_id
  left join public.storefront_categories cat on cat.id = pr.category_id
  where pr.active and art.account_type = 'artisan' and art.approval_status = 'active'
    and (p_category_id is null or pr.category_id = p_category_id)
    and (p_collection_id is null or pr.collection_id = p_collection_id)
    and (p_section <> 'featured' or pr.featured)
    and (p_section <> 'ready' or pr.availability = 'ready')
    and (nullif(trim(p_query), '') is null or
      pr.name ilike '%' || trim(p_query) || '%' or
      coalesce(pr.description, '') ilike '%' || trim(p_query) || '%' or
      coalesce(cat.name, '') ilike '%' || trim(p_query) || '%' or
      coalesce(art.store_name, '') ilike '%' || trim(p_query) || '%')
  order by case when p_section = 'featured' then pr.featured end desc, pr.created_at desc
  limit least(greatest(coalesce(p_limit, 12), 1), 40);
$$;
revoke all on function public.search_storefront_products(text, uuid, uuid, text, integer) from public;
grant execute on function public.search_storefront_products(text, uuid, uuid, text, integer) to anon, authenticated;

drop function if exists public.browse_storefront_products(text, uuid, numeric, numeric, boolean, text, integer, integer);
create function public.browse_storefront_products(
  p_query text default null, p_category_id uuid default null,
  p_min_price numeric default null, p_max_price numeric default null,
  p_ready_only boolean default false, p_sort text default 'newest',
  p_limit integer default 12, p_offset integer default 0
)
returns table (
  id uuid, name text, description text, price numeric, image_url text,
  stock integer, ready_to_ship boolean, featured boolean, created_at timestamptz,
  category_id uuid, category_name text, shop_name text, total_count bigint,
  shop_id uuid, availability text, rating_avg numeric, rating_count integer
)
language sql stable security definer set search_path = '' as $$
  select product.id, product.name, product.description, product.price,
    product.image_url, product.stock, product.ready_to_ship, product.featured,
    product.created_at, product.category_id, category.name, artisan.store_name,
    count(*) over(), artisan.id, product.availability, product.rating_avg, product.rating_count
  from public.products product
  join public.profiles artisan on artisan.id = product.artisan_id
  left join public.storefront_categories category
    on category.id = product.category_id and category.active
  where product.active
    and artisan.account_type = 'artisan' and artisan.approval_status = 'active'
    and (product.category_id is null or category.id is not null)
    and (p_category_id is null or product.category_id = p_category_id)
    and (p_min_price is null or product.price >= greatest(p_min_price, 0))
    and (p_max_price is null or product.price <= p_max_price)
    and (not coalesce(p_ready_only, false) or product.availability = 'ready')
    and (nullif(trim(p_query), '') is null
      or product.name ilike '%' || trim(p_query) || '%'
      or coalesce(product.description, '') ilike '%' || trim(p_query) || '%'
      or coalesce(category.name, '') ilike '%' || trim(p_query) || '%'
      or coalesce(artisan.store_name, '') ilike '%' || trim(p_query) || '%'
      or extensions.similarity(lower(product.name), lower(trim(p_query))) >= 0.20
      or extensions.similarity(lower(coalesce(category.name, '')), lower(trim(p_query))) >= 0.28)
  order by
    case when nullif(trim(p_query), '') is not null then
      greatest(extensions.similarity(lower(product.name), lower(trim(p_query))),
        extensions.similarity(lower(coalesce(category.name, '')), lower(trim(p_query))))
    end desc,
    case when p_sort = 'rating' then coalesce(product.rating_avg, 0) end desc,
    case when p_sort = 'rating' then product.rating_count end desc,
    case when p_sort = 'price_asc' then product.price end asc,
    case when p_sort = 'price_desc' then product.price end desc,
    product.created_at desc, product.id
  limit least(greatest(coalesce(p_limit, 12), 1), 24)
  offset least(greatest(coalesce(p_offset, 0), 0), 10000);
$$;
revoke all on function public.browse_storefront_products(text, uuid, numeric, numeric, boolean, text, integer, integer) from public;
grant execute on function public.browse_storefront_products(text, uuid, numeric, numeric, boolean, text, integer, integer) to anon, authenticated;

commit;
