#!/bin/bash
# RLS-test voor de stemronde van de crew-awards (crew_trip_votes). Draait via supabase/tests/run.sh.
set -u
A=00000000-0000-0000-0000-0000000000a6; B=00000000-0000-0000-0000-0000000000b6; C=00000000-0000-0000-0000-0000000000c6
T1=66666666-6666-6666-6666-666666666666; T2=77777777-7777-7777-7777-777777777777
q() { su postgres -c "psql -d sneeuwtest -tAq -v ON_ERROR_STOP=1" <<<"$1" 2>&1 | tr '\n' ' '; }
as() { q "set role authenticated; set request.jwt.claim.sub = '$1'; $2"; }
FAILED=0
check() { local want=$1 name=$2 out=$3; local got=ok
  if echo "$out" | grep -qiE "error|denied|violates"; then got=deny; elif [ -z "$(echo "$out" | tr -d " ")" ] || echo "$out" | grep -qE "^ *0 *$"; then got=deny; fi
  if [ "$got" = "$want" ]; then echo "PASS  $name"; else echo "FAIL  $name  (verwacht $want, kreeg $got: $out)"; FAILED=1; fi; }

q "insert into auth.users (id,email) values ('$A','a6'),('$B','b6'),('$C','c6'); insert into profiles(user_id,display_name) values ('$A','A'),('$B','B'),('$C','C') on conflict do nothing;" >/dev/null
CREW=$(as $A "select id from create_crew('Stemcrew');" | grep -oE '[0-9a-f-]{36}' | head -1)
CODE=$(q "select invite_code from crews where id='$CREW'" | tr -d ' ')
as $B "select join_crew('$CODE');" >/dev/null
as $A "insert into records (id,user_id,kind,data,crew_id,client_updated_at) values ('$T1','$A','trip','{}','$CREW',1),('$T2','$A','trip','{}',null,1);" >/dev/null

check ok   "A stemt B als val van de trip" "$(as $A "insert into crew_trip_votes (trip_id,crew_id,category,candidate) values ('$T1','$CREW','val','$B') returning 1;")"
check deny "A stemt nog een keer in dezelfde categorie" "$(as $A "insert into crew_trip_votes (trip_id,crew_id,category,candidate) values ('$T1','$CREW','val','$B') returning 1;")"
check deny "B stemt op zichzelf" "$(as $B "insert into crew_trip_votes (trip_id,crew_id,category,candidate) values ('$T1','$CREW','held','$B') returning 1;")"
check deny "B stemt op een buitenstaander" "$(as $B "insert into crew_trip_votes (trip_id,crew_id,category,candidate) values ('$T1','$CREW','held','$C') returning 1;")"
check deny "onbekende categorie" "$(as $B "insert into crew_trip_votes (trip_id,crew_id,category,candidate) values ('$T1','$CREW','lolbroek','$A') returning 1;")"
check deny "stem bij een trip zonder crew" "$(as $B "insert into crew_trip_votes (trip_id,crew_id,category,candidate) values ('$T2','$CREW','val','$A') returning 1;")"
check deny "B stemt namens A" "$(as $B "insert into crew_trip_votes (trip_id,crew_id,category,voter,candidate) values ('$T1','$CREW','held','$A','$B') returning 1;")"
check deny "C (buitenstaander) stemt" "$(as $C "insert into crew_trip_votes (trip_id,crew_id,category,candidate) values ('$T1','$CREW','held','$A') returning 1;")"
check ok   "B stemt A als held van de trip" "$(as $B "insert into crew_trip_votes (trip_id,crew_id,category,candidate) values ('$T1','$CREW','held','$A') returning 1;")"
check ok   "B ziet de stemmen" "$(as $B "select count(*) from crew_trip_votes;")"
check deny "C ziet de stemmen niet" "$(as $C "select count(*) from crew_trip_votes;")"
check deny "B zet A's stem om" "$(as $B "update crew_trip_votes set candidate='$A' where voter='$A' returning 1;")"
check deny "A zet zijn stem om naar zichzelf" "$(as $A "update crew_trip_votes set candidate='$A' where voter='$A' returning 1;")"
check deny "A verhuist zijn stem naar een andere trip" "$(as $A "update crew_trip_votes set trip_id='$T2' where voter='$A' returning 1;")"
check deny "B trekt A's stem in" "$(as $B "delete from crew_trip_votes where voter='$A' returning 1;")"
check ok   "A trekt zijn eigen stem in" "$(as $A "delete from crew_trip_votes where voter='$A' returning 1;")"
exit $FAILED
