-- Variações com lista fechada (sem texto livre para o tipo).
--   * Tipo da variação: só Cor, Tamanho, Comprimento, Quantidade, Material,
--     Estampa, Modelo ou Aroma.
--   * Opções: Cor e Material só da lista; Tamanho = PP..XG/Único, numeração
--     (1 a 99) ou medida "30 × 40 cm"; Comprimento = "45 cm"; Quantidade =
--     "4 unidades". Estampa, Modelo e Aroma aceitam texto curto (até 20
--     caracteres, letras/números), passam pelo filtro de termos e entram na
--     fila de revisão da equipe (variation_text_reviews).
--   * A equipe pode aprovar ou ocultar: ocultar tira a peça da vitrine, avisa a
--     loja e impede publicar de novo enquanto a opção recusada continuar na peça.
-- As mesmas regras estão em lib/variation-catalog.ts (site).
-- Peças antigas continuam na vitrine como estão; a regra vale ao salvar a peça
-- de novo (o formulário converte tipos conhecidos, como "Kit" → Quantidade).
-- Rode depois de 20261115_tarifa_por_item.sql. Pode ser repetida.
begin;

-- 1) Regras ------------------------------------------------------------------------
-- Comparação sem acento e sem diferença de maiúsculas (sem depender da extensão unaccent).
create or replace function public.variation_fold(p_text text)
returns text language sql immutable set search_path = '' as $$
  select btrim(regexp_replace(lower(translate(coalesce(p_text, ''),
    'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇç',
    'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCc')), '\s+', ' ', 'g'));
$$;

-- Chave de lista: também sem hífen e espaço ("azul marinho" = "Azul-marinho").
create or replace function public.variation_list_key(p_text text)
returns text language sql immutable set search_path = '' as $$
  select regexp_replace(public.variation_fold(p_text), '[-\s]', '', 'g');
$$;

create or replace function public.variation_type_check(p_name text)
returns text language plpgsql immutable set search_path = '' as $$
declare v text;
begin
  select t into v from unnest(array['Cor','Tamanho','Comprimento','Quantidade','Material','Estampa','Modelo','Aroma']) t
    where public.variation_fold(t) = public.variation_fold(p_name);
  if v is null then raise exception 'Escolha um tipo de variação da lista (Cor, Tamanho, Comprimento, Quantidade, Material, Estampa, Modelo ou Aroma)'; end if;
  return v;
end $$;

create or replace function public.variation_type_is_free(p_name text)
returns boolean language sql immutable set search_path = '' as $$
  select p_name in ('Estampa', 'Modelo', 'Aroma');
$$;

-- Devolve a opção no formato oficial ou recusa.
create or replace function public.variation_option_check(p_type text, p_option text)
returns text language plpgsql immutable set search_path = '' as $$
declare
  v_opt text := btrim(regexp_replace(coalesce(p_option, ''), '\s+', ' ', 'g'));
  v_key text := public.variation_list_key(p_option);
  v text; m text[]; n numeric; n2 numeric;
