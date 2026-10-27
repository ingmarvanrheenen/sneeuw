#!/bin/bash
# RLS-test voor het rider-profiel: bijnamen en profielgrootte. Draait via supabase/tests/run.sh.
set -u
A=00000000-0000-0000-0000-0000000000a3; B=00000000-0000-0000-0000-0000000000b3; C=00000000-0000-0000-0000-0000000000c3
q() { su postgres -c "psql -d sneeuwtest -tAq -v ON_ERROR_STOP=1" <<<"$1" 2>&1 | tr '\n' ' '; }
as() { q "set role authenticated; set request.jwt.claim.sub = '$1'; $2"; }
FAILED=0
check() { local want=$1 name=$2 out=$3; local got=ok
  if echo "$out" | grep -qiE "error|denied|violates"; then got=deny; elif [ -z "$(echo "$out" | tr -d " ")" ] || echo "$out" | grep -qE "^ *0 *$"; then got=deny; fi
  if [ "$got" = "$want" ]; then echo "PASS  $name"; else echo "FAIL  $name  (verwacht $want, kreeg $got: $out)"; FAILED=1; fi; }

q "insert into auth.users (id,email) values ('$A','a3'),('$B','b3'),('$C','c3'); insert into profiles(user_id,display_name) values ('$A','A'),('$B','B'),('$C','C') on conflict do nothing;" >/dev/null
CREW=$(as $A "select id from create_crew('Bijnaamcrew');" | grep -oE '[0-9a-f-]{36}' | head -1)
CODE=$(q "select invite_code from crews where id='$CREW'" | tr -d ' ')
as $B "select join_crew('$CODE');" >/dev/null

check ok   "B stelt een bijnaam voor aan A" "$(as $B "insert into nicknames (to_user,nickname) values ('$A','Valkoning') returning 1;")"
check deny "dezelfde bijnaam nog een keer" "$(as $B "insert into nicknames (to_user,nickname) values ('$A',' valkoning ') returning 1;")"
check deny "C (geen crew) stelt voor aan A" "$(as $C "insert into nicknames (to_user,nickname) values ('$A','Hoi') returning 1;")"
check deny "jezelf een bijnaam geven" "$(as $A "insert into nicknames (to_user,nickname) values ('$A','Ik') returning 1;")"
check deny "namens een ander voorstellen" "$(as $B "insert into nicknames (to_user,from_user,nickname) values ('$A','$C','Nep') returning 1;")"
check deny "meteen goedgekeurd insturen" "$(as $B "insert into nicknames (to_user,nickname,status) values ('$A','Baas','ok') returning 1;")"
check deny "lege bijnaam" "$(as $B "insert into nicknames (to_user,nickname) values ('$A','   ') returning 1;")"
check deny "te lange bijnaam" "$(as $B "insert into nicknames (to_user,nickname) values ('$A','$(printf 'x%.0s' {1..31})') returning 1;")"
as $B "insert into nicknames (to_user,nickname) values ('$A','Twee'),('$A','Drie');" >/dev/null
check deny "max 3 open voorstellen per persoon" "$(as $B "insert into nicknames (to_user,nickname) values ('$A','Vier') returning 1;")"
check ok   "A ziet de voorstellen" "$(as $A "select count(*) from nicknames where to_user='$A';" | grep -E '^ *3 *$')"
check deny "C ziet ze niet" "$(as $C "select count(*) from nicknames;")"
check deny "B keurt zijn eigen voorstel goed" "$(as $B "update nicknames set status='ok' where nickname='Valkoning' returning 1;")"
check ok   "A keurt goed" "$(as $A "update nicknames set status='ok' where nickname='Valkoning' returning 1;")"
check deny "A past de bijnaam zelf aan" "$(as $A "update nicknames set nickname='Anders' where nickname='Valkoning' returning 1;")"
check ok   "A wijst af" "$(as $A "update nicknames set status='nee' where nickname='Twee' returning 1;")"
check ok   "B trekt een voorstel in" "$(as $B "delete from nicknames where nickname='Drie' returning 1;")"
check deny "profiel met te grote foto" "$(as $A "update profiles set data = jsonb_build_object('photo', repeat('x', 130000)) where user_id='$A' returning 1;")"
check ok   "profiel met kleine foto" "$(as $A "update profiles set data = jsonb_build_object('photo', repeat('x', 20000)) where user_id='$A' returning 1;")"
check ok   "B (crew) ziet A's profiel" "$(as $B "select count(*) from profiles where user_id='$A';")"
check deny "C (geen crew) ziet A's profiel niet" "$(as $C "select count(*) from profiles where user_id='$A';")"
exit $FAILED
