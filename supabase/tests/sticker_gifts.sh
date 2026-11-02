#!/bin/bash
# RLS-test voor stickers cadeau doen (sticker_gifts). Draait via supabase/tests/run.sh.
set -u
A=00000000-0000-0000-0000-0000000000ae; B=00000000-0000-0000-0000-0000000000be; C=00000000-0000-0000-0000-0000000000ce; D=00000000-0000-0000-0000-0000000000de
q() { su postgres -c "psql -d sneeuwtest -tAq -v ON_ERROR_STOP=1" <<<"$1" 2>&1 | tr '\n' ' '; }
as() { q "set role authenticated; set request.jwt.claim.sub = '$1'; $2"; }
FAILED=0
check() { local want=$1 name=$2 out=$3; local got=ok
  if echo "$out" | grep -qiE "error|denied|violates"; then got=deny; elif [ -z "$(echo "$out" | tr -d " ")" ] || echo "$out" | grep -qE "^ *0 *$"; then got=deny; fi
  if [ "$got" = "$want" ]; then echo "PASS  $name"; else echo "FAIL  $name  (verwacht $want, kreeg $got: $out)"; FAILED=1; fi; }

q "insert into auth.users (id,email) values ('$A','ae'),('$B','be'),('$C','ce'),('$D','de'); insert into profiles(user_id,display_name) values ('$A','A'),('$B','B'),('$C','C'),('$D','D') on conflict do nothing;" >/dev/null
CREW=$(as $A "select id from create_crew('Stickercrew');" | grep -oE '[0-9a-f-]{36}' | head -1)
CODE=$(q "select invite_code from crews where id='$CREW'" | tr -d ' ')
as $B "select join_crew('$CODE');" >/dev/null
as $D "select join_crew('$CODE');" >/dev/null

check ok   "A geeft B een sticker" "$(as $A "insert into sticker_gifts (to_user,sticker,note) values ('$B','goat','GOAT van de dag') returning 1;")"
check deny "A geeft zichzelf een sticker" "$(as $A "insert into sticker_gifts (to_user,sticker) values ('$A','vuur') returning 1;")"
check deny "A geeft C (geen crew) een sticker" "$(as $A "insert into sticker_gifts (to_user,sticker) values ('$C','vuur') returning 1;")"
check deny "A geeft namens D" "$(as $A "insert into sticker_gifts (from_user,to_user,sticker) values ('$D','$B','vuur') returning 1;")"
check deny "onbekende sticker" "$(as $A "insert into sticker_gifts (to_user,sticker) values ('$B','unicorn') returning 1;")"
check ok   "A geeft een sticker die al geplakt is: komt ongeplakt binnen (2 deze week)" "$(as $A "insert into sticker_gifts (to_user,sticker,pinned) values ('$B','lol',true) returning (not pinned)::int;")"
check ok   "A geeft er nog een (3 deze week)" "$(as $A "insert into sticker_gifts (to_user,sticker) values ('$B','stomp') returning 1;")"
check deny "A geeft een vierde deze week" "$(as $A "insert into sticker_gifts (to_user,sticker) values ('$D','vuur') returning 1;")"
check ok   "B ziet de gekregen stickers" "$(as $B "select count(*) from sticker_gifts where to_user='$B';")"
check deny "D ziet B's ongeplakte stickers niet" "$(as $D "select count(*) from sticker_gifts where to_user='$B';")"
check ok   "B plakt de GOAT op de skipas" "$(as $B "update sticker_gifts set pinned=true where to_user='$B' and sticker='goat' returning 1;")"
check ok   "D (crew) ziet de geplakte sticker" "$(as $D "select count(*) from sticker_gifts where to_user='$B' and pinned;")"
check deny "C (geen crew) ziet niks" "$(as $C "select count(*) from sticker_gifts;")"
check deny "A plakt hem voor B" "$(as $A "update sticker_gifts set pinned=false where to_user='$B' returning 1;")"
check deny "B verandert de sticker" "$(as $B "update sticker_gifts set sticker='rip' where to_user='$B' returning 1;")"
check deny "B verandert het berichtje" "$(as $B "update sticker_gifts set note='zelf geschreven' where to_user='$B' returning 1;")"
as $D "insert into sticker_gifts (to_user,sticker) values ('$B','mood5'),('$B','mood4'),('$B','lol');" >/dev/null
check ok   "B plakt er nog twee (3 op de pas)" "$(as $B "update sticker_gifts set pinned=true where to_user='$B' and sticker in ('stomp','mood5') returning 1;")"
check deny "B plakt er een vierde op" "$(as $B "update sticker_gifts set pinned=true where to_user='$B' and sticker='mood4' returning 1;")"
check deny "A gooit B's sticker weg" "$(as $A "delete from sticker_gifts where to_user='$B' returning 1;")"
check ok   "B gooit een sticker weg" "$(as $B "delete from sticker_gifts where to_user='$B' and sticker='lol' returning 1;")"
exit $FAILED
