#!/bin/bash
# RLS-test voor S.N.O.W. (snow_games + snow_moves). Draait via supabase/tests/run.sh.
set -u
A=00000000-0000-0000-0000-0000000000a5; B=00000000-0000-0000-0000-0000000000b5; C=00000000-0000-0000-0000-0000000000c5
q() { su postgres -c "psql -d sneeuwtest -tAq -v ON_ERROR_STOP=1" <<<"$1" 2>&1 | tr '\n' ' '; }
as() { q "set role authenticated; set request.jwt.claim.sub = '$1'; $2"; }
FAILED=0
check() { local want=$1 name=$2 out=$3; local got=ok
  if echo "$out" | grep -qiE "error|denied|violates"; then got=deny; elif [ -z "$(echo "$out" | tr -d " ")" ] || echo "$out" | grep -qE "^ *0 *$"; then got=deny; fi
  if [ "$got" = "$want" ]; then echo "PASS  $name"; else echo "FAIL  $name  (verwacht $want, kreeg $got: $out)"; FAILED=1; fi; }

q "insert into auth.users (id,email) values ('$A','a5'),('$B','b5'),('$C','c5'); insert into profiles(user_id,display_name) values ('$A','A'),('$B','B'),('$C','C') on conflict do nothing;" >/dev/null
CREW=$(as $A "select id from create_crew('Snowcrew');" | grep -oE '[0-9a-f-]{36}' | head -1)
CODE=$(q "select invite_code from crews where id='$CREW'" | tr -d ' ')
as $B "select join_crew('$CODE');" >/dev/null
OTHER=$(as $C "select id from create_crew('Andere crew');" | grep -oE '[0-9a-f-]{36}' | head -1)

check deny "potje met een buitenstaander" "$(as $A "insert into snow_games (crew_id,players) values ('$CREW','{$A,$C}') returning 1;")"
check deny "potje met dezelfde speler twee keer" "$(as $A "insert into snow_games (crew_id,players) values ('$CREW','{$A,$A}') returning 1;")"
check deny "potje in andermans crew" "$(as $A "insert into snow_games (crew_id,players) values ('$OTHER','{$C,$A}') returning 1;")"
check deny "potje in naam van een ander" "$(as $A "insert into snow_games (crew_id,players,created_by) values ('$CREW','{$A,$B}','$B') returning 1;")"
G=$(as $A "insert into snow_games (crew_id,players) values ('$CREW','{$A,$B}') returning id;" | grep -oE '[0-9a-f-]{36}' | head -1)
check ok   "A start een potje met B" "$G"
check ok   "B ziet het potje" "$(as $B "select count(*) from snow_games;")"
check deny "C ziet het potje niet" "$(as $C "select count(*) from snow_games where id='$G';")"

check ok   "A zet een ollie neer (zet 0)" "$(as $A "insert into snow_moves (game_id,seq,kind,player,trick_id,landed) values ('$G',0,'set','$A','ollie',true) returning 1;")"
check deny "zet 0 nog een keer (tegelijk ingevuld)" "$(as $B "insert into snow_moves (game_id,seq,kind,player,trick_id,landed) values ('$G',0,'match','$B','ollie',false) returning 1;")"
check deny "zet overslaan (seq 5)" "$(as $B "insert into snow_moves (game_id,seq,kind,player,trick_id,landed) values ('$G',5,'match','$B','ollie',false) returning 1;")"
check deny "zet voor iemand die niet meespeelt" "$(as $B "insert into snow_moves (game_id,seq,kind,player,trick_id,landed) values ('$G',1,'match','$C','ollie',false) returning 1;")"
check deny "rare trick-id" "$(as $B "insert into snow_moves (game_id,seq,kind,player,trick_id,landed) values ('$G',1,'match','$B','Ollie; drop',false) returning 1;")"
check deny "C vult een zet in" "$(as $C "insert into snow_moves (game_id,seq,kind,player,trick_id,landed) values ('$G',1,'match','$B','ollie',true) returning 1;")"
check ok   "B vult zijn poging in (zet 1)" "$(as $B "insert into snow_moves (game_id,seq,kind,player,trick_id,landed) values ('$G',1,'match','$B','ollie',false) returning 1;")"
check deny "C ziet de zetten niet" "$(as $C "select count(*) from snow_moves;")"
check deny "zet aanpassen kan niet" "$(as $B "update snow_moves set landed=true where game_id='$G' and seq=1 returning 1;")"
check deny "een oudere zet weghalen" "$(as $A "delete from snow_moves where game_id='$G' and seq=0 returning 1;")"
check ok   "A maakt de laatste zet ongedaan" "$(as $A "delete from snow_moves where game_id='$G' and seq=1 returning 1;")"
check ok   "daarna is zet 1 weer vrij" "$(as $B "insert into snow_moves (game_id,seq,kind,player,trick_id,landed) values ('$G',1,'match','$B','ollie',true) returning 1;")"
check deny "B gooit A's potje weg" "$(as $B "delete from snow_games where id='$G' returning 1;")"
check ok   "A gooit zijn potje weg, zetten gaan mee" "$(as $A "delete from snow_games where id='$G' returning 1;")"
check deny "geen losse zetten over" "$(q "select count(*) from snow_moves where game_id='$G';")"
exit $FAILED
