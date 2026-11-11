-- Artenós: até 3 fotos por peça e variações (cor, tamanho...) do mesmo produto.
-- Execute UMA vez depois de 20261112_notificacoes_lidas_por_conversa.sql. Pode ser repetido.
--
-- Fotos
--   * products.image_url continua sendo a foto principal (vitrine, carrinho, pedidos);
--   * products.gallery_urls guarda até 2 fotos extras (total de 3 por peça), só
--     do próprio artesão no bucket artenos-store-assets.
--
-- Variações (inspirado no fluxo de cadastro dos grandes marketplaces)
--   * products.variation_names: 0, 1 ou 2 tipos (ex.: {Cor} ou {Cor,Tamanho});
--   * product_variants: uma linha por combinação, com preço, estoque e (opcional)
--     uma das fotos da peça. Sem SKU e sem GTIN;
--   * products.stock passa a ser a SOMA do estoque das opções e products.price o
--     MENOR preço ("a partir de"), mantidos por gatilho. Assim a vitrine, os
--     filtros e a disponibilidade (pronta entrega / sob encomenda) continuam
--     funcionando sem mudança;
--   * carrinho, "Comprar agora", checkout, cancelamento e finalização conferem e
--     baixam o estoque DA OPÇÃO escolhida. O nome da opção vai junto do nome da
--     peça no pedido (ex.: "Quadro Ipê — Cor: Azul · Tamanho: 40×50 cm"), então
--     pedidos, vendas, e-mails e notas já mostram a escolha.
begin;

-- 1) Estrutura ------------------------------------------------------------------
alter table public.products
  add column if not exists gallery_urls text[] not null default '{}',
  add column if not exists variation_names text[] not null default '{}';
alter table public.products drop constraint if exists products_gallery_urls_check;
alter table public.products add constraint products_gallery_urls_check
  check (cardinality(gallery_urls) <= 2);
alter table public.products drop constraint if exists products_variation_names_check;
alter table public.products add constraint products_variation_names_check
  check (cardinality(variation_names) <= 2);

create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  option1 text not null check (char_length(btrim(option1)) between 1 and 40),
  option2 text check (option2 is null or char_length(btrim(option2)) between 1 and 40),
  price numeric(10,2) not null check (price > 0 and price <= 99999999.99),
  stock integer not null default 0 check (stock between 0 and 999999),
  image_url text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists product_variants_options_unique
  on public.product_variants (product_id, lower(option1), lower(coalesce(option2, '')));
create index if not exists product_variants_product_idx on public.product_variants (product_id, sort_order);
-- Só pelas funções abaixo (security definer).
alter table public.product_variants enable row level security;
revoke all on public.product_variants from public, anon, authenticated;

alter table public.cart_items
  add column if not exists variant_id uuid references public.product_variants(id) on delete cascade;
alter table public.buy_now_intents
  add column if not exists variant_id uuid references public.product_variants(id) on delete cascade;
alter table public.checkout_items
  add column if not exists variant_id uuid references public.product_variants(id) on delete set null,
  add column if not exists variant_label text;
alter table public.order_items
  add column if not exists variant_id uuid references public.product_variants(id) on delete set null,
  add column if not exists variant_label text;

-- A mesma peça pode estar no carrinho em opções diferentes.
do $$
declare v_name text;
begin
  for v_name in
    select con.conname from pg_constraint con
    where con.conrelid = 'public.cart_items'::regclass and con.contype = 'u'
      and (select array_agg(att.attname::text order by att.attname) from pg_attribute att
           where att.attrelid = con.conrelid and att.attnum = any(con.conkey)) = array['client_id', 'product_id']
  loop
    execute format('alter table public.cart_items drop constraint %I', v_name);
  end loop;
end $$;
alter table public.cart_items drop constraint if exists cart_items_client_product_variant_key;
alter table public.cart_items add constraint cart_items_client_product_variant_key
  unique nulls not distinct (client_id, product_id, variant_id);

-- Mesmo bloqueio de conta suspensa das demais tabelas da loja.
drop trigger if exists account_suspension_guard on public.product_variants;
create trigger account_suspension_guard before insert or update on public.product_variants
  for each row execute function public.account_suspension_guard();

-- 2) Regras auxiliares ----------------------------------------------------------
create or replace function public.variant_label(p_names text[], p_option1 text, p_option2 text)
returns text language sql immutable set search_path = '' as $$
  select nullif(concat_ws(' · ',
    case when p_option1 is not null then coalesce(nullif(p_names[1], '') || ': ', '') || p_option1 end,
    case when p_option2 is not null then coalesce(nullif(p_names[2], '') || ': ', '') || p_option2 end), '');
$$;

-- Disponibilidade de UMA opção: mesma regra da peça (estoque > 0 = pronta entrega).
create or replace function public.variant_max_quantity(p_stock integer, p_artisan_id uuid)
returns integer language sql stable security definer set search_path = '' as $$
  select case public.compute_product_availability(p_stock, p_artisan_id)
    when 'ready' then least(p_stock, 99)
    when 'made_to_order' then 99
    else 0 end;
$$;
revoke all on function public.variant_max_quantity(integer, uuid) from public, anon, authenticated;

