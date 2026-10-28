#!/bin/bash
# RLS-test voor de pow-alarm-voorkeur (push_subscriptions.pow). Draait via supabase/tests/run.sh.
set -u
A=00000000-0000-0000-0000-0000000000a8; B=00000000-0000-0000-0000-0000000000b8
P=$(printf 'p%.0s' {1..87}); K=$(printf 'k%.0s' {1..22})
q() { su postgres -c "psql -d sneeuwtest -tAq -v ON_ERROR_STOP=1" <<<"$1" 2>&1 | tr '\n' ' '; }
as() { q "set role authenticated; set request.jwt.claim.sub = '$1'; $2"; }
FAILED=0
check() { local want=$1 name=$2 out=$3; local got=ok
  if echo "$out" | grep -qiE "error|denied|violates"; then got=deny; elif [ -z "$(echo "$out" | tr -d " ")" ] || echo "$out" | grep -qE "^ *0 *$"; then got=deny; fi
  if [ "$got" = "$want" ]; then echo "PASS  $name"; else echo "FAIL  $name  (verwacht $want, kreeg $got: $out)"; FAILED=1; fi; }

q "insert into auth.users (id,email) values ('$A','a8'),('$B','b8');" >/dev/null
as $A "select save_push_subscription('https://web.push.apple.com/pow-a', '$P', '$K', 'Europe/Amsterdam');" >/dev/null
check ok   "pow-alarm staat standaard aan" "$(as $A "select count(*) from push_subscriptions where pow;")"
check ok   "A zet het pow-alarm uit" "$(as $A "update push_subscriptions set pow=false returning 1;")"
check deny "B zet A's pow-alarm aan" "$(as $B "update push_subscriptions set pow=true where user_id='$A' returning 1;")"
check deny "na uitzetten staat hij uit" "$(as $A "select count(*) from push_subscriptions where pow;")"
exit $FAILED
