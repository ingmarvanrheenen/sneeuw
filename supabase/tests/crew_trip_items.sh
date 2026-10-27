#!/bin/bash
# RLS-test voor de groepslijst (crew_trip_items) tegen een lokale Postgres 16.
# Gebruik: supabase/tests/run.sh  (maakt database 'sneeuwtest' opnieuw aan, draait stub + migraties + deze test)
set -u
A=00000000-0000-0000-0000-00000000000a; B=00000000-0000-0000-0000-00000000000b; C=00000000-0000-0000-0000-00000000000c
T1=11111111-1111-1111-1111-111111111111; T2=22222222-2222-2222-2222-222222222222
q() { su postgres -c "psql -d sneeuwtest -tAq -v ON_ERROR_STOP=1" <<<"$1" 2>&1 | tr '\n' ' '; }
as() { q "set role authenticated; set request.jwt.claim.sub = '$1'; $2"; }
# verwacht: ok = slaagt en raakt rijen, deny = fout of 0 rijen
check() { local want=$1 name=$2 out=$3; local got=ok
  if echo "$out" | grep -qiE "error|denied|violates"; then got=deny; elif [ -z "$(echo "$out" | tr -d " ")" ] || echo "$out" | grep -qE "^ *0 *$"; then got=deny; fi
  if [ "$got" = "$want" ]; then echo "PASS  $name"; else echo "FAIL  $name  (verwacht $want, kreeg $got: $out)"; FAILED=1; fi; }
FAILED=0

q "insert into auth.users (id,email) values ('$A','a'),('$B','b'),('$C','c'); insert into profiles(user_id,display_name) values ('$A','A'),('$B','B'),('$C','C') on conflict do nothing;" >/dev/null
CREW=$(as $A "select id from create_crew('Testcrew');" | grep -oE '[0-9a-f-]{36}' | head -1)
CODE=$(q "select invite_code from crews where id='$CREW'" | tr -d ' ')
as $B "select join_crew('$CODE');" >/dev/null
as $A "insert into records (id,user_id,kind,data,crew_id,client_updated_at) values ('$T1','$A','trip','{}','$CREW',1),('$T2','$A','trip','{}',null,1);" >/dev/null

check ok   "B (crew) voegt item toe aan crew-trip" "$(as $B "insert into crew_trip_items (crew_id,trip_id,label) values ('$CREW','$T1','Speaker') returning 1;")"
check ok   "A voegt item toe" "$(as $A "insert into crew_trip_items (crew_id,trip_id,label) values ('$CREW','$T1','EHBO-doos') returning 1;")"
check deny "C (buitenstaander) voegt toe" "$(as $C "insert into crew_trip_items (crew_id,trip_id,label) values ('$CREW','$T1','Hack') returning 1;")"
check deny "C ziet de lijst niet" "$(as $C "select count(*) from crew_trip_items;")"
check deny "B voegt toe aan trip zonder crew" "$(as $B "insert into crew_trip_items (crew_id,trip_id,label) values ('$CREW','$T2','x') returning 1;")"
check deny "leeg label" "$(as $B "insert into crew_trip_items (crew_id,trip_id,label) values ('$CREW','$T1','   ') returning 1;")"
check deny "B doet zich voor als A (created_by)" "$(as $B "insert into crew_trip_items (crew_id,trip_id,label,created_by) values ('$CREW','$T1','x','$A') returning 1;")"
SPK=$(q "select id from crew_trip_items where label='Speaker'" | tr -d ' ')
EH=$(q "select id from crew_trip_items where label='EHBO-doos'" | tr -d ' ')
check ok   "B claimt speaker voor zichzelf" "$(as $B "update crew_trip_items set claimed_by='$B' where id='$SPK' returning 1;")"
check deny "B voegt item toe met claim op naam van A" "$(as $B "insert into crew_trip_items (crew_id,trip_id,label,claimed_by) values ('$CREW','$T1','x','$A') returning 1;")"
check ok   "B laat zijn claim weer los en pakt hem opnieuw" "$(as $B "update crew_trip_items set claimed_by=null where id='$SPK' returning 1;" ; as $B "update crew_trip_items set claimed_by='$B' where id='$SPK' returning 1;")"
check deny "A claimt EHBO namens B" "$(as $A "update crew_trip_items set claimed_by='$B' where id='$EH' returning 1;")"
check ok   "A vinkt B's speaker af (claim blijft staan)" "$(as $A "update crew_trip_items set done=true where id='$SPK' returning 1;")"
check deny "C werkt bij" "$(as $C "update crew_trip_items set done=false where id='$SPK' returning 1;")"
check deny "B verplaatst item naar andere crew/trip" "$(as $B "update crew_trip_items set trip_id='$T2' where id='$SPK' returning 1;")"
check deny "B verwijdert A's item" "$(as $B "delete from crew_trip_items where id='$EH' returning 1;")"
check ok   "A (trip-eigenaar) verwijdert B's item" "$(as $A "delete from crew_trip_items where id='$SPK' returning 1;")"
check ok   "A verwijdert eigen item" "$(as $A "delete from crew_trip_items where id='$EH' returning 1;")"
as $A "insert into crew_trip_items (crew_id,trip_id,label) values ('$CREW','$T1','Wax');" >/dev/null
as $B "delete from crew_members where user_id='$B';" >/dev/null
check deny "B na crew verlaten ziet niks meer" "$(as $B "select count(*) from crew_trip_items;")"
check ok   "A ziet nog wel" "$(as $A "select count(*) from crew_trip_items;")"

exit $FAILED
