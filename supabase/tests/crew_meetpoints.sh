#!/bin/bash
# RLS-test voor het verzamelpunt van de crew (crew_meetpoints). Draait via supabase/tests/run.sh.
set -u
A=00000000-0000-0000-0000-0000000000da; B=00000000-0000-0000-0000-0000000000db; C=00000000-0000-0000-0000-0000000000dd
q() { su postgres -c "psql -d sneeuwtest -tAq -v ON_ERROR_STOP=1" <<<"$1" 2>&1 | tr '\n' ' '; }
as() { q "set role authenticated; set request.jwt.claim.sub = '$1'; $2"; }
FAILED=0
check() { local want=$1 name=$2 out=$3; local got=ok
  if echo "$out" | grep -qiE "error|denied|violates"; then got=deny; elif [ -z "$(echo "$out" | tr -d " ")" ] || echo "$out" | grep -qE "^ *0 *$"; then got=deny; fi
  if [ "$got" = "$want" ]; then echo "PASS  $name"; else echo "FAIL  $name  (verwacht $want, kreeg $got: $out)"; FAILED=1; fi; }

q "insert into auth.users (id,email) values ('$A','ada'),('$B','bdb'),('$C','cdd'); insert into profiles(user_id,display_name) values ('$A','A'),('$B','B'),('$C','C') on conflict do nothing;" >/dev/null
CREW=$(as $A "select id from create_crew('Verzamelcrew');" | grep -oE '[0-9a-f-]{36}' | head -1)
CODE=$(q "select invite_code from crews where id='$CREW'" | tr -d ' ')
as $B "select join_crew('$CODE');" >/dev/null
OTHER=$(as $C "select id from create_crew('Losse crew');" | grep -oE '[0-9a-f-]{36}' | head -1)
up() { echo "insert into crew_meetpoints (crew_id,lat,lon,label) values ('$1',$2,$3,'$4') on conflict (crew_id) do update set lat=excluded.lat, lon=excluded.lon, label=excluded.label, set_by=auth.uid() returning 1;"; }

check ok   "A zet een pin bij de lunch" "$(as $A "$(up $CREW 45.45 6.98 Lunch)")"
check ok   "B ziet de pin" "$(as $B "select count(*) from crew_meetpoints where crew_id='$CREW';")"
check ok   "B verplaatst hem naar de lift" "$(as $B "$(up $CREW 45.46 6.99 'Bovenaan de lift')")"
check ok   "de pin staat nu op naam van B" "$(as $A "select count(*) from crew_meetpoints where set_by='$B';")"
check deny "B zet hem op naam van A" "$(as $B "update crew_meetpoints set set_by='$A' where crew_id='$CREW' returning 1;")"
check deny "C (andere crew) ziet hem niet" "$(as $C "select count(*) from crew_meetpoints where crew_id='$CREW';")"
check deny "C zet een pin in een vreemde crew" "$(as $C "$(up $CREW 1 1 Hack)")"
check deny "C haalt hem weg" "$(as $C "delete from crew_meetpoints where crew_id='$CREW' returning 1;")"
check deny "leeg label" "$(as $A "$(up $CREW 1 1 '  ')")"
check deny "breedte buiten de wereld" "$(as $A "$(up $CREW 95 6.98 Lunch)")"
check ok   "C zet een pin in de eigen crew" "$(as $C "$(up $OTHER 46.0 7.0 Huisje)")"
check ok   "A haalt de pin weg" "$(as $A "delete from crew_meetpoints where crew_id='$CREW' returning 1;")"
exit $FAILED
