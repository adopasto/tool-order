# Objednávky náradia

Interný „eshop" pre výrobu: výroba si nakúpi do košíka, odošle žiadanku, vedúci ju schváli,
sklad vydá. Systém drží prehľad, koľko náradia a materiálu je k dispozícii, a sám hlási,
keď je čo doobjednať.

**Žiadanky sú interné – medzi výrobou a skladom.** Objednávky u dodávateľov vystavuje iné
oddelenie; tento systém im pripraví len podklad (zoznam, CSV, e-mail).

Node.js + Express + EJS + SQLite. **Žiadny natívny modul** — databáza beží na vstavanom
`node:sqlite`, takže netreba Python ani Visual Studio Build Tools. Žiadne CDN ani externé
fonty, beží aj na firemnom PC s blokovaným internetom.

**Vyžaduje Node.js 24** (alebo 22.5–23.3 s prepínačom `--experimental-sqlite`).

---

## 1. Rýchly štart

```bash
npm install
npm run reset      # vytvorí databázu a naplní demo dáta
npm start          # http://localhost:3000
```

Testovacie kontá — heslo je vždy `meno + 123` (napr. `vyroba123`):

| Používateľ | Rola          | Čo môže                                            |
|------------|---------------|----------------------------------------------------|
| `vyroba`   | requester     | katalóg, košík, vlastné žiadanky                    |
| `majster`  | approver      | schváliť / zamietnuť žiadanky svojho strediska      |
| `sklad`    | storekeeper   | výdaj, príjem, inventúra, upozornenia               |
| `nakup`    | buyer         | prehľad zásob, zoznam na doobjednanie, export CSV   |
| `admin`    | admin         | všetko + správa položiek a signálnych zásob         |

Ďalšie príkazy:

```bash
npm run dev        # reštart pri zmene súboru (node --watch)
bash test-flow.sh  # smoke test celého toku cez curl
```

---

## 2. Ako to funguje

### Stav skladu sa neukladá, počíta sa

Zdrojom pravdy je tabuľka `stock_moves` (príjem `+`, výdaj `−`, korekcia `±`).
`items.stock_qty` je len cache, ktorú udržiava databázový trigger `stock_moves_ai`.
Dôvod: auditovateľnosť — pri každom kuse vieš kto, kedy a na akú žiadanku.

Kontrola zhody cache s pohybmi (patrí do nočnej úlohy):

```sql
SELECT i.code, i.stock_qty, COALESCE(SUM(m.qty), 0) AS skutocne
FROM items i LEFT JOIN stock_moves m ON m.item_id = i.id
GROUP BY i.id HAVING i.stock_qty <> COALESCE(SUM(m.qty), 0);
```

### Balíky nie sú skladové položky

Balík je len predpis (`bundle_items`). Pri odoslaní košíka sa rozloží na komponenty
a do `request_lines` sa uloží n riadkov s odkazom `bundle_id`. Inak by vznikli dva
paralelné sklady, ktoré si navzájom nesedia.

### Navigácia

Menu sa mení podľa role, aby nikto nepozeral na položky, ktoré nemôže použiť:

| Rola | Čo vidí v menu |
|------|----------------|
| Výroba | Katalóg · Košík · Žiadanky |
| Schvaľovateľ | Katalóg · Košík · Žiadanky (s počtom na schválenie) |
| Sklad | + Sklad · Doobjednať · Dodávatelia · Správa |
| Zásobovanie | + Sklad · Doobjednať · Dodávatelia |
| Administrátor | všetko |

Sklad je jedna stránka s piatimi záložkami – **Stav zásob, Doobjednať, Príjem, Inventúra,
Pohyby**. Na podstránkach je drobčeková navigácia, takže vždy vidno, kde človek je.
V pätičke je číslo verzie – podľa neho spoznáš, či beží aktuálny build.

### Detail produktu

Každá položka má vlastnú kartu na `/produkt/:id`, balík na `/balik/:id`. V katalógu je
klikateľná **celá dlaždica**, v zozname kód aj názov; funguje to aj z košíka, žiadanky,
skladu a zoznamu dodávateľa. Vidí ho každý prihlásený a nájde tam
fotku, popis, stav skladu s ukazovateľom signálnej zásoby, umiestnenie, dodávateľov,
v ktorých balíkoch položka je, a výdaj za posledných 90 dní vrátane mesačného priemeru –
z toho sa dá rozumne odvodiť signálna zásoba. Sklad a nákup vidia navyše posledné pohyby.

### Správa katalógu

Záložka **Správa** (admin a skladník) obsahuje:

