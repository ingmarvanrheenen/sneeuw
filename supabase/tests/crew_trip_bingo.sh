#!/bin/bash
# RLS-test voor trip-bingo (crew_trip_bingo). Draait via supabase/tests/run.sh.
set -u
A=00000000-0000-0000-0000-0000000000a7; B=00000000-0000-0000-0000-0000000000b7; C=00000000-0000-0000-0000-0000000000c7
T1=88888888-8888-8888-8888-888888888888; T2=99999999-9999-9999-9999-999999999999
q() { su postgres -c "psql -d sneeuwtest -tAq -v ON_ERROR_STOP=1" <<<"$1" 2>&1 | tr '\n' ' '; }
as() { q "set role authenticated; set request.jwt.claim.sub = '$1'; $2"; }
FAILED=0
check() { local want=$1 name=$2 out=$3; local got=ok
  if echo "$out" | grep -qiE "error|denied|violates"; then got=deny; elif [ -z "$(echo "$out" | tr -d " ")" ] || echo "$out" | grep -qE "^ *0 *$"; then got=deny; fi
  if [ "$got" = "$want" ]; then echo "PASS  $name"; else echo "FAIL  $name  (verwacht $want, kreeg $got: $out)"; FAILED=1; fi; }

q "insert into auth.users (id,email) values ('$A','a7'),('$B','b7'),('$C','c7'); insert into profiles(user_id,display_name) values ('$A','A'),('$B','B'),('$C','C') on conflict do nothing;" >/dev/null
CREW=$(as $A "select id from create_crew('Bingocrew');" | grep -oE '[0-9a-f-]{36}' | head -1)
CODE=$(q "select invite_code from crews where id='$CREW'" | tr -d ' ')
as $B "select join_crew('$CODE');" >/dev/null
as $A "insert into records (id,user_id,kind,data,crew_id,client_updated_at) values ('$T1','$A','trip','{}','$CREW',1),('$T2','$A','trip','{}',null,1);" >/dev/null

check ok   "B vinkt een vakje af" "$(as $B "insert into crew_trip_bingo (trip_id,crew_id,square) values ('$T1','$CREW','eerste-zwart') returning 1;")"
check deny "B vinkt hetzelfde vakje nog een keer af" "$(as $B "insert into crew_trip_bingo (trip_id,crew_id,square) values ('$T1','$CREW','eerste-zwart') returning 1;")"
check deny "B vinkt af voor A" "$(as $B "insert into crew_trip_bingo (trip_id,crew_id,user_id,square) values ('$T1','$CREW','$A','poeder') returning 1;")"
check deny "C (buitenstaander) vinkt af" "$(as $C "insert into crew_trip_bingo (trip_id,crew_id,square) values ('$T1','$CREW','poeder') returning 1;")"
check deny "vakje bij een trip zonder crew" "$(as $B "insert into crew_trip_bingo (trip_id,crew_id,square) values ('$T2','$CREW','poeder') returning 1;")"
check deny "rare vakje-id" "$(as $B "insert into crew_trip_bingo (trip_id,crew_id,square) values ('$T1','$CREW','Drop table') returning 1;")"
check ok   "A ziet B's vinkje" "$(as $A "select count(*) from crew_trip_bingo where trip_id='$T1';")"
check deny "C ziet de vinkjes niet" "$(as $C "select count(*) from crew_trip_bingo;")"
check deny "B verzet zijn tijdstip (wie was eerst)" "$(as $B "update crew_trip_bingo set created_at='2000-01-01' where user_id='$B' returning 1;")"
check deny "A haalt B's vinkje weg" "$(as $A "delete from crew_trip_bingo where user_id='$B' returning 1;")"
check ok   "B haalt zijn eigen vinkje weg" "$(as $B "delete from crew_trip_bingo where user_id='$B' returning 1;")"
exit $FAILED
