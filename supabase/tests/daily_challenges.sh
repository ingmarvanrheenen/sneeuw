#!/bin/bash
# RLS-test voor de dagopdracht (daily_challenges). Draait via supabase/tests/run.sh.
set -u
A=00000000-0000-0000-0000-0000000000a9; B=00000000-0000-0000-0000-0000000000b9; C=00000000-0000-0000-0000-0000000000c9
q() { su postgres -c "psql -d sneeuwtest -tAq -v ON_ERROR_STOP=1" <<<"$1" 2>&1 | tr '\n' ' '; }
as() { q "set role authenticated; set request.jwt.claim.sub = '$1'; $2"; }
FAILED=0
check() { local want=$1 name=$2 out=$3; local got=ok
  if echo "$out" | grep -qiE "error|denied|violates"; then got=deny; elif [ -z "$(echo "$out" | tr -d " ")" ] || echo "$out" | grep -qE "^ *0 *$"; then got=deny; fi
  if [ "$got" = "$want" ]; then echo "PASS  $name"; else echo "FAIL  $name  (verwacht $want, kreeg $got: $out)"; FAILED=1; fi; }

q "insert into auth.users (id,email) values ('$A','a9'),('$B','b9'),('$C','c9'); insert into profiles(user_id,display_name) values ('$A','A'),('$B','B'),('$C','C') on conflict do nothing;" >/dev/null
CREW=$(as $A "select id from create_crew('Opdrachtcrew');" | grep -oE '[0-9a-f-]{36}' | head -1)
CODE=$(q "select invite_code from crews where id='$CREW'" | tr -d ' ')
as $B "select join_crew('$CODE');" >/dev/null

check ok   "A vinkt de opdracht van vandaag af" "$(as $A "insert into daily_challenges (date,challenge) values (current_date,'ollie-bultje') returning 1;")"
check deny "A nog een keer vandaag (één per dag)" "$(as $A "insert into daily_challenges (date,challenge) values (current_date,'garlands-10') returning 1;")"
check ok   "A zet de opdracht van vandaag om" "$(as $A "update daily_challenges set challenge='garlands-10' where date=current_date returning 1;")"
check deny "A zet de datum om" "$(as $A "update daily_challenges set date=current_date-1 where user_id='$A' returning 1;")"
check ok   "A vinkt gisteren af (offline gedaan, nu gesynct)" "$(as $A "insert into daily_challenges (date,challenge) values (current_date-1,'tien-bochten') returning 1;")"
check deny "A vinkt een maand terug af" "$(as $A "insert into daily_challenges (date,challenge) values (current_date-30,'tien-bochten') returning 1;")"
check deny "A vinkt volgende week af" "$(as $A "insert into daily_challenges (date,challenge) values (current_date+7,'tien-bochten') returning 1;")"
check deny "A vinkt af voor B" "$(as $A "insert into daily_challenges (user_id,date,challenge) values ('$B',current_date,'tien-bochten') returning 1;")"
check deny "rare opdracht-id" "$(as $A "insert into daily_challenges (date,challenge) values (current_date-2,'Drop table') returning 1;")"
check ok   "B (crewgenoot) ziet A's opdracht" "$(as $B "select count(*) from daily_challenges where user_id='$A';")"
check deny "C (geen crew) ziet A's opdracht niet" "$(as $C "select count(*) from daily_challenges;")"
check deny "B vinkt A's opdracht uit" "$(as $B "delete from daily_challenges where user_id='$A' returning 1;")"
check ok   "A vinkt de eigen opdracht uit" "$(as $A "delete from daily_challenges where user_id='$A' and date=current_date returning 1;")"
exit $FAILED
