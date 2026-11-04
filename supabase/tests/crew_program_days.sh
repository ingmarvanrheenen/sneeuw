#!/bin/bash
# RLS-test voor een programma samen met je crew (crew_program_days). Draait via supabase/tests/run.sh.
set -u
A=00000000-0000-0000-0000-0000000000d7; B=00000000-0000-0000-0000-0000000000d8; C=00000000-0000-0000-0000-0000000000d9
q() { su postgres -c "psql -d sneeuwtest -tAq -v ON_ERROR_STOP=1" <<<"$1" 2>&1 | tr '\n' ' '; }
as() { q "set role authenticated; set request.jwt.claim.sub = '$1'; $2"; }
FAILED=0
check() { local want=$1 name=$2 out=$3; local got=ok
  if echo "$out" | grep -qiE "error|denied|violates"; then got=deny; elif [ -z "$(echo "$out" | tr -d " ")" ] || echo "$out" | grep -qE "^ *0 *$"; then got=deny; fi
  if [ "$got" = "$want" ]; then echo "PASS  $name"; else echo "FAIL  $name  (verwacht $want, kreeg $got: $out)"; FAILED=1; fi; }

q "insert into auth.users (id,email) values ('$A','ad7'),('$B','bd8'),('$C','cd9'); insert into profiles(user_id,display_name) values ('$A','A'),('$B','B'),('$C','C') on conflict do nothing;" >/dev/null
CREW=$(as $A "select id from create_crew('Programmacrew');" | grep -oE '[0-9a-f-]{36}' | head -1)
CODE=$(q "select invite_code from crews where id='$CREW'" | tr -d ' ')
as $B "select join_crew('$CODE');" >/dev/null
OTHER=$(as $C "select id from create_crew('Andere crew');" | grep -oE '[0-9a-f-]{36}' | head -1)

check ok   "A vinkt dag 1 van Switch leren af" "$(as $A "insert into crew_program_days (crew_id,program_id,day) values ('$CREW','switch',0) returning 1;")"
check ok   "B vinkt dag 1 en 2 af" "$(as $B "insert into crew_program_days (crew_id,program_id,day) values ('$CREW','switch',0),('$CREW','switch',1) returning 1;")"
check ok   "A ziet de dagen van B" "$(as $A "select count(*) from crew_program_days where user_id='$B';")"
check deny "dezelfde dag twee keer" "$(as $A "insert into crew_program_days (crew_id,program_id,day) values ('$CREW','switch',0) returning 1;")"
check deny "A zet een dag voor B" "$(as $A "insert into crew_program_days (crew_id,program_id,user_id,day) values ('$CREW','switch','$B',3) returning 1;")"
check deny "A schrijft in een crew waar A niet in zit" "$(as $A "insert into crew_program_days (crew_id,program_id,day) values ('$OTHER','switch',0) returning 1;")"
check deny "C (andere crew) ziet niks" "$(as $C "select count(*) from crew_program_days where crew_id='$CREW';")"
check deny "rare programma-id" "$(as $A "insert into crew_program_days (crew_id,program_id,day) values ('$CREW','<script>',1) returning 1;")"
check deny "dag 14 bestaat niet" "$(as $A "insert into crew_program_days (crew_id,program_id,day) values ('$CREW','switch',14) returning 1;")"
check deny "A past de datum van B aan" "$(as $A "update crew_program_days set done_on='2020-01-01' where user_id='$B' returning 1;")"
check deny "A haalt de dag van B weg" "$(as $A "delete from crew_program_days where user_id='$B' returning 1;")"
check ok   "B haalt een eigen dag weg" "$(as $B "delete from crew_program_days where user_id='$B' and day=1 returning 1;")"
exit $FAILED