-- Estoque total e menor preço da peça acompanham as opções.
create or replace function public.sync_product_from_variants(p_product_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_total integer; v_min numeric; v_count integer;
begin
  select count(*), coalesce(sum(stock), 0), min(price) into v_count, v_total, v_min
    from public.product_variants where product_id = p_product_id;
  if v_count = 0 then return; end if;
  update public.products set stock = v_total, price = v_min, updated_at = now()
    where id = p_product_id and (stock is distinct from v_total or price is distinct from v_min);
end $$;
revoke all on function public.sync_product_from_variants(uuid) from public, anon, authenticated;

create or replace function public.sync_product_from_variants_trigger()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.sync_product_from_variants(coalesce(new.product_id, old.product_id));
  return null;
end $$;
drop trigger if exists sync_product_from_variants on public.product_variants;
create trigger sync_product_from_variants after insert or update or delete on public.product_variants
  for each row execute function public.sync_product_from_variants_trigger();

-- 3) Artesão: salvar fotos extras e variações ---------------------------------
-- Chamada depois de create_my_product / update_my_product (o formulário já envia
-- preço = menor preço e estoque = soma; o gatilho garante a coerência).
-- p_variants: [{ "option1": "Azul", "option2": "40×50 cm", "price": 120, "stock": 2, "image_url": "..." }]
create or replace function public.save_my_product_options(
  p_product_id uuid, p_gallery_urls text[], p_variation_names text[], p_variants jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_product public.products;
  v_prefix text;
  v_names text[] := '{}';
  v_name text;
  v_gallery text[] := '{}';
  v_url text;
  v_item jsonb;
  v_opt1 text; v_opt2 text; v_price numeric; v_stock integer; v_image text;
  v_keep uuid[] := '{}';
  v_id uuid;
  v_index integer := 0;
  v_blocked text;
begin
  if auth.uid() is null then raise exception 'Faça login para alterar a peça'; end if;
  select * into v_product from public.products where id = p_product_id and artisan_id = auth.uid() for update;
  if not found then raise exception 'Produto não encontrado'; end if;
  v_prefix := '/storage/v1/object/public/artenos-store-assets/' || auth.uid()::text || '/products/' || p_product_id::text || '/';

  -- Fotos extras: no máximo 2 (3 com a principal), só arquivos desta peça.
  foreach v_url in array coalesce(p_gallery_urls, '{}') loop
    v_url := nullif(btrim(v_url), '');
    continue when v_url is null or v_url = v_product.image_url or v_url = any(v_gallery);
    if position(v_prefix in v_url) = 0 or v_url !~ '^https://' then
      raise exception 'Foto inválida. Envie as fotos pelo formulário da peça';
    end if;
    v_gallery := v_gallery || v_url;
  end loop;
  if cardinality(v_gallery) > 2 then raise exception 'Use no máximo 3 fotos por peça'; end if;

  -- Tipos de variação (Cor, Tamanho...): até 2, sem repetir.
  foreach v_name in array coalesce(p_variation_names, '{}') loop
    v_name := btrim(regexp_replace(coalesce(v_name, ''), '\s+', ' ', 'g'));
    if char_length(v_name) not between 1 and 20 then
      raise exception 'O nome da variação deve ter de 1 a 20 caracteres';
    end if;
    if lower(v_name) = any(select lower(n) from unnest(v_names) n) then
      raise exception 'As variações precisam ter nomes diferentes';
    end if;
    v_names := v_names || v_name;
  end loop;
  if cardinality(v_names) > 2 then raise exception 'Use no máximo 2 tipos de variação'; end if;
  v_blocked := public.moderation_find_term(array_to_string(v_names, ' '));
  if v_blocked is not null then raise exception 'BLOQUEADO: A variação contém termos que não são permitidos na Artenós.'; end if;

  if cardinality(v_names) > 0 then
    if jsonb_typeof(p_variants) is distinct from 'array' or jsonb_array_length(p_variants) = 0 then
      raise exception 'Adicione pelo menos uma opção da variação';
    end if;
    if jsonb_array_length(p_variants) > 50 then raise exception 'Use no máximo 50 combinações de variação'; end if;
    for v_item in select value from jsonb_array_elements(p_variants) loop
      v_opt1 := nullif(btrim(regexp_replace(coalesce(v_item->>'option1', ''), '\s+', ' ', 'g')), '');
      v_opt2 := nullif(btrim(regexp_replace(coalesce(v_item->>'option2', ''), '\s+', ' ', 'g')), '');
      if v_opt1 is null or char_length(v_opt1) > 40 or (v_opt2 is not null and char_length(v_opt2) > 40) then
        raise exception 'Cada opção da variação deve ter de 1 a 40 caracteres';
      end if;
      if cardinality(v_names) = 2 and v_opt2 is null then
        raise exception 'Preencha as duas variações de cada combinação';
      end if;
      if cardinality(v_names) = 1 then v_opt2 := null; end if;
      v_blocked := public.moderation_find_term(concat_ws(' ', v_opt1, v_opt2));
      if v_blocked is not null then raise exception 'BLOQUEADO: Uma opção da variação contém termos que não são permitidos na Artenós.'; end if;
      begin
        v_price := round((v_item->>'price')::numeric, 2);
        v_stock := (v_item->>'stock')::integer;
      exception when others then
        raise exception 'Informe um preço e um estoque válidos para %', concat_ws(' / ', v_opt1, v_opt2);
      end;
      if v_price is null or v_price < 0.01 or v_price > 99999999.99 then
        raise exception 'Informe um preço válido para %', concat_ws(' / ', v_opt1, v_opt2);
      end if;
      if v_stock is null or v_stock < 0 or v_stock > 999999 then
        raise exception 'Informe um estoque válido para %', concat_ws(' / ', v_opt1, v_opt2);
      end if;
      v_image := nullif(btrim(coalesce(v_item->>'image_url', '')), '');
      if v_image is not null and v_image is distinct from v_product.image_url and not (v_image = any(v_gallery)) then
        v_image := null; -- só pode apontar para uma das fotos da peça
      end if;

      select id into v_id from public.product_variants
        where product_id = p_product_id and lower(option1) = lower(v_opt1)
          and lower(coalesce(option2, '')) = lower(coalesce(v_opt2, ''));
      if v_id = any(v_keep) then
        raise exception 'A combinação % aparece duas vezes', concat_ws(' / ', v_opt1, v_opt2);
      end if;
      if v_id is null then
        insert into public.product_variants (product_id, option1, option2, price, stock, image_url, sort_order)
          values (p_product_id, v_opt1, v_opt2, v_price, v_stock, v_image, v_index) returning id into v_id;
      else
        update public.product_variants set option1 = v_opt1, option2 = v_opt2, price = v_price, stock = v_stock,
          image_url = v_image, sort_order = v_index, updated_at = now()
          where id = v_id;
      end if;
      v_keep := v_keep || v_id;
      v_index := v_index + 1;
    end loop;
  end if;

  -- Opções removidas: não apaga uma opção reservada em compra em pagamento.
  if exists (select 1 from public.product_variants v
      join public.checkout_items ci on ci.variant_id = v.id
      join public.checkouts c on c.id = ci.checkout_id
      where v.product_id = p_product_id and not (v.id = any(v_keep))
        and c.status in ('pending', 'awaiting_payment')) then
    raise exception 'Há uma compra em pagamento para uma opção removida. Mantenha a opção e zere o estoque dela';
  end if;
  delete from public.product_variants where product_id = p_product_id and not (id = any(v_keep));

  update public.products set gallery_urls = v_gallery, variation_names = v_names, updated_at = now()
    where id = p_product_id;
  perform public.sync_product_from_variants(p_product_id);
end $$;
revoke all on function public.save_my_product_options(uuid, text[], text[], jsonb) from public, anon;
grant execute on function public.save_my_product_options(uuid, text[], text[], jsonb) to authenticated;

-- Dados para o formulário de edição (só a dona da peça).
create or replace function public.get_my_product_options(p_product_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'gallery_urls', to_jsonb(product.gallery_urls),
    'variation_names', to_jsonb(product.variation_names),
    'variants', coalesce((select jsonb_agg(jsonb_build_object(
        'id', v.id, 'option1', v.option1, 'option2', v.option2, 'price', v.price,
        'stock', v.stock, 'image_url', v.image_url) order by v.sort_order, v.created_at)
      from public.product_variants v where v.product_id = product.id), '[]'::jsonb))
  from public.products product
  where product.id = p_product_id and product.artisan_id = auth.uid();
$$;
revoke all on function public.get_my_product_options(uuid) from public, anon;
grant execute on function public.get_my_product_options(uuid) to authenticated;

-- Resumo para os cards do catálogo do artesão.
create or replace function public.list_my_product_options_summary()
returns table (product_id uuid, photo_count integer, variation_names text[], variant_count integer)
language sql stable security definer set search_path = '' as $$
  select product.id,
    (case when product.image_url is null then 0 else 1 end) + cardinality(product.gallery_urls),
    product.variation_names,
    (select count(*)::integer from public.product_variants v where v.product_id = product.id)
  from public.products product where product.artisan_id = auth.uid();
$$;
revoke all on function public.list_my_product_options_summary() from public, anon;
grant execute on function public.list_my_product_options_summary() to authenticated;

-- 4) Vitrine: fotos e opções de uma peça publicada -----------------------------
create or replace function public.get_product_options(p_product_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'images', to_jsonb(array_remove(array[product.image_url], null) || product.gallery_urls),
    'variation_names', to_jsonb(product.variation_names),
    'variants', case when cardinality(product.variation_names) = 0 then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', v.id, 'option1', v.option1, 'option2', v.option2, 'price', v.price,
        'stock', v.stock, 'image_url', v.image_url,
        'availability', public.compute_product_availability(v.stock, product.artisan_id),
        'max_quantity', public.variant_max_quantity(v.stock, product.artisan_id))
        order by v.sort_order, v.created_at)
      from public.product_variants v where v.product_id = product.id), '[]'::jsonb) end)
  from public.products product
  where product.id = p_product_id
    and ((product.active and public.is_public_artisan(product.artisan_id)) or product.artisan_id = auth.uid());
