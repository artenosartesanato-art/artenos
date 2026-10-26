-- Artenós: execute APÓS pagamentos.sql (somente se ainda não houver suas tabelas)
-- e integracao_frete.sql. Para bancos com checkouts/payouts existentes, execute
-- somente ESTE arquivo. Não execute novamente o instalador pagamentos.sql.
-- Não altera compras antigas. Novas compras congelam frete/endereço/tarifa.
begin;

alter table public.checkouts
  add column if not exists integration_version integer,
  add column if not exists shipping_snapshot jsonb,
  add column if not exists buyer_snapshot jsonb,
  add column if not exists reservation_expires_at timestamptz,
  add column if not exists payment_attempt_id uuid default gen_random_uuid(),
  add column if not exists payment_started_at timestamptz;
alter table public.checkout_items
  add column if not exists image_url text,
  add column if not exists stock_reserved boolean not null default false;
alter table public.orders add column if not exists checkout_id uuid
  references public.checkouts(id);
create unique index if not exists orders_checkout_artisan_unique
  on public.orders(checkout_id, artisan_id) where checkout_id is not null;

-- Uma peça reservada continua referenciável até o pagamento ou cancelamento.
create or replace function public.protect_reserved_product_delete()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.checkout_items ci
    join public.checkouts c on c.id=ci.checkout_id
    where ci.product_id=old.id and c.status in ('pending','awaiting_payment')) then
    raise exception 'Há uma compra em pagamento para este produto. Desative-o e aguarde a conclusão';
  end if;
  return old;
end $$;
drop trigger if exists protect_reserved_product_delete on public.products;
create trigger protect_reserved_product_delete before delete on public.products
  for each row execute function public.protect_reserved_product_delete();
revoke all on function public.protect_reserved_product_delete() from public,anon,authenticated;

-- Não permite que o navegador falsifique totais, pagamento ou reservas.
revoke insert, update, delete on public.checkouts, public.checkout_items,
  public.payouts from public, anon, authenticated;
grant select on public.checkouts, public.checkout_items, public.payouts to authenticated;
drop policy if exists "TESTE - cliente cria pedido" on public.orders;
revoke insert on public.orders from public, anon, authenticated;

-- Somente o servidor pode liberar uma reserva após confirmar que não há cobrança.
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
    where checkout_id=c.id and stock_reserved order by product_id
  loop
    update public.products set stock=stock+item.quantity, updated_at=now()
      where id=item.product_id and stock is not null;
  end loop;
  update public.checkout_items set stock_reserved=false where checkout_id=c.id;
  update public.checkouts set status='cancelled', pix_qr_code=null,
    pix_qr_code_base64=null where id=c.id;
  return true;
end $$;

-- Expira somente reservas que NUNCA iniciaram comunicação com o provedor.
-- Pix/requests de resultado incerto precisam de conciliação, nunca de um timer local.
create or replace function public.release_unstarted_checkouts()
returns void language plpgsql security definer set search_path = '' as $$
declare c record;
begin
  for c in select id from public.checkouts
    where integration_version=2 and status='pending'
      and payment_started_at is null and reservation_expires_at < now()
    order by id for update skip locked
  loop
    perform public.cancel_reserved_checkout(c.id);
  end loop;
end $$;

create or replace function public.create_checkout_from_cart()
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  buyer public.profiles; quote public.shipping_quotes;
  item record; seller record; checkout_id uuid; existing_id uuid;
  subtotal numeric(12,2):=0; shipping numeric(12,2):=0;
  fee numeric; snapshots jsonb:='[]'::jsonb; destination text;
begin
  if auth.uid() is null then raise exception 'Faça login para comprar'; end if;
  -- Serializa cliques/abas da mesma conta.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text,0));
  perform public.release_unstarted_checkouts();
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
  select platform_fee_percent into fee from public.platform_pricing_settings where id=1;
  if fee is null or fee<0 or fee>=100 then raise exception 'Tarifa da plataforma inválida'; end if;
  for item in select ci.*, p.price, p.stock, p.active, p.name,
      p.artisan_id as actual_artisan
    from public.cart_items ci join public.products p on p.id=ci.product_id
    where ci.client_id=auth.uid()
  loop
    if not item.active or not public.is_public_artisan(item.actual_artisan)
      or item.artisan_id<>item.actual_artisan or item.actual_artisan=auth.uid() then
      raise exception 'Produto indisponível ou pertence à sua loja: %',item.name;
    end if;
    if item.quantity<1 or item.quantity>99 or
      (item.stock is not null and item.quantity>item.stock) then
      raise exception 'Estoque insuficiente para %',item.name;
    end if;
    if item.unit_price<>item.price then
      raise exception 'O preço de % mudou. Atualize o carrinho e recalcule o frete',item.name;
    end if;
    subtotal:=subtotal+round(item.price*item.quantity,2);
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
  insert into public.checkout_items(checkout_id,product_id,artisan_id,product_name,
    unit_price,quantity,line_total,image_url,stock_reserved)
    select checkout_id,p.id,p.artisan_id,p.name,p.price,ci.quantity,
      round(p.price*ci.quantity,2),p.image_url,p.stock is not null
    from public.cart_items ci join public.products p on p.id=ci.product_id
    where ci.client_id=auth.uid();
  update public.products p set stock=p.stock-ci.quantity,updated_at=now()
    from public.cart_items ci where ci.client_id=auth.uid() and ci.product_id=p.id and p.stock is not null;
  return checkout_id;