begin
  if v_opt = '' then raise exception 'Preencha a opção da variação'; end if;
  if p_type = 'Cor' then
    v_key := case v_key when 'natural' then 'cru' when 'multicolor' then 'colorido' when 'colorida' then 'colorido' else v_key end;
    select c into v from unnest(array['Branco','Off-white','Bege','Cru','Caramelo','Marrom','Preto','Cinza','Azul','Azul-claro',
      'Azul-marinho','Verde','Verde-musgo','Amarelo','Mostarda','Laranja','Terracota','Vermelho','Vinho','Rosa','Lilás','Roxo',
      'Dourado','Prateado','Colorido']) c where public.variation_list_key(c) = v_key;
    if v is null then raise exception 'A cor “%” não está na paleta da Artenós', v_opt; end if;
    return v;
  elsif p_type = 'Material' then
    select c into v from unnest(array['Algodão','Linho','Lã','Barbante','Seda','Couro','Madeira','Bambu','Fibra natural','Palha',
      'Cerâmica','Porcelana','Argila','Vidro','Metal','Prata','Resina','Papel','Tecido','Pedra']) c where public.variation_list_key(c) = v_key;
    if v is null then raise exception 'O material “%” não está na lista da Artenós', v_opt; end if;
    return v;
  elsif p_type = 'Tamanho' then
    select c into v from unnest(array['PP','P','M','G','GG','XG','Único']) c where public.variation_list_key(c) = v_key;
    if v is not null then return v; end if;
    if v_opt ~ '^[1-9][0-9]?$' then return v_opt::integer::text; end if;
    m := regexp_match(regexp_replace(regexp_replace(v_opt, '\s*[xX×]\s*', ' × '), '\s*cm$', ' cm', 'i'),
      '^([0-9]{1,3}(,[0-9])?) × ([0-9]{1,3}(,[0-9])?) cm$');
    if m is not null then
      n := replace(m[1], ',', '.')::numeric; n2 := replace(m[3], ',', '.')::numeric;
      if n > 0 and n2 > 0 then return m[1] || ' × ' || m[3] || ' cm'; end if;
    end if;
    raise exception 'O tamanho “%” não é válido. Use PP a XG, Único, uma numeração ou uma medida (ex.: 30 × 40 cm)', v_opt;
  elsif p_type = 'Comprimento' then
    m := regexp_match(regexp_replace(v_opt, '\s*cm$', ' cm', 'i'), '^([0-9]{1,3}(,[0-9])?) cm$');
    if m is not null and replace(m[1], ',', '.')::numeric > 0 then return m[1] || ' cm'; end if;
    raise exception 'O comprimento “%” não é válido (ex.: 45 cm)', v_opt;
  elsif p_type = 'Quantidade' then
    m := regexp_match(v_opt, '^([1-9][0-9]{0,3}) unidades?$');
    if m is null then raise exception 'A quantidade “%” não é válida (ex.: 4 unidades)', v_opt; end if;
    return case when m[1] = '1' then '1 unidade' else m[1] || ' unidades' end;
  elsif public.variation_type_is_free(p_type) then
    if char_length(v_opt) > 20 then raise exception 'A opção “%” passa de 20 caracteres', v_opt; end if;
    if v_opt !~ '^[A-Za-zÀ-ÖØ-öø-ÿ0-9][A-Za-zÀ-ÖØ-öø-ÿ0-9 ''.&/-]*$' then
      raise exception 'A opção “%” deve ter só letras, números e espaços', v_opt;
    end if;
    return v_opt;
  end if;
  raise exception 'Escolha um tipo de variação da lista';
end $$;

revoke all on function public.variation_fold(text) from public, anon;
revoke all on function public.variation_list_key(text) from public, anon;
revoke all on function public.variation_type_check(text) from public, anon;
revoke all on function public.variation_type_is_free(text) from public, anon;
revoke all on function public.variation_option_check(text, text) from public, anon;

-- 2) Fila de revisão do texto livre ----------------------------------------------------
create table if not exists public.variation_text_reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  artisan_id uuid not null references public.profiles(id) on delete cascade,
  variation_type text not null check (variation_type in ('Estampa', 'Modelo', 'Aroma')),
  option_text text not null check (char_length(option_text) between 1 and 20),
  status text not null default 'pending' check (status in ('pending', 'approved', 'hidden')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null
);
create unique index if not exists variation_text_reviews_unique
  on public.variation_text_reviews (product_id, variation_type, lower(option_text));
create index if not exists variation_text_reviews_status_idx on public.variation_text_reviews (status, created_at desc);
alter table public.variation_text_reviews enable row level security;
revoke all on public.variation_text_reviews from public, anon, authenticated;

-- Peça com opção recusada não volta para a vitrine enquanto a opção continuar nela.
create or replace function public.product_hidden_variation_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.active and not coalesce(old.active, false) and exists (
      select 1 from public.variation_text_reviews r
      join public.product_variants v on v.product_id = r.product_id
       and (lower(v.option1) = lower(r.option_text) or lower(coalesce(v.option2, '')) = lower(r.option_text))
      where r.product_id = new.id and r.status = 'hidden') then
    raise exception 'Esta peça tem uma opção de variação recusada pela equipe Artenós. Remova a opção para publicar';
  end if;
  return new;
end $$;
revoke all on function public.product_hidden_variation_guard() from public, anon, authenticated;
drop trigger if exists product_hidden_variation_guard on public.products;
create trigger product_hidden_variation_guard before update of active on public.products
  for each row execute function public.product_hidden_variation_guard();