$$;
revoke all on function public.get_product_options(uuid) from public;
grant execute on function public.get_product_options(uuid) to anon, authenticated;

-- Para os cards: quais peças pedem escolha de opção antes de comprar.
create or replace function public.list_products_with_options(p_ids uuid[])
returns table (product_id uuid, variation_names text[], min_price numeric, max_price numeric)
language sql stable security definer set search_path = '' as $$
  select product.id, product.variation_names, min(v.price), max(v.price)
  from public.products product
  join public.product_variants v on v.product_id = product.id
  where product.id = any(p_ids[1:200]) and cardinality(product.variation_names) > 0
    and product.active and public.is_public_artisan(product.artisan_id)
  group by product.id, product.variation_names;
$$;
revoke all on function public.list_products_with_options(uuid[]) from public;
grant execute on function public.list_products_with_options(uuid[]) to anon, authenticated;

-- 5) Carrinho -------------------------------------------------------------------
-- Escolhe a opção (ou exige uma, se a peça tiver variações). Devolve preço e limite.
create or replace function public.resolve_product_choice(p_product public.products, p_variant_id uuid)
returns table (variant_id uuid, unit_price numeric, max_quantity integer, label text)
language plpgsql stable security definer set search_path = '' as $$
declare v public.product_variants;
begin
  if cardinality(p_product.variation_names) = 0
     or not exists (select 1 from public.product_variants pv where pv.product_id = p_product.id) then
    if p_variant_id is not null then raise exception 'Opção não encontrada para esta peça'; end if;
    return query select null::uuid, p_product.price, public.product_max_quantity(p_product), null::text;
    return;
  end if;
  if p_variant_id is null then
    raise exception 'Escolha uma opção (%) antes de continuar', array_to_string(p_product.variation_names, ' e ');
  end if;
  select * into v from public.product_variants pv where pv.id = p_variant_id and pv.product_id = p_product.id;
  if not found then raise exception 'Opção não encontrada para esta peça'; end if;
  return query select v.id, v.price, public.variant_max_quantity(v.stock, p_product.artisan_id),
    public.variant_label(p_product.variation_names, v.option1, v.option2);
end $$;
revoke all on function public.resolve_product_choice(public.products, uuid) from public, anon, authenticated;