end $$;

-- Chave estável: duas requisições simultâneas/retries não geram duas cobranças.
create or replace function public.begin_checkout_payment(p_checkout_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare c public.checkouts;
begin
  select * into c from public.checkouts where id=p_checkout_id for update;
  if not found or c.integration_version is distinct from 2 or c.status<>'pending' then
    raise exception 'Compra indisponível para pagamento';
  end if;
  if c.payment_started_at is null and c.reservation_expires_at<now() then
    raise exception 'Reserva expirada. Cancele esta compra e volte ao carrinho';
  end if;
  update public.checkouts set payment_started_at=coalesce(payment_started_at,now())
    where id=c.id;
  return c.payment_attempt_id;
end $$;

-- A API só chama após consultar o pagamento no Mercado Pago.
create or replace function public.finalize_checkout(
  p_checkout_id uuid,p_mp_payment_id text,p_payment_method text,
  p_gateway_fee numeric,p_fee_percent numeric,p_hold_days integer
) returns boolean language plpgsql security definer set search_path = '' as $$
declare
  c public.checkouts; seller record; item record; q jsonb; v_order_id uuid;
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
    insert into public.order_items(order_id,product_id,product_name,image_url,quantity,unit_price,subtotal)
      select v_order_id,product_id,product_name,image_url,quantity,unit_price,line_total
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
  -- Só remove itens não editados após abrir o pagamento; preserva novas compras.
  delete from public.cart_items cart using public.checkout_items paid
    where paid.checkout_id=c.id and cart.client_id=c.client_id
    and cart.product_id=paid.product_id and cart.quantity=paid.quantity
    and cart.updated_at<=c.created_at;
  delete from public.cart_shipping_selections s where s.client_id=c.client_id
    and exists (select 1 from public.checkout_items ci where ci.checkout_id=c.id and ci.artisan_id=s.artisan_id)
    and s.selected_at<=c.created_at;
  return true;
end $$;

-- Desativa a antiga finalização de teste: nenhuma compra pode ser marcada paga pelo cliente.
create or replace function public.record_checkout_payment(
  p_checkout_id uuid,p_attempt_id uuid,p_payment_id text,p_status text,
  p_detail text,p_method text,p_qr text,p_qr_base64 text,p_expires timestamptz
) returns void language plpgsql security definer set search_path = '' as $$
declare c public.checkouts;
begin
  select * into c from public.checkouts where id=p_checkout_id for update;
  if not found or c.status not in ('pending','awaiting_payment')
    or c.payment_attempt_id is distinct from p_attempt_id then return; end if;
  if c.mp_payment_id is not null and c.mp_payment_id is distinct from p_payment_id then return; end if;
  if p_status in ('pending','in_process','authorized') then
    update public.checkouts set status='awaiting_payment',mp_payment_id=p_payment_id,
      mp_status=p_status,mp_status_detail=p_detail,payment_method=p_method,
      pix_qr_code=p_qr,pix_qr_code_base64=p_qr_base64,pix_expires_at=p_expires where id=c.id;
  elsif p_status='rejected' then
    update public.checkouts set status='pending',mp_payment_id=null,mp_status=p_status,
      mp_status_detail=p_detail,pix_qr_code=null,pix_qr_code_base64=null,pix_expires_at=null,
      payment_attempt_id=gen_random_uuid(),payment_started_at=null,
      reservation_expires_at=now()+interval '30 minutes' where id=c.id;
  elsif p_status='cancelled' then
    perform public.cancel_reserved_checkout(c.id,true);
    update public.checkouts set mp_status=p_status,mp_status_detail=p_detail,mp_payment_id=p_payment_id where id=c.id;
  end if;
end $$;
revoke all on function public.record_checkout_payment(uuid,uuid,text,text,text,text,text,text,timestamptz)
  from public,anon,authenticated;
grant execute on function public.record_checkout_payment(uuid,uuid,text,text,text,text,text,text,timestamptz) to service_role;
revoke execute on function public.checkout_cart() from public, anon, authenticated;
revoke all on function public.cancel_reserved_checkout(uuid,boolean) from public,anon,authenticated;
revoke all on function public.release_unstarted_checkouts() from public,anon,authenticated;
revoke all on function public.begin_checkout_payment(uuid) from public,anon,authenticated;
revoke all on function public.finalize_checkout(uuid,text,text,numeric,numeric,integer) from public,anon,authenticated;
grant execute on function public.cancel_reserved_checkout(uuid,boolean),
  public.release_unstarted_checkouts(),public.begin_checkout_payment(uuid),
  public.finalize_checkout(uuid,text,text,numeric,numeric,integer) to service_role;
revoke all on function public.create_checkout_from_cart() from public,anon;
grant execute on function public.create_checkout_from_cart() to authenticated;
commit;
