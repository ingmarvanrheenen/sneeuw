-- Fix: create_crew gebruikte gen_random_bytes (pgcrypto). Op Supabase staat die in het
-- schema `extensions`, buiten het search_path van de functie. Nieuwe code-generator
-- zonder extensies, en zonder verwarrende tekens (0/O, 1/I/L).
create or replace function public.create_crew(crew_name text) returns public.crews
language plpgsql security definer set search_path = public as $$
declare
  c public.crews;
  code text;
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
begin
  if auth.uid() is null then raise exception 'niet ingelogd'; end if;
  if char_length(trim(crew_name)) = 0 then raise exception 'Geef je crew een naam'; end if;
  insert into profiles (user_id) values (auth.uid()) on conflict do nothing;
  loop
    code := '';
    for i in 1..6 loop
      code := code || substr(alphabet, 1 + floor(random() * char_length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from crews where invite_code = code);
  end loop;
  insert into crews (name, invite_code, created_by) values (trim(crew_name), code, auth.uid()) returning * into c;
  insert into crew_members (crew_id, user_id, role) values (c.id, auth.uid(), 'owner');
  return c;
end $$;
