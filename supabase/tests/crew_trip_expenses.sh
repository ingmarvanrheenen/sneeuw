#!/bin/bash
# RLS-test voor het potje van de trip (crew_trip_expenses). Draait via supabase/tests/run.sh.
set -u
A=00000000-0000-0000-0000-0000000000e5; B=00000000-0000-0000-0000-0000000000e6; C=00000000-0000-0000-0000-0000000000e7
D=00000000-0000-0000-0000-0000000000e8
T1=aaaaaaaa-0000-4000-8000-0000000000e5; T2=aaaaaaaa-0000-4000-8000-0000000000e6
q() { su postgres -c "psql -d sneeuwtest -tAq -v ON_ERROR_STOP=1" <<<"$1" 2>&1 | tr '\n' ' '; }
as() { q "set role authenticated; set request.jwt.claim.sub = '$1'; $2"; }
FAILED=0
check() { local want=$1 name=$2 out=$3; local got=ok
  if echo "$out" | grep -qiE "error|denied|violates"; then got=deny; elif [ -z "$(echo "$out" | tr -d " ")" ] || echo "$out" | grep -qE "^ *0 *$"; then got=deny; fi
  if [ "$got" = "$want" ]; then echo "PASS  $name"; else echo "FAIL  $name  (verwacht $want, kreeg $got: $out)"; FAILED=1; fi; }

q "insert into auth.users (id,email) values ('$A','ae5'),('$B','be6'),('$C','ce7'),('$D','de8'); insert into profiles(user_id,display_name) values ('$A','A'),('$B','B'),('$C','C'),('$D','D') on conflict do nothing;" >/dev/null
CREW=$(as $A "select id from create_crew('Potjecrew');" | grep -oE '[0-9a-f-]{36}' | head -1)
CODE=$(q "select invite_code from crews where id='$CREW'" | tr -d ' ')
as $B "select join_crew('$CODE');" >/dev/null
as $D "select join_crew('$CODE');" >/dev/null
as $A "insert into records (id,user_id,kind,data,crew_id,client_updated_at) values ('$T1','$A','trip','{}','$CREW',1),('$T2','$A','trip','{}',null,1);" >/dev/null
ins() { echo "insert into crew_trip_expenses (trip_id,crew_id,kind,title,amount_cents,paid_by,split_between) values ('$T1','$CREW',$1) returning id;"; }

E1=$(as $B "$(ins "'expense','Boodschappen',9000,'$B',array['$A','$B','$D']::uuid[]")" | grep -oE '[0-9a-f-]{36}' | head -1)
check ok   "B betaalde boodschappen voor A, B en D" "$E1"
check ok   "A voegt toe dat D de skipassen betaalde" "$(as $A "$(ins "'expense','Skipassen',12000,'$D',array['$A','$D']::uuid[]")")"
check ok   "de database noteert A als toevoeger" "$(as $D "select count(*) from crew_trip_expenses where created_by='$A' and paid_by='$D';")"
check deny "A doet alsof C (geen crew) betaalde" "$(as $A "$(ins "'expense','Fondue',3000,'$C',array['$A']::uuid[]")")"
check deny "A deelt met C (geen crew)" "$(as $A "$(ins "'expense','Fondue',3000,'$A',array['$A','$C']::uuid[]")")"
check deny "voor niemand" "$(as $A "$(ins "'expense','Fondue',3000,'$A','{}'::uuid[]")")"
check deny "iemand dubbel" "$(as $A "$(ins "'expense','Fondue',3000,'$A',array['$A','$A']::uuid[]")")"
check deny "nul euro" "$(as $A "$(ins "'expense','Fondue',0,'$A',array['$A']::uuid[]")")"
check deny "lege titel" "$(as $A "$(ins "'expense','   ',3000,'$A',array['$A']::uuid[]")")"
check deny "A zet created_by op B" "$(as $A "insert into crew_trip_expenses (trip_id,crew_id,title,amount_cents,paid_by,split_between,created_by) values ('$T1','$CREW','Pizza',2000,'$A',array['$A']::uuid[],'$B') returning 1;")"
check deny "uitgave op een trip zonder crew" "$(as $A "insert into crew_trip_expenses (trip_id,crew_id,title,amount_cents,paid_by,split_between) values ('$T2','$CREW','Pizza',2000,'$A',array['$A']::uuid[]) returning 1;")"
check ok   "A betaalt B terug" "$(as $A "$(ins "'transfer','Terugbetaald',3000,'$A',array['$B']::uuid[]")")"
check deny "terugbetalen aan jezelf" "$(as $A "$(ins "'transfer','Terug',3000,'$A',array['$A']::uuid[]")")"
check deny "terugbetalen aan twee tegelijk" "$(as $A "$(ins "'transfer','Terug',3000,'$A',array['$B','$D']::uuid[]")")"
check deny "C (geen crew) ziet het potje niet" "$(as $C "select count(*) from crew_trip_expenses;")"
check deny "C voegt iets toe" "$(as $C "$(ins "'expense','Bier',1000,'$C',array['$C']::uuid[]")")"

check ok   "B (betaler en toevoeger) past het bedrag aan" "$(as $B "update crew_trip_expenses set amount_cents=9300 where id='$E1' returning 1;")"
check deny "D (alleen gedeeld) past B's uitgave aan" "$(as $D "update crew_trip_expenses set amount_cents=1 where id='$E1' returning 1;")"
check deny "B verhangt de uitgave naar een andere trip" "$(as $B "update crew_trip_expenses set trip_id='$T2' where id='$E1' returning 1;")"
check deny "B maakt er een terugbetaling van" "$(as $B "update crew_trip_expenses set kind='transfer' where id='$E1' returning 1;")"
check deny "B deelt hem achteraf met C" "$(as $B "update crew_trip_expenses set split_between=array['$B','$C']::uuid[] where id='$E1' returning 1;")"
check deny "D haalt B's uitgave weg" "$(as $D "delete from crew_trip_expenses where id='$E1' returning 1;")"
check ok   "A (trip-eigenaar) haalt hem weg" "$(as $A "delete from crew_trip_expenses where id='$E1' returning 1;")"

# max 300 per trip
q "insert into crew_trip_expenses (trip_id,crew_id,title,amount_cents,paid_by,split_between,created_by) select '$T1','$CREW','x',100,'$A',array['$A']::uuid[],'$A' from generate_series(1, 300 - (select count(*) from crew_trip_expenses where trip_id='$T1'));" >/dev/null
check deny "uitgave nummer 301" "$(as $A "$(ins "'expense','Nog een',100,'$A',array['$A']::uuid[]")")"
exit $FAILED
