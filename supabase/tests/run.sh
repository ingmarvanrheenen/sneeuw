#!/bin/bash
# Draait alle database-tests tegen een lokale Postgres 16 (als gebruiker postgres).
# Stub voor Supabase (auth.users, auth.uid(), rollen, storage) staat in stub.sql.
set -eu
DIR=$(cd "$(dirname "$0")" && pwd)
MIG="$DIR/../migrations"
psqlp() { su postgres -c "psql -q -v ON_ERROR_STOP=1 -d sneeuwtest"; }
su postgres -c "dropdb --if-exists sneeuwtest && createdb sneeuwtest"
psqlp < "$DIR/stub.sql"
for f in "$MIG"/*.sql; do echo "migratie: $(basename "$f")"; psqlp < "$f"; done
status=0
for t in "$DIR"/*.sh; do
  [ "$(basename "$t")" = run.sh ] && continue
  echo "== $(basename "$t")"
  bash "$t" || status=1
done
exit $status
