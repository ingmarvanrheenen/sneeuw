#!/bin/bash
# RLS-test voor crew-doelen (crew_trip_goals + crew_trip_goal_done). Draait via supabase/tests/run.sh.
set -u
A=00000000-0000-0000-0000-0000000000a1; B=00000000-0000-0000-0000-0000000000b1; C=00000000-0000-0000-0000-0000000000c1
T1=33333333-3333-3333-3333-333333333333; T2=44444444-4444-4444-4444-444444444444
q() { su postgres -c "psql -d sneeuwtest -tAq -v ON_ERROR_STOP=1" <<<"$1" 2>&1 | tr '\n' ' '; }
as() { q "set role authenticated; set request.jwt.claim.sub = '$1'; $2"; }
FAILED=0
check() { local want=$1 name=$2 out=$3; local got=ok
  if echo "$out" | grep -qiE "error|denied|violates"; then got=deny; elif [ -z "$(echo "$out" | tr -d " ")" ] || echo "$out" | grep -qE "^ *0 *$"; then got=deny; fi
  if [ "$got" = "$want" ]; then echo "PASS  $name"; else echo "FAIL  $name  (verwacht $want, kreeg $got: $out)"; FAILED=1; fi; }

q "insert into auth.users (id,email) values ('$A','a'),('$B','b'),('$C','c'); insert into profiles(user_id,display_name) values ('$A','A'),('$B','B'),('$C','C') on conflict do nothing;" >/dev/null
CREW=$(as $A "select id from create_crew('Doelcrew');" | grep -oE '[0-9a-f-]{36}' | head -1)
CODE=$(q "select invite_code from crews where id='$CREW'" | tr -d ' ')
as $B "select join_crew('$CODE');" >/dev/null
as $A "insert into records (id,user_id,kind,data,crew_id,client_updated_at) values ('$T1','$A','trip','{}','$CREW',1),('$T2','$A','trip','{}',null,1);" >/dev/null

check ok   "B zet een crew-doel" "$(as $B "insert into crew_trip_goals (crew_id,trip_id,title) values ('$CREW','$T1','Iedereen een rode piste') returning 1;")"
check deny "C (buitenstaander) zet een doel" "$(as $C "insert into crew_trip_goals (crew_id,trip_id,title) values ('$CREW','$T1','x') returning 1;")"
check deny "doel bij trip zonder crew" "$(as $B "insert into crew_trip_goals (crew_id,trip_id,title) values ('$CREW','$T2','x') returning 1;")"
check deny "leeg doel" "$(as $B "insert into crew_trip_goals (crew_id,trip_id,title) values ('$CREW','$T1','  ') returning 1;")"
G=$(q "select id from crew_trip_goals limit 1" | tr -d ' ')
check deny "C ziet de doelen niet" "$(as $C "select count(*) from crew_trip_goals;")"
check ok   "A vinkt zichzelf af" "$(as $A "insert into crew_trip_goal_done (goal_id) values ('$G') returning 1;")"
check deny "A vinkt B af" "$(as $A "insert into crew_trip_goal_done (goal_id,user_id) values ('$G','$B') returning 1;")"
check deny "C vinkt zichzelf af bij andermans crew" "$(as $C "insert into crew_trip_goal_done (goal_id) values ('$G') returning 1;")"
check ok   "B ziet dat A het gehaald heeft" "$(as $B "select count(*) from crew_trip_goal_done where goal_id='$G';")"
check deny "C ziet de afvinkingen niet" "$(as $C "select count(*) from crew_trip_goal_done;")"
check deny "B haalt A's vinkje weg" "$(as $B "delete from crew_trip_goal_done where user_id='$A' returning 1;")"
check ok   "A haalt eigen vinkje weg" "$(as $A "delete from crew_trip_goal_done where user_id='$A' returning 1;")"
check deny "A past B's doeltitel aan" "$(as $A "update crew_trip_goals set title='gehackt' where id='$G' returning 1;")"
check ok   "B past eigen doeltitel aan" "$(as $B "update crew_trip_goals set title='Iedereen een zwarte piste' where id='$G' returning 1;")"
check deny "B verplaatst doel naar andere trip" "$(as $B "update crew_trip_goals set trip_id='$T2' where id='$G' returning 1;")"
as $A "insert into crew_trip_goal_done (goal_id) values ('$G');" >/dev/null
check ok   "A (trip-eigenaar) verwijdert B's doel, vinkjes gaan mee" "$(as $A "delete from crew_trip_goals where id='$G' returning 1;")"
check deny "geen losse vinkjes over" "$(q "select count(*) from crew_trip_goal_done;")"
exit $FAILED
