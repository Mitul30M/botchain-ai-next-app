#!/bin/zsh
H=botchain-ai-next-app-production.up.railway.app
echo "=== static assets referenced by the deployed HTML ==="
rg -o '/_next/static/[^"]+\.(css|js)' /tmp/f.html | sort -u > /tmp/assets.txt
echo "  found: $(wc -l < /tmp/assets.txt | tr -d ' ')"
fail=0
while read -r a; do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 30 "https://$H$a")
  [ "$code" = "200" ] || { echo "  FAIL $code $a"; fail=1; }
done < /tmp/assets.txt
[ "$fail" = 0 ] && echo "  all 200 OK"
echo
echo "=== CSS size + chart tokens (proves .next/static was copied) ==="
css=$(rg -o '/_next/static/[^"]+\.css' /tmp/f.html | head -1)
out=$(curl -s --max-time 30 "https://$H$css")
printf '  %s bytes  chart-1 x%s  %s\n' "$(printf '%s' "$out" | wc -c | tr -d ' ')" \
  "$(printf '%s' "$out" | grep -c 'chart-1')" "$css"
echo
echo "=== backend (must be un-paused for chat to work) ==="
curl -s -D /tmp/be.h -o /tmp/be.txt --max-time 30 https://botchain-ai-production.up.railway.app/health
printf '  GET /health -> %s\n' "$(head -1 /tmp/be.h | tr -d '\r' | awk '{print $2}')"
echo "  x-railway-fallback: $(grep -i 'x-railway-fallback' /tmp/be.h | tr -d '\r' || echo 'absent (good)')"
head -c 200 /tmp/be.txt; echo