drop function if exists public.add_to_cart(uuid, integer);
create or replace function public.add_to_cart(p_product_id uuid, p_quantity integer default 1, p_variant_id uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_product public.products;
  v_choice record;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Faça login para usar o carrinho'; end if;
  if coalesce(p_quantity, 0) not between 1 and 99 then raise exception 'Quantidade inválida'; end if;

  select product.* into v_product from public.products product
  where product.id = p_product_id and product.active
    and public.is_public_artisan(product.artisan_id);
  if not found then raise exception 'Produto não encontrado ou indisponível'; end if;
  select * into v_choice from public.resolve_product_choice(v_product, p_variant_id);
  if v_choice.max_quantity = 0 then raise exception 'Peça esgotada no momento.'; end if;
  if p_quantity > v_choice.max_quantity then
    raise exception 'Estoque insuficiente. Há somente % unidade(s) a pronta entrega.', v_choice.max_quantity;
  end if;

  insert into public.cart_items as item
    (client_id, product_id, variant_id, artisan_id, unit_price, quantity)
  values (auth.uid(), v_product.id, v_choice.variant_id, v_product.artisan_id, v_choice.unit_price, p_quantity)
  on conflict (client_id, product_id, variant_id) do update
    set quantity = item.quantity + excluded.quantity,
        unit_price = excluded.unit_price,
        updated_at = now()
    where item.quantity + excluded.quantity <= v_choice.max_quantity
  returning item.id into v_id;

  if v_id is null then
    raise exception 'Estoque insuficiente. Você já possui a quantidade máxima disponível no carrinho.';
  end if;
  return v_id;
end;
$$;
revoke all on function public.add_to_cart(uuid, integer, uuid) from public, anon;
grant execute on function public.add_to_cart(uuid, integer, uuid) to authenticated;

create or replace function public.set_cart_quantity(p_item_id uuid, p_quantity integer)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_product public.products;
  v_variant uuid;
  v_choice record;
begin
  if coalesce(p_quantity, 0) not between 1 and 99 then raise exception 'Quantidade inválida'; end if;
  select product.* into v_product
  from public.cart_items item
  join public.products product on product.id = item.product_id
  where item.id = p_item_id and item.client_id = auth.uid() and product.active
    and public.is_public_artisan(product.artisan_id);
  if not found then raise exception 'Item não encontrado ou produto indisponível'; end if;
  select item.variant_id into v_variant from public.cart_items item where item.id = p_item_id;
  select * into v_choice from public.resolve_product_choice(v_product, v_variant);
  if v_choice.max_quantity = 0 then raise exception 'Peça esgotada no momento.'; end if;
  if p_quantity > v_choice.max_quantity then
    raise exception 'Estoque insuficiente. Há somente % unidade(s) a pronta entrega.', v_choice.max_quantity;
  end if;
  update public.cart_items set quantity = p_quantity, updated_at = now()
  where id = p_item_id and client_id = auth.uid();
end;
$$;

-- Observações só em sob encomenda: a disponibilidade é a da opção escolhida.
create or replace function public.set_cart_item_notes(p_item_id uuid, p_notes text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_availability text;
begin
  if auth.uid() is null then raise exception 'Faça login para usar o carrinho'; end if;
  select case when variant.id is null then product.availability
              else public.compute_product_availability(variant.stock, product.artisan_id) end
    into v_availability
    from public.cart_items item join public.products product on product.id = item.product_id
    left join public.product_variants variant on variant.id = item.variant_id
    where item.id = p_item_id and item.client_id = auth.uid();
  if not found then raise exception 'Item não encontrado'; end if;
  if v_availability <> 'made_to_order' and nullif(btrim(coalesce(p_notes, '')), '') is not null then
    raise exception 'Observações são aceitas apenas em peças sob encomenda';
  end if;
  if char_length(coalesce(p_notes, '')) > 500 then raise exception 'Use no máximo 500 caracteres nas observações'; end if;
  perform public.moderation_assert_clean(p_notes);
  update public.cart_items set customer_notes = nullif(btrim(p_notes), ''), updated_at = now()
    where id = p_item_id and client_id = auth.uid();
end $$;

drop function if exists public.list_cart();
create function public.list_cart()
returns table (
  item_id uuid, product_id uuid, product_name text, store_name text,
  unit_price numeric, quantity integer, stock integer,
  product_active boolean, added_at timestamptz,
  image_url text, artisan_id uuid, availability text, max_quantity integer,
  product_summary text, customer_notes text,
  variant_id uuid, variant_label text, needs_option boolean
)
language sql stable security definer set search_path = '' as $$
  select item.id, item.product_id, product.name,
         coalesce(profile.store_name, profile.full_name), item.unit_price,
         item.quantity, coalesce(variant.stock, product.stock),
         product.active and public.is_public_artisan(product.artisan_id),
         item.created_at, coalesce(variant.image_url, product.image_url), item.artisan_id,
         case when variant.id is null then product.availability
              else public.compute_product_availability(variant.stock, product.artisan_id) end,
         case when variant.id is null then public.product_max_quantity(product)
              else public.variant_max_quantity(variant.stock, product.artisan_id) end,
         public.text_summary(product.description, 160), item.customer_notes,
         item.variant_id, public.variant_label(product.variation_names, variant.option1, variant.option2),
         -- Peça ganhou variações depois de entrar no carrinho: precisa escolher de novo.
         item.variant_id is null and cardinality(product.variation_names) > 0
           and exists (select 1 from public.product_variants pv where pv.product_id = product.id)
  from public.cart_items item
  join public.products product on product.id = item.product_id
  left join public.product_variants variant on variant.id = item.variant_id
  join public.profiles profile on profile.id = item.artisan_id
  where item.client_id = auth.uid()
  order by item.created_at desc;
$$;
revoke all on function public.list_cart() from public, anon;
grant execute on function public.list_cart() to authenticated;

-- 6) Comprar agora --------------------------------------------------------------
drop function if exists public.start_buy_now(uuid, integer);
create or replace function public.start_buy_now(p_product_id uuid, p_quantity integer, p_variant_id uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_product public.products; v_choice record;
begin
  if auth.uid() is null then raise exception 'Faça login para comprar'; end if;
  if coalesce(p_quantity, 0) not between 1 and 99 then raise exception 'Quantidade inválida'; end if;
  select product.* into v_product from public.products product
    where product.id = p_product_id and product.active and public.is_public_artisan(product.artisan_id);
  if not found then raise exception 'Produto não encontrado ou indisponível'; end if;
  if v_product.artisan_id = auth.uid() then raise exception 'Produto indisponível ou pertence à sua loja'; end if;
  select * into v_choice from public.resolve_product_choice(v_product, p_variant_id);
  if v_choice.max_quantity = 0 then raise exception 'Peça esgotada no momento.'; end if;
  if p_quantity > v_choice.max_quantity then
    raise exception 'Estoque insuficiente. Há somente % unidade(s) a pronta entrega.', v_choice.max_quantity;
  end if;
  insert into public.buy_now_intents as intent (client_id, product_id, variant_id, artisan_id, quantity, unit_price)
    values (auth.uid(), v_product.id, v_choice.variant_id, v_product.artisan_id, p_quantity, v_choice.unit_price)
    on conflict (client_id) do update set
      customer_notes = case when intent.product_id = excluded.product_id
        and intent.variant_id is not distinct from excluded.variant_id then intent.customer_notes end,
      product_id = excluded.product_id, variant_id = excluded.variant_id, artisan_id = excluded.artisan_id,
      quantity = excluded.quantity, unit_price = excluded.unit_price, updated_at = now();
end $$;
revoke all on function public.start_buy_now(uuid, integer, uuid) from public, anon;
grant execute on function public.start_buy_now(uuid, integer, uuid) to authenticated;

create or replace function public.set_buy_now_notes(p_notes text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_availability text;
begin
  select case when variant.id is null then product.availability
              else public.compute_product_availability(variant.stock, product.artisan_id) end
    into v_availability
    from public.buy_now_intents intent join public.products product on product.id = intent.product_id
    left join public.product_variants variant on variant.id = intent.variant_id
    where intent.client_id = auth.uid();
  if not found then raise exception 'Escolha a peça novamente'; end if;
  if v_availability <> 'made_to_order' and nullif(btrim(coalesce(p_notes, '')), '') is not null then
    raise exception 'Observações são aceitas apenas em peças sob encomenda';
  end if;
  if char_length(coalesce(p_notes, '')) > 500 then raise exception 'Use no máximo 500 caracteres nas observações'; end if;
  perform public.moderation_assert_clean(p_notes);
  update public.buy_now_intents set customer_notes = nullif(btrim(p_notes), ''), updated_at = now()
    where client_id = auth.uid();
end $$;

drop function if exists public.get_buy_now();
create function public.get_buy_now()
returns table (
  product_id uuid, product_name text, image_url text, artisan_id uuid, store_name text,
  quantity integer, unit_price numeric, current_price numeric, availability text, max_quantity integer,
  product_summary text, customer_notes text, product_active boolean,
  variant_id uuid, variant_label text
) language sql stable security definer set search_path = '' as $$
  select product.id, product.name, coalesce(variant.image_url, product.image_url), intent.artisan_id,
    coalesce(artisan.store_name, artisan.full_name), intent.quantity, intent.unit_price,
    coalesce(variant.price, product.price),
    case when variant.id is null then product.availability
         else public.compute_product_availability(variant.stock, product.artisan_id) end,
    case when variant.id is null then public.product_max_quantity(product)
         else public.variant_max_quantity(variant.stock, product.artisan_id) end,
    public.text_summary(product.description, 200), intent.customer_notes,
    product.active and public.is_public_artisan(product.artisan_id),
    intent.variant_id, public.variant_label(product.variation_names, variant.option1, variant.option2)
  from public.buy_now_intents intent
  join public.products product on product.id = intent.product_id
  left join public.product_variants variant on variant.id = intent.variant_id
  join public.profiles artisan on artisan.id = intent.artisan_id
  where intent.client_id = auth.uid();
$$;
revoke all on function public.get_buy_now() from public, anon;
grant execute on function public.get_buy_now() to authenticated;

-- 7) Assinaturas do frete: a opção escolhida também faz parte ---------------------
create or replace function public.current_cart_shipping_signature(
  p_client_id uuid, p_artisan_id uuid, p_destination_cep text)
returns text language sql stable security definer set search_path = '' as $$
  select md5(
    coalesce(string_agg(
      concat_ws(':', item.product_id::text, item.quantity::text, item.unit_price::text,
        product.shipping_weight_grams::text, product.shipping_height_cm::text, product.shipping_width_cm::text,
        product.shipping_length_cm::text, product.shipping_package_count::text, product.production_time_days::text,
        coalesce(item.variant_id::text, '-')),
      '|' order by item.product_id, item.variant_id), '')
    || ':' || coalesce(p_destination_cep, '') || ':' || coalesce(
      nullif(regexp_replace(setting.shipping_origin_cep, '\D', '', 'g'), ''),
      regexp_replace(artisan.cep, '\D', '', 'g')))
  from public.cart_items item
  join public.products product on product.id = item.product_id
  join public.profiles artisan on artisan.id = item.artisan_id
  left join public.artisan_store_settings setting on setting.artisan_id = item.artisan_id
  where item.client_id = p_client_id and item.artisan_id = p_artisan_id
  group by setting.shipping_origin_cep, artisan.cep;
$$;
revoke all on function public.current_cart_shipping_signature(uuid, uuid, text) from public, anon, authenticated;

create or replace function public.current_buy_now_signature(p_client_id uuid, p_artisan_id uuid, p_destination_cep text)
returns text language sql stable security definer set search_path = '' as $$
  select md5('buy_now:' || concat_ws(':', intent.product_id::text, intent.quantity::text, intent.unit_price::text,
      product.shipping_weight_grams::text, product.shipping_height_cm::text, product.shipping_width_cm::text,
      product.shipping_length_cm::text, product.shipping_package_count::text, product.production_time_days::text,
      coalesce(intent.variant_id::text, '-'))
    || ':' || coalesce(p_destination_cep, '') || ':' || coalesce(
      nullif(regexp_replace(setting.shipping_origin_cep, '\D', '', 'g'), ''),
      regexp_replace(artisan.cep, '\D', '', 'g')))
  from public.buy_now_intents intent
  join public.products product on product.id = intent.product_id
  join public.profiles artisan on artisan.id = intent.artisan_id
  left join public.artisan_store_settings setting on setting.artisan_id = intent.artisan_id
  where intent.client_id = p_client_id and intent.artisan_id = p_artisan_id;
$$;
revoke all on function public.current_buy_now_signature(uuid, uuid, text) from public, anon, authenticated;

-- 8) Checkout -------------------------------------------------------------------
-- Observações e resumo: casam também pela opção (a mesma peça pode vir em duas opções).
create or replace function public.fill_checkout_item_context()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_source text; v_client uuid;
begin
  select c.source, c.client_id into v_source, v_client from public.checkouts c where c.id = new.checkout_id;
  if v_source = 'buy_now' then
    select case when new.made_to_order then intent.customer_notes end into new.customer_notes
      from public.buy_now_intents intent where intent.client_id = v_client and intent.product_id = new.product_id
        and intent.variant_id is not distinct from new.variant_id;
  else
    select case when new.made_to_order then item.customer_notes end into new.customer_notes
      from public.cart_items item where item.client_id = v_client and item.product_id = new.product_id
        and item.variant_id is not distinct from new.variant_id;
  end if;
  select public.text_summary(product.description, 280) into new.product_summary
    from public.products product where product.id = new.product_id;
  return new;
end $$;

create or replace function public.fill_order_item_context()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  select ci.customer_notes, ci.product_summary into new.customer_notes, new.product_summary
    from public.checkout_items ci join public.orders o on o.checkout_id = ci.checkout_id
    where o.id = new.order_id and ci.product_id = new.product_id
      and ci.variant_id is not distinct from new.variant_id
    limit 1;
  return new;
end $$;

create or replace function public.create_checkout_from_item(p_quote_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  buyer public.profiles; quote public.shipping_quotes; intent public.buy_now_intents;
  v_product public.products; v_variant public.product_variants;
  v_checkout_id uuid; fee numeric; destination text; subtotal numeric(12,2);
  v_price numeric; v_stock integer; v_availability text; v_label text; v_name text; v_image text;
begin
  if auth.uid() is null then raise exception 'Faça login para comprar'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text, 0));
  perform public.release_unstarted_checkouts();
  perform public.release_open_checkout_for_new_purchase();

  select * into buyer from public.profiles where id = auth.uid() and approval_status = 'active';
  if not found then raise exception 'Comprador inválido ou inativo'; end if;
  destination := regexp_replace(coalesce(buyer.cep, ''), '\D', '', 'g');
  if destination !~ '^[0-9]{8}$' or nullif(trim(buyer.address), '') is null
    or nullif(trim(buyer.address_number), '') is null
    or nullif(trim(buyer.city), '') is null or nullif(trim(buyer.state), '') is null then
    raise exception 'Complete seu endereço de entrega no perfil';
  end if;

  select * into intent from public.buy_now_intents where client_id = auth.uid() for update;
  if not found then raise exception 'Escolha a peça novamente'; end if;
  select * into v_product from public.products where id = intent.product_id for update;
  if not found or not v_product.active or not public.is_public_artisan(v_product.artisan_id)
    or v_product.artisan_id <> intent.artisan_id or v_product.artisan_id = auth.uid() then
    raise exception 'Produto indisponível ou pertence à sua loja: %', coalesce(v_product.name, 'peça');
  end if;

  v_price := v_product.price; v_stock := v_product.stock; v_availability := v_product.availability;
  v_name := v_product.name; v_image := v_product.image_url;
  if intent.variant_id is not null then
    select * into v_variant from public.product_variants where id = intent.variant_id and product_id = v_product.id for update;
    if not found then raise exception 'A opção escolhida de % não está mais disponível. Escolha a peça novamente', v_product.name; end if;
    v_price := v_variant.price; v_stock := v_variant.stock;
    v_availability := public.compute_product_availability(v_variant.stock, v_product.artisan_id);
    v_label := public.variant_label(v_product.variation_names, v_variant.option1, v_variant.option2);
    v_name := v_product.name || ' — ' || v_label;
    v_image := coalesce(v_variant.image_url, v_product.image_url);
  elsif cardinality(v_product.variation_names) > 0
        and exists (select 1 from public.product_variants where product_id = v_product.id) then
    raise exception 'Escolha uma opção de % antes de comprar', v_product.name;
  end if;

  if v_availability = 'sold_out' then raise exception '% está esgotada', v_name; end if;
  if v_availability = 'ready' and intent.quantity > v_stock then
    raise exception 'Estoque insuficiente para %: há % unidade(s) a pronta entrega', v_name, v_stock;
  end if;
  if intent.unit_price <> v_price then
    raise exception 'O preço de % mudou. Escolha a peça novamente', v_name;
  end if;

  select q.* into quote from public.shipping_quotes q
    where q.id = p_quote_id and q.client_id = auth.uid() and q.artisan_id = intent.artisan_id
      and q.destination_cep = destination and q.expires_at > now()
      and q.cart_signature = public.current_buy_now_signature(auth.uid(), intent.artisan_id, destination);
  if not found then raise exception 'Selecione um frete válido'; end if;

  select platform_fee_percent into fee from public.platform_pricing_settings where id = 1;
  if fee is null or fee < 0 or fee >= 100 then raise exception 'Tarifa da plataforma inválida'; end if;
  subtotal := round(v_price * intent.quantity, 2);

  insert into public.checkouts(client_id, total_amount, platform_fee_percent, integration_version,
    shipping_snapshot, buyer_snapshot, reservation_expires_at, source)
  values (auth.uid(), subtotal + quote.price, fee, 2, jsonb_build_array(to_jsonb(quote)),
    jsonb_build_object('full_name', buyer.full_name, 'cep', destination, 'address', buyer.address,
      'address_number', buyer.address_number, 'city', buyer.city, 'state', upper(buyer.state)),
    now() + interval '30 minutes', 'buy_now')
  returning id into v_checkout_id;

  insert into public.checkout_items(checkout_id, product_id, variant_id, variant_label, artisan_id, product_name,
    unit_price, quantity, line_total, image_url, stock_reserved, made_to_order)
  values (v_checkout_id, v_product.id, intent.variant_id, v_label, v_product.artisan_id, v_name,
    v_price, intent.quantity, subtotal, v_image, v_availability = 'ready', v_availability <> 'ready');

  if v_availability = 'ready' then
    if intent.variant_id is not null then
      -- O gatilho recalcula o estoque total da peça.
      update public.product_variants set stock = stock - intent.quantity, updated_at = now() where id = intent.variant_id;
    else
      update public.products set stock = stock - intent.quantity, updated_at = now() where id = v_product.id;
    end if;
  end if;
  return v_checkout_id;
