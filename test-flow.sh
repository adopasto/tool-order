#!/bin/bash
# Rychly smoke test celeho toku: ziadanka -> schvalenie -> vydaj -> upozornenie.
set -e
cd "$(dirname "$0")"
H=http://127.0.0.1:${PORT:-3000}
cd /tmp && rm -f cv.txt cm.txt cs.txt cn.txt

echo "--- 1. vyroba: prihlasenie a kosik"
curl -s -c cv.txt -o /dev/null -w "   login vyroba: %{http_code}\n" -X POST $H/prihlasenie -d "username=vyroba&password=vyroba123"
echo "   kariet v katalogu: $(curl -s -b cv.txt $H/katalog | grep -c 'class="card')"
curl -s -b cv.txt -c cv.txt -o /dev/null -X POST $H/kosik/pridat -d "kind=item&id=8&qty=3"
curl -s -b cv.txt -c cv.txt -o /dev/null -X POST $H/kosik/pridat -d "kind=bundle&id=1&qty=2"
echo "   v kosiku: $(curl -s -b cv.txt $H/kosik | grep -o 'BAL-001\|SPA-003' | sort -u | tr '\n' ' ')"
RED=$(curl -s -b cv.txt -c cv.txt -o /dev/null -w "%{redirect_url}" -X POST $H/kosik/odoslat -d "note=test+z+linky")
ZID=$(basename "$RED"); echo "   ziadanka id: $ZID"

echo "--- 2. majster: schvalenie"
curl -s -c cm.txt -o /dev/null -X POST $H/prihlasenie -d "username=majster&password=majster123"
curl -s -b cm.txt -c cm.txt -o /dev/null -w "   schvalit: %{http_code}\n" -X POST $H/ziadanky/$ZID/schvalit
curl -s -b cm.txt $H/ziadanky/$ZID | grep -o 'stav [A-Z_]*' | head -1

echo "--- 3. sklad: vydaj"
curl -s -c cs.txt -o /dev/null -X POST $H/prihlasenie -d "username=sklad&password=sklad123"
FORM=$(curl -s -b cs.txt $H/ziadanky/$ZID | grep -o 'name="qty_[0-9]*" value="[0-9.]*"' \
       | sed 's/name="//; s/" value="/=/; s/"//' | tr '\n' '&')
echo "   vydaj: $FORM"
curl -s -b cs.txt -c cs.txt -o /dev/null -w "   vydat: %{http_code}\n" -X POST $H/ziadanky/$ZID/vydat -d "$FORM"
curl -s -b cs.txt $H/ziadanky/$ZID | grep -o 'class="stav [A-Z_]*' | head -1

echo "--- 4. zasobovanie: co treba doobjednat"
curl -s -c cn.txt -o /dev/null -X POST $H/prihlasenie -d "username=nakup&password=nakup123"
echo "   polozky: $(curl -s -b cn.txt "$H/sklad/doobjednat/export.csv" | tail -n +2 | cut -d';' -f1 | tr -d '"' | tr '\n' ' ')" 
echo "--- 5. vygenerovana posta"
ls -1 /home/claude/naradie/data/mail 2>/dev/null | tail -5
