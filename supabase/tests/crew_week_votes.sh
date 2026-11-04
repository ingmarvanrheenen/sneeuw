#!/bin/bash
# RLS-test voor de trick van de week (crew_week_votes). Draait via supabase/tests/run.sh.
set -u
A=00000000-0000-0000-0000-0000000000ea; B=00000000-0000-0000-0000-0000000000eb; C=00000000-0000-0000-0000-0000000000ed
M1=bbbbbbbb-0000-4000-8000-0000000000ea; M2=bbbbbbbb-0000-4000-8000-0000000000eb; M3=bbbbbbbb-0000-4000-8000-0000000000ed
WEEK=2027-01-11; NOTMONDAY=2027-01-12
q() { su postgres -c "psql -d sneeuwtest -tAq -v ON_ERROR_STOP=1" <<<"$1" 2>&1 | tr '\n' ' '; }
as() { q "set role authenticated; set request.jwt.claim.sub = '$1'; $2"; }
FAILED=0
check() { local want=$1 name=$2 out=$3; local got=ok
  if echo "$out" | grep -qiE "error|denied|violates"; then got=deny; elif [ -z "$(echo "$out" | tr -d " ")" ] || echo "$out" | grep -qE "^ *0 *$"; then got=deny; fi
  if [ "$got" = "$want" ]; then echo "PASS  $name"; else echo "FAIL  $name  (verwacht $want, kreeg $got: $out)"; FAILED=1; fi; }

q "insert into auth.users (id,email) values ('$A','aea'),('$B','beb'),('$C','ced'); insert into profiles(user_id,display_name) values ('$A','A'),('$B','B'),('$C','C') on conflict do nothing;" >/dev/null
CREW=$(as $A "select id from create_crew('Weekcrew');" | grep -oE '[0-9a-f-]{36}' | head -1)
CODE=$(q "select invite_code from crews where id='$CREW'" | tr -d ' ')
as $B "select join_crew('$CODE');" >/dev/null
OTHER=$(as $C "select id from create_crew('Andere');" | grep -oE '[0-9a-f-]{36}' | head -1)
as $A "insert into records (id,user_id,kind,data,crew_id,client_updated_at) values ('$M1','$A','media','{}','$CREW',1);" >/dev/null
as $B "insert into records (id,user_id,kind,data,crew_id,client_updated_at) values ('$M2','$B','media','{}','$CREW',1);" >/dev/null
as $C "insert into records (id,user_id,kind,data,crew_id,client_updated_at) values ('$M3','$C','media','{}','$OTHER',1);" >/dev/null
vote() { echo "insert into crew_week_votes (crew_id,week,media_id) values ('$1','$2','$3') returning 1;"; }

check ok   "A stemt op de clip van B" "$(as $A "$(vote $CREW $WEEK $M2)")"
check deny "A stemt nog een keer dezelfde week" "$(as $A "$(vote $CREW $WEEK $M2)")"
check deny "B stemt op de eigen clip" "$(as $B "$(vote $CREW $WEEK $M2)")"
check ok   "B stemt op de clip van A" "$(as $B "$(vote $CREW $WEEK $M1)")"
check ok   "A ziet de stem van B" "$(as $A "select count(*) from crew_week_votes where voter='$B';")"
check deny "week die niet op maandag begint" "$(as $A "$(vote $CREW $NOTMONDAY $M2)")"
check deny "A stemt op een clip uit een andere crew" "$(as $A "$(vote $CREW 2027-01-18 $M3)")"
check deny "C (andere crew) ziet de stemmen niet" "$(as $C "select count(*) from crew_week_votes where crew_id='$CREW';")"
check deny "C stemt in een vreemde crew" "$(as $C "$(vote $CREW $WEEK $M1)")"
check deny "A verandert de stem van B" "$(as $A "update crew_week_votes set media_id='$M2' where voter='$B' returning 1;")"
check deny "A verandert de stem naar de eigen clip" "$(as $A "update crew_week_votes set media_id='$M1' where voter='$A' returning 1;")"
check deny "A verhangt de stem naar een andere week" "$(as $A "update crew_week_votes set week='2027-01-18' where voter='$A' returning 1;")"
check deny "A trekt de stem van B in" "$(as $A "delete from crew_week_votes where voter='$B' returning 1;")"
check ok   "A trekt de eigen stem in" "$(as $A "delete from crew_week_votes where voter='$A' returning 1;")"
exit $FAILED