end $$;
revoke all on function public.create_checkout_from_item(uuid) from public, anon;
grant execute on function public.create_checkout_from_item(uuid) to authenticated;

create or replace function public.create_checkout_from_cart()
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  buyer public.profiles; quote public.shipping_quotes;
  item record; seller record; checkout_id uuid; existing_id uuid;
  subtotal numeric(12,2):=0; shipping numeric(12,2):=0;
  fee numeric; snapshots jsonb:='[]'::jsonb; destination text;
begin
  if auth.uid() is null then raise exception 'Faça login para comprar'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text,0));
  perform public.release_unstarted_checkouts();
  perform public.cancel_reserved_checkout(id,false) from public.checkouts
    where client_id=auth.uid() and status in ('pending','awaiting_payment')
      and source='buy_now' and payment_started_at is null and integration_version=2;
  select id into existing_id from public.checkouts
    where client_id=auth.uid() and status in ('pending','awaiting_payment')
    order by created_at desc limit 1 for update;
  if found then
    if exists(select 1 from public.checkouts where id=existing_id and integration_version=2)
      then return existing_id;
    end if;
    raise exception 'Há uma compra antiga em aberto. Concilie ou cancele antes de continuar';
  end if;
  select * into buyer from public.profiles
    where id=auth.uid() and approval_status='active';
  if not found then raise exception 'Comprador inválido ou inativo'; end if;
  destination:=regexp_replace(coalesce(buyer.cep,''),'\D','','g');
  if destination !~ '^[0-9]{8}$' or nullif(trim(buyer.address),'') is null
    or nullif(trim(buyer.address_number),'') is null
    or nullif(trim(buyer.city),'') is null or nullif(trim(buyer.state),'') is null then
    raise exception 'Complete seu endereço de entrega no perfil';
  end if;
  perform id from public.cart_items where client_id=auth.uid() order by id for update;
  if not found then raise exception 'Seu carrinho está vazio'; end if;
  perform p.id from public.products p join public.cart_items ci on ci.product_id=p.id
    where ci.client_id=auth.uid() order by p.id for update of p;
  perform v.id from public.product_variants v join public.cart_items ci on ci.variant_id=v.id
    where ci.client_id=auth.uid() order by v.id for update of v;
  select platform_fee_percent into fee from public.platform_pricing_settings where id=1;
  if fee is null or fee<0 or fee>=100 then raise exception 'Tarifa da plataforma inválida'; end if;

  -- Uma linha por item, já com preço, estoque e disponibilidade da opção escolhida.
  create temporary table if not exists pg_temp.checkout_lines (
    product_id uuid, variant_id uuid, variant_label text, artisan_id uuid, name text,
    price numeric, quantity integer, availability text, image_url text
  ) on commit drop;
  truncate pg_temp.checkout_lines;

  for item in select ci.*, p.price, p.stock, p.active, p.name, p.availability, p.image_url as product_image,
      p.variation_names, p.artisan_id as actual_artisan,
      v.id as found_variant, v.price as v_price, v.stock as v_stock, v.option1, v.option2, v.image_url as v_image,
      exists (select 1 from public.product_variants pv where pv.product_id=p.id) as has_variants
    from public.cart_items ci join public.products p on p.id=ci.product_id
    left join public.product_variants v on v.id=ci.variant_id and v.product_id=p.id
    where ci.client_id=auth.uid()
  loop
    if not item.active or not public.is_public_artisan(item.actual_artisan)
      or item.artisan_id<>item.actual_artisan or item.actual_artisan=auth.uid() then
      raise exception 'Produto indisponível ou pertence à sua loja: %',item.name;
    end if;
    if item.quantity<1 or item.quantity>99 then
      raise exception 'Quantidade inválida para %',item.name;
    end if;
    if item.variant_id is null and item.has_variants and cardinality(item.variation_names)>0 then
      raise exception 'Escolha uma opção de % no carrinho antes de continuar',item.name;
    end if;
    if item.variant_id is not null and item.found_variant is null then
      raise exception 'A opção escolhida de % não está mais disponível. Remova a peça e escolha de novo',item.name;
    end if;
    if item.found_variant is not null then
      item.price:=item.v_price; item.stock:=item.v_stock;
      item.availability:=public.compute_product_availability(item.v_stock,item.actual_artisan);
      item.name:=item.name||' — '||public.variant_label(item.variation_names,item.option1,item.option2);
    end if;
    if item.availability='sold_out' then
      raise exception '% está esgotada',item.name;
    end if;
    if item.availability='ready' and item.quantity>item.stock then
      raise exception 'Estoque insuficiente para %: há % unidade(s) a pronta entrega',item.name,item.stock;
    end if;
    if item.unit_price<>item.price then
      raise exception 'O preço de % mudou. Atualize o carrinho e recalcule o frete',item.name;
    end if;
    subtotal:=subtotal+round(item.price*item.quantity,2);
    insert into pg_temp.checkout_lines values (item.product_id, item.found_variant,
      case when item.found_variant is not null then public.variant_label(item.variation_names,item.option1,item.option2) end,
      item.actual_artisan, item.name, item.price, item.quantity, item.availability,
      coalesce(item.v_image, item.product_image));
  end loop;
  for seller in select distinct artisan_id from public.cart_items where client_id=auth.uid()
  loop
    select q.* into quote from public.cart_shipping_selections s
      join public.shipping_quotes q on q.id=s.quote_id
      where s.client_id=auth.uid() and s.artisan_id=seller.artisan_id
      and q.client_id=auth.uid() and q.artisan_id=seller.artisan_id
      and q.destination_cep=destination and q.expires_at>now()
      and q.cart_signature=public.current_cart_shipping_signature(auth.uid(),seller.artisan_id,destination);
    if not found then raise exception 'Selecione um frete válido para cada loja'; end if;
    shipping:=shipping+quote.price;
    snapshots:=snapshots||jsonb_build_array(to_jsonb(quote));
  end loop;
  insert into public.checkouts(client_id,total_amount,platform_fee_percent,
    integration_version,shipping_snapshot,buyer_snapshot,reservation_expires_at)
    values(auth.uid(),subtotal+shipping,fee,2,snapshots,
      jsonb_build_object('full_name',buyer.full_name,'cep',destination,
        'address',buyer.address,'address_number',buyer.address_number,
        'city',buyer.city,'state',upper(buyer.state)),now()+interval '30 minutes')
    returning id into checkout_id;
  insert into public.checkout_items(checkout_id,product_id,variant_id,variant_label,artisan_id,product_name,
    unit_price,quantity,line_total,image_url,stock_reserved,made_to_order)
    select checkout_id,line.product_id,line.variant_id,line.variant_label,line.artisan_id,line.name,
      line.price,line.quantity,round(line.price*line.quantity,2),line.image_url,
      line.availability='ready',line.availability<>'ready'
    from pg_temp.checkout_lines line;
  -- Baixa atômica (linhas já bloqueadas acima). Opções: o gatilho recalcula a peça.
  update public.product_variants v set stock=v.stock-line.quantity,updated_at=now()
    from pg_temp.checkout_lines line where line.variant_id=v.id and line.availability='ready';
  update public.products p set stock=p.stock-line.quantity,updated_at=now()
    from pg_temp.checkout_lines line where line.variant_id is null and line.product_id=p.id
    and line.availability='ready';
  return checkout_id;