-- Painel: lista e decisão (qualquer pessoa ativa da equipe).
create or replace function public.admin_list_variation_reviews(p_status text default 'pending')
returns table (id uuid, product_id uuid, product_name text, product_active boolean, artisan_id uuid, store_name text,
  variation_type text, option_text text, status text, created_at timestamptz, reviewed_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not coalesce(public.is_active_admin(), false) then raise exception 'Acesso administrativo não autorizado'; end if;
  return query
    select r.id, r.product_id, p.name, p.active, r.artisan_id, coalesce(pr.store_name, pr.full_name),
      r.variation_type, r.option_text, r.status, r.created_at, r.reviewed_at
    from public.variation_text_reviews r
    join public.products p on p.id = r.product_id
    left join public.profiles pr on pr.id = r.artisan_id
    where p_status is null or r.status = p_status
    order by r.created_at desc
    limit 200;
end $$;
revoke all on function public.admin_list_variation_reviews(text) from public, anon;
grant execute on function public.admin_list_variation_reviews(text) to authenticated;

create or replace function public.admin_review_variation_text(p_review_id uuid, p_action text)
returns text language plpgsql security definer set search_path = '' as $$
declare r public.variation_text_reviews; v_name text;
begin
  if not coalesce(public.is_active_admin(), false) then raise exception 'Acesso administrativo não autorizado'; end if;
  if p_action not in ('approve', 'hide') then raise exception 'Ação inválida'; end if;
  select * into r from public.variation_text_reviews where id = p_review_id for update;
  if not found then raise exception 'Opção não encontrada (a loja pode ter removido)'; end if;
  update public.variation_text_reviews
     set status = case when p_action = 'approve' then 'approved' else 'hidden' end, reviewed_at = now(), reviewed_by = auth.uid()
   where id = r.id;
  if p_action = 'hide' then
    update public.products set active = false, updated_at = now() where id = r.product_id returning name into v_name;
    insert into public.notifications(user_id, kind, title, body, link)
    values (r.artisan_id, 'produto', 'Peça retirada da vitrine',
      'A opção “' || r.option_text || '” (' || r.variation_type || ') de “' || coalesce(v_name, 'sua peça') ||
      '” não foi aceita pela equipe Artenós. Remova ou troque a opção para publicar de novo.', '/vendedor/catalogo');
  end if;
  return case when p_action = 'approve' then 'approved' else 'hidden' end;
end $$;
revoke all on function public.admin_review_variation_text(uuid, text) from public, anon;
grant execute on function public.admin_review_variation_text(uuid, text) to authenticated;

-- 3) Salvar variações com as regras ------------------------------------------------------
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
  v_free text[] := '{}';
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
    -- Só tipos da lista fechada (Cor, Tamanho...). Devolve o nome oficial.
    v_name := public.variation_type_check(v_name);
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
      -- Cada opção segue a regra do seu tipo (paleta, lista, número ou texto curto).
      v_opt1 := public.variation_option_check(v_names[1], v_opt1);
      if v_opt2 is not null then v_opt2 := public.variation_option_check(v_names[2], v_opt2); end if;
      if public.variation_type_is_free(v_names[1]) then v_free := v_free || (v_names[1] || chr(1) || v_opt1); end if;
      if v_opt2 is not null and public.variation_type_is_free(v_names[2]) then v_free := v_free || (v_names[2] || chr(1) || v_opt2); end if;
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

  -- Texto livre (Estampa, Modelo, Aroma): recusado pela equipe não volta; novo entra na revisão.
  if exists (select 1 from public.variation_text_reviews r
      where r.product_id = p_product_id and r.status = 'hidden'
        and (r.variation_type || chr(1) || lower(r.option_text)) = any(select split_part(f, chr(1), 1) || chr(1) || lower(split_part(f, chr(1), 2)) from unnest(v_free) f)) then
    raise exception 'Uma opção desta peça foi recusada pela equipe Artenós. Remova a opção ou use outro nome';
  end if;
  insert into public.variation_text_reviews (product_id, artisan_id, variation_type, option_text)
    select distinct p_product_id, auth.uid(), split_part(f, chr(1), 1), split_part(f, chr(1), 2) from unnest(v_free) f
    on conflict (product_id, variation_type, lower(option_text)) do nothing;
  -- Opção que saiu da peça: some da fila (as recusadas ficam como histórico).
  delete from public.variation_text_reviews r
    where r.product_id = p_product_id and r.status <> 'hidden'
      and not ((r.variation_type || chr(1) || lower(r.option_text)) = any(select split_part(f, chr(1), 1) || chr(1) || lower(split_part(f, chr(1), 2)) from unnest(v_free) f));

  update public.products set gallery_urls = v_gallery, variation_names = v_names, updated_at = now()
    where id = p_product_id;
  perform public.sync_product_from_variants(p_product_id);
end $$;
revoke all on function public.save_my_product_options(uuid, text[], text[], jsonb) from public, anon;
grant execute on function public.save_my_product_options(uuid, text[], text[], jsonb) to authenticated;

commit;
