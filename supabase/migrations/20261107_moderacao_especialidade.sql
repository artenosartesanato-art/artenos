-- Especialidade da loja com "Outro" (texto livre).
-- O filtro de termos ofensivos (o mesmo do chat, das peças e da história)
-- passa a valer também para a especialidade, e não só nas edições: no
-- cadastro (inserção do perfil) o nome da loja, a especialidade e a história
-- também são conferidos.
begin;

create or replace function public.moderate_profile_texts()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform public.moderation_assert_clean(new.store_name);
    perform public.moderation_assert_clean(new.specialty);
    perform public.moderation_assert_clean(new.story);
    return new;
  end if;
  if new.story is distinct from old.story then perform public.moderation_assert_clean(new.story); end if;
  if new.store_name is distinct from old.store_name then perform public.moderation_assert_clean(new.store_name); end if;
  if new.specialty is distinct from old.specialty then perform public.moderation_assert_clean(new.specialty); end if;
  return new;
end $$;

drop trigger if exists moderate_profile_texts on public.profiles;
create trigger moderate_profile_texts before insert or update of story, store_name, specialty on public.profiles
  for each row execute function public.moderate_profile_texts();

commit;
