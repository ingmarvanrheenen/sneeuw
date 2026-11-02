#!/bin/bash
# RLS-test voor "wie rijdt met wie" (crew_trip_cars, crew_trip_riders). Draait via supabase/tests/run.sh.
set -u
A=00000000-0000-0000-0000-0000000000ac; B=00000000-0000-0000-0000-0000000000bc; C=00000000-0000-0000-0000-0000000000cc
D=00000000-0000-0000-0000-0000000000dc; E=00000000-0000-0000-0000-0000000000ec
T1=aaaaaaaa-0000-4000-8000-0000000000c1; T2=aaaaaaaa-0000-4000-8000-0000000000c2
q() { su postgres -c "psql -d sneeuwtest -tAq -v ON_ERROR_STOP=1" <<<"$1" 2>&1 | tr '\n' ' '; }
as() { q "set role authenticated; set request.jwt.claim.sub = '$1'; $2"; }
FAILED=0
check() { local want=$1 name=$2 out=$3; local got=ok
  if echo "$out" | grep -qiE "error|denied|violates|vol|rijdt"; then got=deny; elif [ -z "$(echo "$out" | tr -d " ")" ] || echo "$out" | grep -qE "^ *0 *$"; then got=deny; fi
  if [ "$got" = "$want" ]; then echo "PASS  $name"; else echo "FAIL  $name  (verwacht $want, kreeg $got: $out)"; FAILED=1; fi; }

q "insert into auth.users (id,email) values ('$A','ac'),('$B','bc'),('$C','cc'),('$D','dc'),('$E','ec'); insert into profiles(user_id,display_name) values ('$A','A'),('$B','B'),('$C','C'),('$D','D'),('$E','E') on conflict do nothing;" >/dev/null
CREW=$(as $A "select id from create_crew('Autocrew');" | grep -oE '[0-9a-f-]{36}' | head -1)
CODE=$(q "select invite_code from crews where id='$CREW'" | tr -d ' ')
for U in $B $D $E; do as $U "select join_crew('$CODE');" >/dev/null; done
as $A "insert into records (id,user_id,kind,data,crew_id,client_updated_at) values ('$T1','$A','trip','{}','$CREW',1),('$T2','$A','trip','{}',null,1);" >/dev/null

check ok   "B biedt een auto aan (1 plek)" "$(as $B "insert into crew_trip_cars (crew_id,trip_id,label,seats) values ('$CREW','$T1','Golf van B',1) returning 1;")"
CAR=$(q "select id from crew_trip_cars where driver='$B'" | tr -d ' ')
check deny "B biedt een tweede auto aan" "$(as $B "insert into crew_trip_cars (crew_id,trip_id,label,seats) values ('$CREW','$T1','Nog een',2) returning 1;")"
check deny "B biedt een auto aan voor C" "$(as $B "insert into crew_trip_cars (crew_id,trip_id,driver,label,seats) values ('$CREW','$T1','$C','x',2) returning 1;")"
check deny "C (geen crew) biedt een auto aan" "$(as $C "insert into crew_trip_cars (crew_id,trip_id,label,seats) values ('$CREW','$T1','x',2) returning 1;")"
check deny "auto op een trip zonder crew" "$(as $D "insert into crew_trip_cars (crew_id,trip_id,label,seats) values ('$CREW','$T2','x',2) returning 1;")"
check deny "auto met 12 plekken" "$(as $D "insert into crew_trip_cars (crew_id,trip_id,label,seats) values ('$CREW','$T1','Bus',12) returning 1;")"
check ok   "D stapt in bij B" "$(as $D "insert into crew_trip_riders (trip_id,car_id) values ('$T1','$CAR') returning 1;")"
check deny "E stapt in, maar de auto zit vol" "$(as $E "insert into crew_trip_riders (trip_id,car_id) values ('$T1','$CAR') returning 1;")"
check deny "E zet D in de auto" "$(as $E "insert into crew_trip_riders (trip_id,user_id,car_id) values ('$T1','$D','$CAR') returning 1;")"
check deny "B (bestuurder) stapt in de eigen auto" "$(as $B "insert into crew_trip_riders (trip_id,car_id) values ('$T1','$CAR') returning 1;")"
check deny "D (rijdt al mee) biedt ook een auto aan" "$(as $D "insert into crew_trip_cars (crew_id,trip_id,label,seats) values ('$CREW','$T1','Polo van D',3) returning 1;")"
check deny "B zet de plekken onder wie er al in zit" "$(as $B "update crew_trip_cars set seats=0 where id='$CAR' returning 1;")"
check ok   "B maakt er 3 plekken van" "$(as $B "update crew_trip_cars set seats=3, departs='vr 18:00', note='Boards op het dak' where id='$CAR' returning 1;")"
check deny "D past B's auto aan" "$(as $D "update crew_trip_cars set label='gekaapt' where id='$CAR' returning 1;")"
check deny "B zet de auto op een andere bestuurder" "$(as $B "update crew_trip_cars set driver='$D' where id='$CAR' returning 1;")"
check ok   "E stapt nu wel in" "$(as $E "insert into crew_trip_riders (trip_id,car_id) values ('$T1','$CAR') returning 1;")"
check deny "E pakt nog een plek op dezelfde trip" "$(as $E "insert into crew_trip_riders (trip_id,car_id) values ('$T1','$CAR') returning 1;")"
check ok   "A (crew) ziet auto en plekken" "$(as $A "select count(*) from crew_trip_riders where car_id='$CAR';")"
check deny "C (geen crew) ziet niks" "$(as $C "select count(*) from crew_trip_cars;")"
check deny "E haalt D uit de auto" "$(as $E "delete from crew_trip_riders where user_id='$D' returning 1;")"
check ok   "B (bestuurder) haalt D eruit" "$(as $B "delete from crew_trip_riders where user_id='$D' returning 1;")"
check ok   "E stapt zelf uit" "$(as $E "delete from crew_trip_riders where user_id='$E' returning 1;")"
check deny "D haalt B's auto weg" "$(as $D "delete from crew_trip_cars where id='$CAR' returning 1;")"
check ok   "A (trip-eigenaar) haalt de auto weg" "$(as $A "delete from crew_trip_cars where id='$CAR' returning 1;")"
exit $FAILED
