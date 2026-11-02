#!/bin/bash
# RLS-test voor het huisje-briefje (crew_trip_house, crew_trip_cooking). Draait via supabase/tests/run.sh.
set -u
A=00000000-0000-0000-0000-0000000000ad; B=00000000-0000-0000-0000-0000000000bd; C=00000000-0000-0000-0000-0000000000cd
T1=aaaaaaaa-0000-4000-8000-0000000000d1; T2=aaaaaaaa-0000-4000-8000-0000000000d2
q() { su postgres -c "psql -d sneeuwtest -tAq -v ON_ERROR_STOP=1" <<<"$1" 2>&1 | tr '\n' ' '; }
as() { q "set role authenticated; set request.jwt.claim.sub = '$1'; $2"; }
FAILED=0
check() { local want=$1 name=$2 out=$3; local got=ok
  if echo "$out" | grep -qiE "error|denied|violates"; then got=deny; elif [ -z "$(echo "$out" | tr -d " ")" ] || echo "$out" | grep -qE "^ *0 *$"; then got=deny; fi
  if [ "$got" = "$want" ]; then echo "PASS  $name"; else echo "FAIL  $name  (verwacht $want, kreeg $got: $out)"; FAILED=1; fi; }

q "insert into auth.users (id,email) values ('$A','ad'),('$B','bd'),('$C','cd'); insert into profiles(user_id,display_name) values ('$A','A'),('$B','B'),('$C','C') on conflict do nothing;" >/dev/null
CREW=$(as $A "select id from create_crew('Huisjecrew');" | grep -oE '[0-9a-f-]{36}' | head -1)
CODE=$(q "select invite_code from crews where id='$CREW'" | tr -d ' ')
as $B "select join_crew('$CODE');" >/dev/null
as $A "insert into records (id,user_id,kind,data,crew_id,client_updated_at) values ('$T1','$A','trip','{}','$CREW',1),('$T2','$A','trip','{}',null,1);" >/dev/null

check ok   "B (crew) begint het briefje" "$(as $B "insert into crew_trip_house (trip_id,crew_id,wifi_name,wifi_code) values ('$T1','$CREW','Chalet','sneeuw123') returning 1;")"
check ok   "het briefje weet dat B het schreef" "$(as $A "select count(*) from crew_trip_house where updated_by='$B';")"
check ok   "A (crew) vult het adres aan" "$(as $A "update crew_trip_house set address='Rue des Pistes 4, Tignes' where trip_id='$T1' returning 1;")"
check ok   "nu staat A als laatste schrijver" "$(as $B "select count(*) from crew_trip_house where updated_by='$A';")"
check deny "A zet updated_by op B" "$(as $A "update crew_trip_house set updated_by='$B' where trip_id='$T1' returning 1;")"
check deny "A verhangt het briefje naar een andere trip" "$(as $A "update crew_trip_house set trip_id='$T2' where trip_id='$T1' returning 1;")"
check deny "C (geen crew) ziet het briefje niet" "$(as $C "select count(*) from crew_trip_house;")"
check deny "C begint een briefje" "$(as $C "insert into crew_trip_house (trip_id,crew_id) values ('$T1','$CREW') returning 1;")"
check deny "briefje op een trip zonder crew" "$(as $B "insert into crew_trip_house (trip_id,crew_id) values ('$T2','$CREW') returning 1;")"
check deny "notities van 2000 tekens" "$(as $B "update crew_trip_house set notes=repeat('x',2000) where trip_id='$T1' returning 1;")"

check ok   "B kookt zaterdag" "$(as $B "insert into crew_trip_cooking (trip_id,crew_id,day,menu) values ('$T1','$CREW','2027-01-16','Raclette') returning 1;")"
check deny "A kookt ook zaterdag (één kok per avond)" "$(as $A "insert into crew_trip_cooking (trip_id,crew_id,day) values ('$T1','$CREW','2027-01-16') returning 1;")"
check deny "A zet B op zondag" "$(as $A "insert into crew_trip_cooking (trip_id,crew_id,day,cook) values ('$T1','$CREW','2027-01-17','$B') returning 1;")"
check ok   "B past het eigen menu aan" "$(as $B "update crew_trip_cooking set menu='Fondue' where day='2027-01-16' returning 1;")"
check deny "A past B's menu aan" "$(as $A "update crew_trip_cooking set menu='Pizza' where day='2027-01-16' returning 1;")"
check deny "B zet de kok om naar A" "$(as $B "update crew_trip_cooking set cook='$A' where day='2027-01-16' returning 1;")"
check deny "C ziet het kookrooster niet" "$(as $C "select count(*) from crew_trip_cooking;")"
check ok   "A (trip-eigenaar) maakt zaterdag vrij" "$(as $A "delete from crew_trip_cooking where day='2027-01-16' returning 1;")"
check ok   "A kookt zondag" "$(as $A "insert into crew_trip_cooking (trip_id,crew_id,day) values ('$T1','$CREW','2027-01-17') returning 1;")"
check deny "B haalt A's avond weg" "$(as $B "delete from crew_trip_cooking where day='2027-01-17' returning 1;")"
check deny "B haalt het briefje weg" "$(as $B "delete from crew_trip_house where trip_id='$T1' returning 1;")"
check ok   "A (trip-eigenaar) haalt het briefje weg" "$(as $A "delete from crew_trip_house where trip_id='$T1' returning 1;")"
exit $FAILED
