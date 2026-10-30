#!/bin/bash
# RLS-test voor "Waar is de crew" (crew_status). Draait via supabase/tests/run.sh.
set -u
A=00000000-0000-0000-0000-0000000000ab; B=00000000-0000-0000-0000-0000000000bb; C=00000000-0000-0000-0000-0000000000cb
q() { su postgres -c "psql -d sneeuwtest -tAq -v ON_ERROR_STOP=1" <<<"$1" 2>&1 | tr '\n' ' '; }
as() { q "set role authenticated; set request.jwt.claim.sub = '$1'; $2"; }
FAILED=0
check() { local want=$1 name=$2 out=$3; local got=ok
  if echo "$out" | grep -qiE "error|denied|violates"; then got=deny; elif [ -z "$(echo "$out" | tr -d " ")" ] || echo "$out" | grep -qE "^ *0 *$"; then got=deny; fi
  if [ "$got" = "$want" ]; then echo "PASS  $name"; else echo "FAIL  $name  (verwacht $want, kreeg $got: $out)"; FAILED=1; fi; }

q "insert into auth.users (id,email) values ('$A','ab'),('$B','bb'),('$C','cb'); insert into profiles(user_id,display_name) values ('$A','A'),('$B','B'),('$C','C') on conflict do nothing;" >/dev/null
CREW=$(as $A "select id from create_crew('Statuscrew');" | grep -oE '[0-9a-f-]{36}' | head -1)
CODE=$(q "select invite_code from crews where id='$CREW'" | tr -d ' ')
as $B "select join_crew('$CODE');" >/dev/null

check ok   "A zet de eigen status" "$(as $A "select status from set_crew_status('lift');")"
check ok   "A zet hem om (nog steeds één rij)" "$(as $A "select set_crew_status('pauze'); select count(*) from crew_status where user_id='$A';")"
check deny "onbekende status" "$(as $A "select set_crew_status('discotheek');")"
check deny "A zet direct een rij (zonder de functie)" "$(as $A "insert into crew_status (status) values ('park') returning 1;")"
check deny "A past de tijd aan" "$(as $A "update crew_status set updated_at = now() + interval '1 day' returning 1;")"
check deny "anoniem een status zetten" "$(q "set role anon; select set_crew_status('lift');")"
check ok   "B (crewgenoot) ziet A's status" "$(as $B "select count(*) from crew_status where user_id='$A' and status='pauze';")"
check deny "C (geen crew) ziet A's status niet" "$(as $C "select count(*) from crew_status;")"
check deny "B haalt A's status weg" "$(as $B "delete from crew_status where user_id='$A' returning 1;")"
check ok   "A haalt de eigen status weg" "$(as $A "delete from crew_status where user_id='$A' returning 1;")"
exit $FAILED
