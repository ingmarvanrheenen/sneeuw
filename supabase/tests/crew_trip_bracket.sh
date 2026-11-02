#!/bin/bash
# RLS-test voor het trip-toernooi (crew_trip_brackets, crew_trip_bracket_votes). Draait via supabase/tests/run.sh.
set -u
A=00000000-0000-0000-0000-0000000000af; B=00000000-0000-0000-0000-0000000000bf; C=00000000-0000-0000-0000-0000000000cf
T1=aaaaaaaa-0000-4000-8000-0000000000e1; T2=aaaaaaaa-0000-4000-8000-0000000000e2
M1=aaaaaaaa-0000-4000-8000-0000000000f1; M2=aaaaaaaa-0000-4000-8000-0000000000f2; M3=aaaaaaaa-0000-4000-8000-0000000000f3; MX=aaaaaaaa-0000-4000-8000-0000000000f9
q() { su postgres -c "psql -d sneeuwtest -tAq -v ON_ERROR_STOP=1" <<<"$1" 2>&1 | tr '\n' ' '; }
as() { q "set role authenticated; set request.jwt.claim.sub = '$1'; $2"; }
FAILED=0
check() { local want=$1 name=$2 out=$3; local got=ok
  if echo "$out" | grep -qiE "error|denied|violates"; then got=deny; elif [ -z "$(echo "$out" | tr -d " ")" ] || echo "$out" | grep -qE "^ *0 *$"; then got=deny; fi
  if [ "$got" = "$want" ]; then echo "PASS  $name"; else echo "FAIL  $name  (verwacht $want, kreeg $got: $out)"; FAILED=1; fi; }

q "insert into auth.users (id,email) values ('$A','af'),('$B','bf'),('$C','cf'); insert into profiles(user_id,display_name) values ('$A','A'),('$B','B'),('$C','C') on conflict do nothing;" >/dev/null
CREW=$(as $A "select id from create_crew('Toernooicrew');" | grep -oE '[0-9a-f-]{36}' | head -1)
CODE=$(q "select invite_code from crews where id='$CREW'" | tr -d ' ')
as $B "select join_crew('$CODE');" >/dev/null
as $A "insert into records (id,user_id,kind,data,crew_id,client_updated_at) values ('$T1','$A','trip','{}','$CREW',1),('$T2','$A','trip','{}',null,1),('$M1','$A','media','{}','$CREW',1),('$M2','$A','media','{}','$CREW',1),('$MX','$A','media','{}',null,1);" >/dev/null
as $B "insert into records (id,user_id,kind,data,crew_id,client_updated_at) values ('$M3','$B','media','{}','$CREW',1);" >/dev/null

check deny "toernooi met een clip die niet met de crew gedeeld is" "$(as $B "insert into crew_trip_brackets (trip_id,crew_id,entries) values ('$T1','$CREW',array['$M1','$MX']::uuid[]) returning 1;")"
check deny "toernooi met twee keer dezelfde clip" "$(as $B "insert into crew_trip_brackets (trip_id,crew_id,entries) values ('$T1','$CREW',array['$M1','$M1']::uuid[]) returning 1;")"
check deny "toernooi met één clip" "$(as $B "insert into crew_trip_brackets (trip_id,crew_id,entries) values ('$T1','$CREW',array['$M1']::uuid[]) returning 1;")"
check deny "C (geen crew) start een toernooi" "$(as $C "insert into crew_trip_brackets (trip_id,crew_id,entries) values ('$T1','$CREW',array['$M1','$M2']::uuid[]) returning 1;")"
check deny "toernooi op een trip zonder crew" "$(as $B "insert into crew_trip_brackets (trip_id,crew_id,entries) values ('$T2','$CREW',array['$M1','$M2']::uuid[]) returning 1;")"
check ok   "B start het toernooi met drie clips" "$(as $B "insert into crew_trip_brackets (trip_id,crew_id,entries) values ('$T1','$CREW',array['$M1','$M2','$M3']::uuid[]) returning 1;")"
check deny "B past de bracket aan" "$(as $B "update crew_trip_brackets set entries=array['$M1','$M3']::uuid[] where trip_id='$T1' returning 1;")"
check ok   "A stemt in duel 1 op M2" "$(as $A "insert into crew_trip_bracket_votes (trip_id,round,match,pick) values ('$T1',0,0,'$M2') returning 1;")"
check deny "A stemt twee keer in hetzelfde duel" "$(as $A "insert into crew_trip_bracket_votes (trip_id,round,match,pick) values ('$T1',0,0,'$M1') returning 1;")"
check ok   "A zet de stem om naar M1" "$(as $A "update crew_trip_bracket_votes set pick='$M1' where trip_id='$T1' and round=0 and match=0 returning 1;")"
check deny "A stemt op een clip buiten de bracket" "$(as $A "update crew_trip_bracket_votes set pick='$MX' where trip_id='$T1' and round=0 and match=0 returning 1;")"
check deny "A stemt namens B" "$(as $A "insert into crew_trip_bracket_votes (trip_id,round,match,voter,pick) values ('$T1',0,0,'$B','$M2') returning 1;")"
check deny "ronde 5 bestaat niet" "$(as $A "insert into crew_trip_bracket_votes (trip_id,round,match,pick) values ('$T1',5,0,'$M2') returning 1;")"
check ok   "B (crew) ziet de stemmen" "$(as $B "select count(*) from crew_trip_bracket_votes where trip_id='$T1';")"
check deny "C (geen crew) ziet niks" "$(as $C "select count(*) from crew_trip_brackets; select count(*) from crew_trip_bracket_votes;" | tr -s ' ' | grep -v '^ *0 *0 *$' || echo 0)"
check deny "B trekt A's stem in" "$(as $B "delete from crew_trip_bracket_votes where voter='$A' returning 1;")"
check ok   "A trekt de eigen stem in" "$(as $A "delete from crew_trip_bracket_votes where voter='$A' returning 1;")"
as $A "insert into crew_trip_bracket_votes (trip_id,round,match,pick) values ('$T1',0,0,'$M2');" >/dev/null
check ok   "A (trip-eigenaar) begint opnieuw, stemmen gaan mee" "$(as $A "delete from crew_trip_brackets where trip_id='$T1' returning 1;")"
check deny "geen losse stemmen over" "$(q "select count(*) from crew_trip_bracket_votes where trip_id='$T1';")"
exit $FAILED