Záložka **Správa** je rozcestník so štyrmi dlaždicami; každá vedie na vlastný zoznam:

| Sekcia | Adresa | Čo tam vieš |
|--------|--------|-------------|
| Položky | `/sprava/polozky` | založiť, upraviť, zmazať, nahrať fotku, priradiť dodávateľa |
| Balíky | `/sprava/baliky` | hlavička + pridávanie a odoberanie komponentov |
| Kategórie | `/sprava/kategorie` | názov, poradie v ľavom menu, mazanie prázdnych |
| Dodávatelia | `/sprava/dodavatelia` | kontakty, dodacia lehota, prehľad dodávaných položiek |

Novú položku založíš aj priamo z katalógu tlačidlom **+ Nová položka**, ktoré vidí
admin a skladník.

Pri zakladaní položky sa počiatočný stav zapíše ako pohyb typu `INVENTÚRA`, nie priamym
prepisom `stock_qty` – história tak sedí od prvého kusu. Stav skladu sa vo formulári
položky **nedá prepísať**; mení sa len príjmom, výdajom alebo inventúrou.

**Mazanie je bezpečné.** Ak má položka pohyby alebo je na nejakej žiadanke, nezmaže sa,
len sa deaktivuje a zmizne z katalógu – história zostane úplná. Fyzicky sa zmažú len
položky, ktoré nikdy neboli v obehu. Rovnako balíky (deaktivujú sa, ak už boli objednané)
a kategórie (nezmažú sa, kým do nich patrí položka).

### Fotky položiek

Každá položka má fotku. Ukladá sa do `data/uploads/items` **pod kódom položky**
(`NAR-001.jpg`), takže priečinok je čitateľný aj bez databázy.

Dva spôsoby naplnenia:

1. **Po jednej** – `/admin/polozky`, stĺpec *Fotka*, vyber súbor a nahraj (JPG/PNG/WEBP do 4 MB).
2. **Hromadne** – pomenuj súbory kódmi položiek, nakopíruj ich do `data/uploads/items`
   a klikni *Priradiť fotky z priečinka*. Aplikácia ich spáruje podľa názvu a vypíše,
   ktoré súbory nemali zhodu. Pri stovkách položiek je to jediná rozumná cesta.

Fotky sa nezmenšujú (žiadny natívny modul), takže pri fotení z mobilu daj rozlíšenie
okolo 1000 px – limit je 4 MB na súbor. Miniatúry sú aj v košíku, v žiadanke a v zozname
na doobjednanie, aby sklad videl, či berie správny kus.

### Signálna zásoba

Kontrola beží **v tej istej transakcii ako výdaj** (`src/services/stock.js` → `checkReorder`),
nie cronom — inak by upozornenie prišlo až ráno. Čiastočný unikátny index `ux_alert_open`
zabezpečí, že na jednu položku je naraz najviac jedno neuzavreté upozornenie, takže pri
hromadnom výdaji nepríde desať mailov. Alert sa uzavrie automaticky pri príjme, ktorý
zdvihne stav nad `reorder_point`.

Položky pod hranicou sa zbierajú na stránke **Doobjednať**, odkiaľ ich vieš poslať
e-mailom alebo stiahnuť ako CSV (bodkočiarka + BOM, otvorí sa priamo v Exceli)
a odovzdať oddeleniu nákupu. Dodávateľ je v zozname len ako referencia – systém
u neho nič neobjednáva.

Východisková hodnota je 5 ks pre všetko, ale nastavuje sa na položku (`/admin/polozky`).
Keď nazbieraš spotrebu, prepočítaj:

```
ROP = priemerná denná spotreba × dodacia lehota + poistná zásoba
```

### Pošta cez outbox

Mail sa najprv zapíše do `mail_outbox` v rámci transakcie. Keby sa odosielalo priamo
a SMTP zlyhalo, transakcia by sa vrátila a výdaj by sa stratil. Worker `startWorker()`
odošle správy až po commite, každých 15 s.

V testovacom režime (`MAIL_MODE=file`) sa maily ukladajú ako `.eml` do `data/mail/` —
otvoríš ich dvojklikom v Outlooku.

### Stavy žiadanky

```
NOVA → SCHVALENA → CAKA_NA_TOVAR ⇄ CIASTOCNE_VYDANA → VYDANA
NOVA → ZAMIETNUTA        kdekoľvek → STORNO
```

`CAKA_NA_TOVAR` sa nastaví automaticky, keď požadované množstvo prevyšuje zásobu.
Riadok sa nezruší, len čaká — sklad ho vidí vo fronte.