end $$;

-- Cancelamento devolve o estoque à opção reservada.
create or replace function public.cancel_reserved_checkout(p_checkout_id uuid,p_provider_confirmed boolean default false)
returns boolean language plpgsql security definer set search_path = '' as $$
declare c public.checkouts; item record;
begin
  select * into c from public.checkouts where id=p_checkout_id for update;
  if not found or c.status in ('approved','refunded','cancelled') then return false; end if;
  if c.integration_version is distinct from 2 then
    raise exception 'Compra antiga: concilie antes de cancelar';
  end if;
  if c.payment_started_at is not null and not p_provider_confirmed then
    raise exception 'Aguarde a confirmação do cancelamento pelo provedor';
  end if;
  for item in select * from public.checkout_items
    where checkout_id=c.id and stock_reserved order by product_id, variant_id
  loop
    if item.variant_id is not null then
      update public.product_variants set stock=stock+item.quantity, updated_at=now() where id=item.variant_id;
    else
      update public.products set stock=stock+item.quantity, updated_at=now()
        where id=item.product_id and stock is not null;
    end if;
  end loop;
  update public.checkout_items set stock_reserved=false where checkout_id=c.id;
  update public.checkouts set status='cancelled', pix_qr_code=null,
    pix_qr_code_base64=null where id=c.id;
  return true;
