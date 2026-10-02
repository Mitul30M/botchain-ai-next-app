#!/bin/zsh
# Proves the Neon host in DATABASE_URL is reachable. Prints no credentials.
# Strips the query string: the Neon URL carries `uselibpqcompat`, which libpq
# (and therefore psql) rejects as an unknown URI parameter.
set -u
url=$(grep '^DATABASE_URL=' .env.local | cut -d= -f2- | tr -d '"' | tr -d "'")
host=$(printf '%s' "$url" | sed -E 's|.*@([^/:?]+).*|\1|')
clean=$(printf '%s' "$url" | sed -E 's|\?.*$||')
echo "  target host: $host"
echo "  (stripped query params for psql; the app uses the full URL)"
echo
psql "$clean" -v ON_ERROR_STOP=1 -t -c \
  "select 'connect=ok' as r, current_database() as db, (select count(*) from users) as users, (select count(*) from chats) as chats;" \
  2>&1 | sed 's/^/  /'
echo
echo "  -- same test against the unpooled host (DIRECT_URL) for comparison --"
durl=$(grep '^DIRECT_URL=' .env.local | cut -d= -f2- | tr -d '"' | tr -d "'")
dclean=$(printf '%s' "$durl" | sed -E 's|\?.*$||')
dhost=$(printf '%s' "$durl" | sed -E 's|.*@([^/:?]+).*|\1|')
echo "  target host: $dhost"
psql "$dclean" -v ON_ERROR_STOP=1 -t -c \
  "select 'connect=ok' as r, current_database() as db;" \
  2>&1 | sed 's/^/  /'