---

## 2b. Import podkladov

```bash
npm run import                    # spracuje všetko v priečinku import/
npm run import -- subor.xlsx      # jeden konkrétny súbor
```

Import je **idempotentný** – párovanie je podľa kódu položky a podľa čísla ponuky,
takže opakované spustenie nič nezduplikuje. Existujúcim položkám len dopĺňa chýbajúce
údaje, ručné úpravy v aplikácii neprepisuje. **Skladové množstvá import nikdy nemení** –
tie vznikajú výhradne pohybmi.

### Prehľad zásob (.xlsx)

Hľadá stĺpce podľa názvu, na poradí nezáleží:

| Stĺpec v tabuľke | Kam sa uloží |
|------------------|--------------|
| Kód | `items.code` |
| Názov | `items.name` |
| Min. zásoba | `items.reorder_point` – signálna zásoba |
| Návrh 6M zásoba | `items.reorder_qty` – koľko doobjednať |
| Cena / ks | `items.ref_price` – orientačná cena, nie cena dodávateľa |
| Spotreba 6 mes. | `items.usage_6m` – podklad na výpočet ROP |
| Poznámka | popis položky |

Kategória sa priradí podľa názvu (hrot, pero, spotrebný materiál, ručné náradie, OOPP),
príznak ESD podľa výskytu „ESD" v názve. Poznámka typu „cena za balík v ktorom je 5ks"
prepne mernú jednotku na `bal`, aby cena a množstvo sedeli.

**Riadky bez kódu** sa založia s kódom odvodeným z názvu a označia ako **neaktívne** –
do katalógu sa nedostanú, kým im niekto nedoplní kód a cenu v Správe → Položky.
Import ich na konci vypíše.

### Cenová ponuka (.json + PDF)

PDF sa strojovo neparsuje – rozloženie sa u každého dodávateľa líši a chybne prečítaná
cena je horšia než žiadna. Ponuka sa preto prepíše do krátkeho JSON súboru
(vzory `import/CP250313.json` a `CP250339.json`) a originál sa priloží:

```
import/
  CP250313.json          popis ponuky
  prilohy/CP_250313.pdf   originál, skopíruje sa do data/quotes
```

Import z toho založí dodávateľa, položky, väzbu položka ↔ dodávateľ s katalógovým
číslom a **množstevné cenové pásma**. Tie sú na karte položky ako tabuľka „od množstva →
cena", takže pri doobjednávaní hneď vidno, kde sa oplatí objednať viac. Pri rukaviciach
ARDON PROOF je rozdiel 0,52 € pri 12 pároch oproti 0,46 € pri 252 – teda 11 %.

Ponuky sú vedené len ako evidencia. Objednávku u dodávateľa vystavuje oddelenie nákupu.

---

## 3. Nasadenie na portál NEWAYS

Portál `portal.newayselectronics.ai` používa **Azure Entra ID cez App Service Easy Auth**
(`/.auth/login/aad`). Vlastné prihlasovanie teda netreba — za proxy prichádza hlavička
s prihláseným používateľom.

```bash
TRUST_HEADER_AUTH=1
HEADER_AUTH_NAME=x-ms-client-principal-name
BASE_PATH=/naradie                                   # ak beží pod podadresárom
FRAME_ANCESTOR=https://portal.newayselectronics.ai   # ak sa vkladá do iframe
SESSION_SECRET=<náhodný reťazec>
MAIL_MODE=smtp
MAIL_ALERTS=sklad@newayselectronics.com,zasobovanie@newayselectronics.com
UPLOAD_DIR=D:\\data\\naradie\\fotky
PORT=3000
```

Podmienka: konto musí existovať v tabuľke `users`, pričom `username` alebo `email`
sa musí zhodovať s UPN z Entra ID. **Rolu prideľuješ ty** — Entra ju neposiela.
Ak chceš role z Entra skupín, rozšír `headerAuth()` o dekódovanie hlavičky
`X-MS-CLIENT-PRINCIPAL` (base64 JSON s claims).

Bez Easy Auth (napr. vlastný VM za Caddy/nginx) nechaj `TRUST_HEADER_AUTH=0`
a použije sa vstavané prihlasovanie.

---

## 4. Prechod na PostgreSQL

SQLite je tu kvôli tomu, aby si to rozbehol na notebooku bez inštalácie servera.
Pri desiatkach súčasných používateľov to stále stačí (WAL režim), ale ak to má bežať
vedľa `cal-esd-db` na spoločnom PG, zmeny sú malé:

| SQLite                                   | PostgreSQL                                        |
|------------------------------------------|---------------------------------------------------|
| `INTEGER PRIMARY KEY AUTOINCREMENT`      | `SERIAL` / `GENERATED ALWAYS AS IDENTITY`         |
| `REAL`                                   | `NUMERIC(12,3)`                                   |
| `TEXT` s `datetime('now','localtime')`   | `TIMESTAMPTZ DEFAULT now()`                       |
| trigger v SQL                            | `plpgsql` funkcia + `CREATE TRIGGER`              |
| implicitná serializácia zápisov          | `SELECT … FOR UPDATE` v `vydaj()`                 |
| `node:sqlite` (synchrónne)               | `pg` / `pg-promise` (async — treba `await`)       |

Miesta, kde treba zásah, sú v kóde označené komentárom.

---

## 4b. Riešenie problémov

**`npm ERR! gyp ERR! find Python` / `prebuild-install warn install No prebuilt binaries found`**
Toto sa stávalo pri pôvodnej verzii s `better-sqlite3` na Node 24. Aktuálna verzia
natívny modul nepoužíva. Ak ti to vypíše, máš staré `node_modules`:

```bash
rmdir /s /q node_modules
del package-lock.json
npm install
```

**`Modul node:sqlite nie je dostupný`**
Máš Node starší ako 23.4. Buď nainštaluj Node 24, alebo spúšťaj s prepínačom:

```bash
node --experimental-sqlite server.js
```

**`EPERM: operation not permitted, rmdir`** pri `npm install`
Priečinok drží iný proces — najčastejšie bežiaci `node.exe` alebo antivírus.
Zavri server (`Ctrl+C`), prípadne `taskkill /f /im node.exe`, a zopakuj inštaláciu.
Pomôže aj presunúť projekt z `Downloads` inam, napr. `C:\Projekty\naradie`.

**Port 3000 je obsadený**

```bash
set PORT=3100 && npm start
```

---

## 5. Štruktúra

```
server.js                 vstupný bod, session, hlavičky, mount routerov
src/
  config.js               všetko cez premenné prostredia
  db.js                   pripojenie + migrácia + obal transakcií nad node:sqlite
  schema.sql              DDL vrátane triggera a čiastočného indexu
  seed.js                 demo dáta (23 položiek, 3 balíky, 5 dodávateľov)
  reset.js                zmaže DB a naplní odznova
  middleware/auth.js      Easy Auth hlavička, prihlásenie, kontrola rolí
  services/
    stock.js              výdaj, príjem, korekcia, checkReorder
    requests.js           číslovanie dokladov, odoslanie košíka, prepočet stavu
    alerts.js             zoznam na doobjednanie, denný súhrn, CSV
    photos.js             nahrávanie fotiek a hromadné párovanie podľa kódu
  import/index.js         import prehľadov (.xlsx) a cenových ponúk (.json)
    mailer.js             transactional outbox + worker
    auth-hash.js          scrypt z node:crypto
  routes/
    auth.js               prihlásenie / odhlásenie
    shop.js               katalóg + košík
    products.js           karty produktu a balíka
    admin.js              správa sortimentu pod /sprava
    requests.js           žiadanky, schvaľovanie, výdaj
    warehouse.js          sklad, dodávatelia, doobjednanie, položky a fotky
views/                    EJS šablóny
public/css/app.css        celý štýl v jednom súbore
import/                   zdrojové podklady na import (xlsx, json, prilohy/)
data/
  naradie.db              databáza
  quotes/                 priložené PDF cenových ponúk
  uploads/items/          fotky položiek, názov = kód položky
  mail/                   vygenerované .eml v testovacom režime
```

---

## 6. Čo doplniť ako ďalšie

1. **Zmenšovanie fotiek pri nahratí** — dnes sa ukladá originál. Bez natívneho modulu
   to ide cez `<canvas>` v prehliadači ešte pred odoslaním.
2. **Inventúrny režim na tablete** — načítať regál, odklikať skutočný stav.
3. **Čiarové kódy** — kód položky do Code128, výdaj skenerom namiesto klikania.
4. **Prepojenie na `cal-esd-db`** — položky ako momentový skrutkovač či posuvné meradlo
   podliehajú kalibrácii; stačí do `items` doplniť `cal_device_id` a odkazovať sa.
5. **Export žiadanky do PDF** pre podpis pri výdaji, ak to bude auditor chcieť.

---

Demo kontakty dodávateľov sú fiktívne (`@example.com`). Pred ostrým nasadením prepíš
`src/seed.js` alebo naplň tabuľky vlastnými dátami.