end $$;

-- Finalização: leva a opção para o pedido e limpa do carrinho só a opção paga.
create or replace function public.finalize_checkout(
  p_checkout_id uuid,p_mp_payment_id text,p_payment_method text,
  p_gateway_fee numeric,p_fee_percent numeric,p_hold_days integer
) returns boolean language plpgsql security definer set search_path = '' as $$
declare
  c public.checkouts; seller record; q jsonb; v_order_id uuid;
  freight numeric; fee numeric; gateway numeric; fee_left numeric;
  remaining_total numeric; total numeric;
begin
  select * into c from public.checkouts where id=p_checkout_id for update;
  if not found then raise exception 'Compra não encontrada'; end if;
  if c.status='approved' and c.mp_payment_id=p_mp_payment_id then return false; end if;
  if c.status not in ('pending','awaiting_payment') or c.integration_version is distinct from 2 then
    raise exception 'Compra não conciliável automaticamente; verifique o pagamento';
  end if;
  if c.payment_started_at is null then raise exception 'Pagamento não iniciado pelo servidor'; end if;
  if c.mp_payment_id is not null and c.mp_payment_id<>p_mp_payment_id then
    raise exception 'Pagamento diferente do registrado';
  end if;
  if c.platform_fee_percent is null or c.shipping_snapshot is null or c.buyer_snapshot is null then
    raise exception 'Dados congelados da compra incompletos';
  end if;
  fee_left:=greatest(coalesce(p_gateway_fee,0),0); remaining_total:=c.total_amount;
  for seller in select artisan_id,sum(line_total) as subtotal
    from public.checkout_items where checkout_id=c.id group by artisan_id order by artisan_id
  loop
    select value into q from jsonb_array_elements(c.shipping_snapshot)
      where value->>'artisan_id'=seller.artisan_id::text;
    if q is null then raise exception 'Frete congelado não encontrado'; end if;
    freight:=(q->>'price')::numeric; total:=seller.subtotal+freight;
    fee:=round(seller.subtotal*c.platform_fee_percent/100,2);
    gateway:=case when abs(remaining_total-total)<0.01 then fee_left
      else least(fee_left,round(greatest(coalesce(p_gateway_fee,0),0)*total/c.total_amount,2)) end;
    remaining_total:=remaining_total-total; fee_left:=fee_left-gateway;
    insert into public.orders(checkout_id,client_id,artisan_id,product_name,status,
      payment_status,payment_reference,subtotal,shipping_amount,total_amount,
      platform_fee_percent,platform_fee_amount,artisan_net_amount,
      recipient_name,shipping_cep,shipping_address,shipping_number,shipping_city,shipping_state,
      carrier,estimated_delivery_date,shipping_provider,shipping_service_id,
      shipping_service_name,shipping_company,shipping_delivery_min_days,
      shipping_delivery_max_days,shipping_production_days,shipping_quote_id)
    values(c.id,c.client_id,seller.artisan_id,
      (select string_agg(product_name,', ') from public.checkout_items where checkout_id=c.id and artisan_id=seller.artisan_id),
      'payment_confirmed','paid',p_mp_payment_id,seller.subtotal,freight,total,
      c.platform_fee_percent,fee,greatest(total-fee-gateway,0),
      c.buyer_snapshot->>'full_name',c.buyer_snapshot->>'cep',c.buyer_snapshot->>'address',
      c.buyer_snapshot->>'address_number',c.buyer_snapshot->>'city',c.buyer_snapshot->>'state',
      (q->>'company_name')||' - '||(q->>'service_name'),
      current_date+(q->>'total_delivery_max_days')::integer,q->>'provider',
      (q->>'service_id')::integer,q->>'service_name',q->>'company_name',
      (q->>'carrier_delivery_min_days')::integer,(q->>'carrier_delivery_max_days')::integer,
      (q->>'production_time_days')::integer,
      (select id from public.shipping_quotes where id=(q->>'id')::uuid)) returning id into v_order_id;
    insert into public.order_items(order_id,product_id,variant_id,variant_label,product_name,image_url,quantity,unit_price,subtotal,made_to_order)
      select v_order_id,product_id,variant_id,variant_label,product_name,image_url,quantity,unit_price,line_total,made_to_order
      from public.checkout_items where checkout_id=c.id and artisan_id=seller.artisan_id;
    insert into public.order_status_history(order_id,status,description)
      values(v_order_id,'payment_confirmed','Pagamento confirmado pelo Mercado Pago; frete e estoque registrados.');
    insert into public.conversations(order_id,client_id,artisan_id)
      values(v_order_id,c.client_id,seller.artisan_id) on conflict(order_id) do nothing;
    insert into public.payouts(checkout_id,artisan_id,gross_amount,platform_fee,gateway_fee,net_amount,release_after)
      values(c.id,seller.artisan_id,total,fee,gateway,greatest(total-fee-gateway,0),
        now()+make_interval(days=>greatest(coalesce(p_hold_days,0),0)))
      on conflict(checkout_id,artisan_id) do nothing;
  end loop;
  update public.checkouts set status='approved',paid_at=now(),mp_payment_id=p_mp_payment_id,
    mp_status='approved',payment_method=p_payment_method,gateway_fee=p_gateway_fee,
    pix_qr_code=null,pix_qr_code_base64=null where id=c.id;
  if c.source='buy_now' then
    delete from public.buy_now_intents where client_id=c.client_id;
  else
    delete from public.cart_items cart using public.checkout_items paid
      where paid.checkout_id=c.id and cart.client_id=c.client_id
      and cart.product_id=paid.product_id and cart.variant_id is not distinct from paid.variant_id
      and cart.quantity=paid.quantity and cart.updated_at<=c.created_at;
    delete from public.cart_shipping_selections s where s.client_id=c.client_id
      and exists (select 1 from public.checkout_items ci where ci.checkout_id=c.id and ci.artisan_id=s.artisan_id)
      and s.selected_at<=c.created_at;
  end if;
  return true;
end $$;

commit;
