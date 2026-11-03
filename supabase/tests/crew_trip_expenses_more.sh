#!/bin/bash
# Potje, meer: CHF met een vaste koers per trip, niet gelijk verdelen, en een bonnetje. Via supabase/tests/run.sh.
set -u
A=00000000-0000-0000-0000-0000000000d5; B=00000000-0000-0000-0000-0000000000d6
T1=aaaaaaaa-0000-4000-8000-0000000000d5; T2=aaaaaaaa-0000-4000-8000-0000000000d6
q() { su postgres -c "psql -d sneeuwtest -tAq -v ON_ERROR_STOP=1" <<<"$1" 2>&1 | tr '\n' ' '; }
as() { q "set role authenticated; set request.jwt.claim.sub = '$1'; $2"; }
FAILED=0
check() { local want=$1 name=$2 out=$3; local got=ok
  if echo "$out" | grep -qiE "error|denied|violates"; then got=deny; elif [ -z "$(echo "$out" | tr -d " ")" ] || echo "$out" | grep -qE "^ *0 *$"; then got=deny; fi
  if [ "$got" = "$want" ]; then echo "PASS  $name"; else echo "FAIL  $name  (verwacht $want, kreeg $got: $out)"; FAILED=1; fi; }

q "insert into auth.users (id,email) values ('$A','ad5'),('$B','bd6'); insert into profiles(user_id,display_name) values ('$A','A'),('$B','B') on conflict do nothing;" >/dev/null
CREW=$(as $A "select id from create_crew('Frankencrew');" | grep -oE '[0-9a-f-]{36}' | head -1)
CODE=$(q "select invite_code from crews where id='$CREW'" | tr -d ' ')
as $B "select join_crew('$CODE');" >/dev/null
as $A "insert into records (id,user_id,kind,data,crew_id,client_updated_at) values ('$T1','$A','trip','{}','$CREW',1),('$T2','$A','trip','{}','$CREW',1);" >/dev/null
ins() { echo "insert into crew_trip_expenses (trip_id,crew_id,kind,title,amount_cents,paid_by,split_between,currency,orig_cents,rate,weights,receipt) values ($1) returning id;"; }
both="array['$A','$B']::uuid[]"

# CHF: wat je betaalde, de koers, en het bedrag in euro dat erbij hoort
E1=$(as $A "$(ins "'$T1','$CREW','expense','Fondue',10600,'$A',$both,'CHF',10000,1.06,null,null")" | grep -oE '[0-9a-f-]{36}' | head -1)
check ok   "fondue in CHF: 100 frank tegen 1,06 is 106 euro" "$E1"
check ok   "een cent afronding mag" "$(as $B "$(ins "'$T1','$CREW','expense','Bier',1061,'$B',$both,'CHF',1001,1.06,null,null")")"
check deny "CHF-bedrag past niet bij de koers" "$(as $A "$(ins "'$T1','$CREW','expense','Pizza',5000,'$A',$both,'CHF',1000,1.06,null,null")")"
check deny "CHF zonder koers" "$(as $A "$(ins "'$T1','$CREW','expense','Pizza',1060,'$A',$both,'CHF',1000,null,null,null")")"
check deny "andere koers in dezelfde trip" "$(as $B "$(ins "'$T1','$CREW','expense','Skipas',1100,'$B',$both,'CHF',1000,1.10,null,null")")"
check ok   "andere trip, eigen koers" "$(as $B "$(ins "'$T2','$CREW','expense','Skipas',1100,'$B',$both,'CHF',1000,1.10,null,null")")"
check deny "euro-uitgave met een koers" "$(as $A "$(ins "'$T1','$CREW','expense','Pizza',1000,'$A',$both,'EUR',1000,1.06,null,null")")"
check ok   "gewone euro-uitgave werkt nog" "$(as $A "$(ins "'$T1','$CREW','expense','Pizza',1000,'$A',$both,'EUR',null,null,null,null")")"
check deny "achteraf de koers van de eerste veranderen" "$(as $B "update crew_trip_expenses set rate=1.2, amount_cents=1201, orig_cents=1001 where trip_id='$T1' and title='Bier' returning 1;")"

# niet gelijk verdelen
check ok   "A 2 delen, B 1 deel" "$(as $A "$(ins "'$T1','$CREW','expense','Huisje',30000,'$A',$both,'EUR',null,null,array[2,1]::smallint[],null")")"
check deny "delen passen niet bij het aantal mensen" "$(as $A "$(ins "'$T1','$CREW','expense','Huisje',30000,'$A',$both,'EUR',null,null,array[2]::smallint[],null")")"
check deny "nul delen" "$(as $A "$(ins "'$T1','$CREW','expense','Huisje',30000,'$A',$both,'EUR',null,null,array[0,1]::smallint[],null")")"
check deny "21 delen" "$(as $A "$(ins "'$T1','$CREW','expense','Huisje',30000,'$A',$both,'EUR',null,null,array[21,1]::smallint[],null")")"
check deny "delen bij een terugbetaling" "$(as $A "$(ins "'$T1','$CREW','transfer','Terug',1000,'$A',array['$B']::uuid[],'EUR',null,null,array[1]::smallint[],null")")"

# bonnetje: een id van je foto
check ok   "uitgave met een bonnetje" "$(as $A "$(ins "'$T1','$CREW','expense','Boodschappen',4200,'$A',$both,'EUR',null,null,null,'bbbbbbbb-0000-4000-8000-0000000000d5'")")"
check ok   "B voegt achteraf een bonnetje toe aan het eigen bier" "$(as $B "update crew_trip_expenses set receipt='bbbbbbbb-0000-4000-8000-0000000000d6' where title='Bier' returning 1;")"
check deny "A zet een bonnetje op B's bier" "$(as $A "update crew_trip_expenses set receipt='bbbbbbbb-0000-4000-8000-0000000000d5' where title='Bier' returning 1;")"
exit $FAILED
