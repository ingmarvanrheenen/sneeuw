#!/bin/bash
# RLS-test voor push-abonnementen en het push-logboek. Draait via supabase/tests/run.sh.
set -u
A=00000000-0000-0000-0000-0000000000a2; B=00000000-0000-0000-0000-0000000000b2
q() { su postgres -c "psql -d sneeuwtest -tAq -v ON_ERROR_STOP=1" <<<"$1" 2>&1 | tr '\n' ' '; }
as() { q "set role authenticated; set request.jwt.claim.sub = '$1'; $2"; }
FAILED=0
check() { local want=$1 name=$2 out=$3; local got=ok
  if echo "$out" | grep -qiE "error|denied|violates"; then got=deny; elif [ -z "$(echo "$out" | tr -d " ")" ] || echo "$out" | grep -qE "^ *0 *$"; then got=deny; fi
  if [ "$got" = "$want" ]; then echo "PASS  $name"; else echo "FAIL  $name  (verwacht $want, kreeg $got: $out)"; FAILED=1; fi; }

P=BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4
K=BTBZMqHH6r4Tts7J_aSIgg
E1=https://web.push.apple.com/telefoon-1
save() { as $1 "select count(*) from save_push_subscription('$2','$P','$K','Europe/Amsterdam');"; }

q "insert into auth.users (id,email) values ('$A','a2'),('$B','b2'); insert into profiles(user_id,display_name) values ('$A','A'),('$B','B') on conflict do nothing;" >/dev/null

check ok   "A meldt een iPhone aan" "$(save $A $E1)"
check ok   "nog een keer aanmelden werkt bij (geen dubbele)" "$(save $A $E1; as $A "select count(*) from push_subscriptions;" | grep -E '^ *1 *$')"
check deny "nep-endpoint (geen push-dienst)" "$(save $A https://evil.example.com/x)"
check deny "http in plaats van https" "$(save $A http://web.push.apple.com/x)"
check deny "zonder login" "$(q "set role anon; select count(*) from save_push_subscription('https://web.push.apple.com/z','$P','$K','');")"
check deny "direct inserten mag niet" "$(as $A "insert into push_subscriptions (endpoint,p256dh,auth) values ('https://web.push.apple.com/d','$P','$K') returning 1;")"
check deny "B ziet A's abonnement niet" "$(as $B "select count(*) from push_subscriptions;")"
check ok   "A zet de herinnering uit" "$(as $A "update push_subscriptions set reminder=false returning 1;")"
check deny "B zet A's voorkeur uit" "$(as $B "update push_subscriptions set goals=false returning 1;")"
check deny "A verhangt zijn abonnement aan B" "$(as $A "update push_subscriptions set user_id='$B' returning 1;")"
check deny "A wijzigt het endpoint" "$(as $A "update push_subscriptions set endpoint='https://web.push.apple.com/ander' returning 1;")"
check deny "B verwijdert A's abonnement" "$(as $B "delete from push_subscriptions returning 1;")"
check ok   "zelfde telefoon, ander account: gaat over naar B" "$(save $B $E1; q "select count(*) from push_subscriptions where endpoint='$E1' and user_id='$B';" | grep -E '^ *1 *$')"
check deny "A heeft hem niet meer" "$(as $A "select count(*) from push_subscriptions;")"
check ok   "max 10 telefoons per account" "$(for i in $(seq 1 12); do save $B https://web.push.apple.com/t$i >/dev/null; done; q "select count(*) from push_subscriptions where user_id='$B';" | grep -E '^ *10 *$')"
check ok   "B verwijdert eigen abonnement" "$(as $B "delete from push_subscriptions where endpoint='https://web.push.apple.com/t12' returning 1;")"
check deny "push_log lezen" "$(as $A "select count(*) from push_log;")"
check deny "push_log schrijven" "$(as $A "insert into push_log (key) values ('x') returning 1;")"
exit $FAILED
