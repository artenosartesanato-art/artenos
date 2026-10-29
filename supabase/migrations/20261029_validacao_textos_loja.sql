-- Validação mínima da história da loja no servidor (mesmas regras de
-- lib/text-quality.ts). Só vale quando a história é alterada: históricos
-- antigos continuam como estão até a loja editar. Pode rodar mais de uma vez.

create or replace function public.is_meaningful_text(p_text text, p_min_length integer default 40)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  v_plain text;
  v_words text[];
  v_letters text;
  v_distinct integer;
begin
  if p_text is null or length(btrim(p_text)) < p_min_length then return false; end if;
  v_plain := lower(translate(btrim(p_text),
    'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
    'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'));
  select array_agg(w) into v_words
    from regexp_split_to_table(v_plain, '\s+') as w where w ~ '[a-z]';
  if coalesce(array_length(v_words, 1), 0) < 6 then return false; end if;
  if exists (select 1 from unnest(v_words) w where length(regexp_replace(w, '[^a-z]', '', 'g')) > 30) then return false; end if;
  select count(distinct regexp_replace(w, '[^a-z]', '', 'g')) into v_distinct
    from unnest(v_words) w where length(regexp_replace(w, '[^a-z]', '', 'g')) >= 3;
  if v_distinct < 4 then return false; end if;
  if v_plain ~ '(.)\1{4,}' then return false; end if;
  v_letters := regexp_replace(v_plain, '[^a-z]', '', 'g');
  if length(v_letters) > 0
     and length(regexp_replace(v_letters, '[^aeiouy]', '', 'g'))::numeric / length(v_letters) < 0.3 then
    return false;
  end if;
  return true;
end;
$$;

create or replace function public.validate_store_story()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.account_type = 'artisan'
     and new.story is distinct from old.story
     and not public.is_meaningful_text(new.story) then
    raise exception 'A história da loja precisa de frases reais, com pelo menos 40 caracteres e 6 palavras.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_store_story on public.profiles;
create trigger validate_store_story before update of story on public.profiles
  for each row execute function public.validate_store_story();
