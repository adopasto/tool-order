# Objednávky náradia

Interný „eshop" pre výrobu: výroba si nakúpi do košíka, odošle žiadanku, vedúci ju schváli,
sklad vydá. Systém drží prehľad, koľko náradia a materiálu je k dispozícii, a sám hlási,
keď je čo doobjednať.

**Žiadanky sú interné – medzi výrobou a skladom.** Objednávky u dodávateľov vystavuje iné
oddelenie; tento systém im pripraví len podklad (zoznam, CSV, e-mail).

Backend: **FastAPI** (Python), databáza SQLite cez stdlib `sqlite3` (žiadny natívny modul,
žiadny ORM). Frontend: **Next.js** (App Router, TypeScript) — server-rendered stránky +
Server Actions pre formuláre. Rovnaký vzhľad a správanie ako pôvodná verzia (Express + EJS),
len na modernejšom stacku.

---

## 1. Rýchly štart

### Backend (FastAPI)

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate            # Windows (na Linux/Mac: source .venv/bin/activate)
pip install -r requirements.txt
python -m uvicorn app.main:app --reload --port 8000
```

Pri prvom spustení sa databáza (`data/naradie.db`) vytvorí a naplní demo dátami automaticky.

```bash
python -m app.reset      # zmaže DB a naplní odznova
python -m import_data.index   # import prehľadov (.xlsx) a cenových ponúk (.json) z priečinka import/
```

### Frontend (Next.js)

```bash
cd frontend
cp .env.local.example .env.local   # vyplň AUTH_SECRET (openssl rand -base64 32)
npm install
npm run dev -- --port 3000
```

Otvor `http://localhost:3000` — automaticky presmeruje na katalóg / prihlásenie.

### Prihlásenie

Prihlasovanie rieši výhradne Next.js (**Auth.js**) — FastAPI heslo nikdy neriešilo a
nerieši ani teraz, len dohľadá prihláseného používateľa podľa e-mailu v tabuľke `users`.

- **Lokálne** (`AUTH_MODE` nenastavené v `.env.local`) — na `/prihlasenie` je len pole na
  e-mail, žiadne heslo ("dev-login"). Skús napr. `vyroba@example.com`:

  | E-mail                  | Rola          | Čo môže                                          |
  |--------------------------|---------------|---------------------------------------------------|
  | `vyroba@example.com`     | requester     | katalóg, košík, vlastné žiadanky                   |
  | `majster@example.com`    | approver      | schváliť / zamietnuť žiadanky svojho strediska     |
  | `sklad@example.com`      | storekeeper   | výdaj, príjem, inventúra, upozornenia              |
  | `nakup@example.com`      | buyer         | prehľad zásob, zoznam na doobjednanie, export CSV  |
  | `admin@example.com`      | admin         | všetko + správa položiek a signálnych zásob        |

- **Produkcia** — nastav `AUTH_MODE=entra` a v Azure vytvor App Registration:
  - `AZURE_AD_CLIENT_ID`, `AZURE_AD_CLIENT_SECRET`, `AZURE_AD_TENANT_ID`
  - Redirect URI: `{origin}/api/auth/callback/microsoft-entra-id`
  - Povolené domény (pevne v `frontend/auth.ts`): `newayselectronics.com`,
    `newayselectronics.ai` — iný e-mail sa neprihlási.
  - Konto musí existovať v `users` (rolu/stredisko prideľuje admin, Entra ju neposiela).

---

## 2. Ako to funguje

(funkčne totožné s pôvodnou Node/Express verziou — len prepísané na FastAPI + Next.js)

### Stav skladu sa neukladá, počíta sa

Zdrojom pravdy je tabuľka `stock_moves` (príjem `+`, výdaj `−`, korekcia `±`).
`items.stock_qty` je len cache, ktorú udržiava databázový trigger `stock_moves_ai`.
Dôvod: auditovateľnosť — pri každom kuse vieš kto, kedy a na akú žiadanku.

### Balíky nie sú skladové položky

Balík je len predpis (`bundle_items`). Pri odoslaní košíka sa rozloží na komponenty
a do `request_lines` sa uloží n riadkov s odkazom `bundle_id`.

### Identita naprieč Next.js ↔ FastAPI

Next.js (Auth.js) je jediný vlastník identity. Každý request na FastAPI — priamy
(Server Component/Action, `lib/api.ts`) aj cez `/api/[...path]` proxy — dostane hlavičku
`X-Neways-User` s e-mailom z Auth.js session; hodnotu poslanú priamo klientom Next.js
vždy najprv zahodí a znovu vytvorí zo session na serveri, takže sa nedá sfalšovať.
FastAPI podľa e-mailu len dohľadá rolu/stredisko v `users` (`backend/app/deps.py`) —
heslo nikde v appke neexistuje.

Session cookie (Starlette `SessionMiddleware`) na strane FastAPI ostáva, ale už len pre
košík a flash správu — nie pre identitu. Formuláre bežia ako Next.js **Server Actions**,
ktoré po zavolaní API urobia `redirect()` presne tak, ako predtým `res.redirect()` po
`req.session.flash = ...`. Fotky a PDF prílohy idú cez `/api/[...path]` reverse-proxy
route (Next.js), aby `X-Neways-User` fungoval aj pre `<img>` tagy.

### Signálna zásoba, pošta, žiadanky

Kontrola signálnej zásoby beží v tej istej transakcii ako výdaj/príjem
(`backend/app/services/stock.py`), pošta ide cez transactional outbox
(`mail_outbox` + asyncio worker, `backend/app/services/mailer.py`), stavy žiadanky:

```
NOVA → SCHVALENA → CAKA_NA_TOVAR ⇄ CIASTOCNE_VYDANA → VYDANA
NOVA → ZAMIETNUTA        kdekoľvek → STORNO
```

E-mail sa odošle pri: novej žiadanke (schvaľovateľom strediska), schválení (skladu),
zamietnutí (žiadateľovi), (čiastočnom) výdaji (žiadateľovi, čo si môže vyzdvihnúť),
stornovaní (schvaľovateľovi strediska + skladu) a poklese na signálnu zásobu (`MAIL_ALERTS`).

**Odosielanie:** `MAIL_MODE=file` (default, lokálny vývoj) zapisuje `.eml` do `data/mail/`
— otvoríš dvojklikom v Outlooku, nikam sa nič neodosiela. `MAIL_MODE=smtp` odosiela reálne
cez `smtplib` (stdlib, žiadna závislosť navyše):

```bash
MAIL_MODE=smtp
SMTP_HOST=smtp.example.com
SMTP_PORT=587            # 465 + SMTP_USE_SSL=1 pre implicitné TLS
SMTP_USER=...
SMTP_PASSWORD=...
MAIL_FROM=naradie@newayselectronics.com
```

### Import podkladov

```bash
cd backend
python -m import_data.index                    # spracuje všetko v priečinku import/
python -m import_data.index ../import/subor.xlsx   # jeden konkrétny súbor
```

Import je idempotentný (párovanie podľa kódu položky / čísla ponuky), skladové množstvá
nikdy nemení — pozri komentáre v `backend/import_data/index.py`.

---

## 3. Nasadenie

Produkcia: `uvicorn` (backend) a `next start` (frontend, po `next build`), FastAPI
dostupné len z Next.js servera (nie priamo z internetu — inak by si ktokoľvek vedel
sfalšovať `X-Neways-User` a vydávať sa za iného používateľa). `FRONTEND_ORIGIN`
(backend, CORS) a `BACKEND_URL` (frontend) nastav podľa skutočných adries. Entra
premenné a `AUTH_SECRET` — pozri `frontend/.env.local.example`.

---

## 4. Štruktúra

```
backend/
  app/
    main.py                 FastAPI app, session middleware, bezpečnostné hlavičky, routery
    config.py                ENV-driven nastavenia
    db.py                    obal nad stdlib sqlite3 (transakcie, migrácia)
    schema.sql                DDL vrátane triggera a čiastočného indexu
    seed.py, reset.py         demo dáta / reset databázy
    deps.py                   auth závislosti (require_login, require_role - podľa X-Neways-User)
    errors.py                 AppError -> HTTP 400
    services/                 stock, requests, alerts, photos, mailer
    routers/                  auth, shop, products, requests, warehouse, admin
  import_data/index.py        import xlsx prehľadov a JSON cenových ponúk
  requirements.txt

frontend/
  auth.ts                      Auth.js v5 - Entra ID / dev e-mail bypass
  app/                        Next.js App Router stránky (rovnaké slovenské URL ako predtým)
    api/[...path]/route.ts    reverse-proxy na FastAPI (fotky, PDF, klientský kontext, X-Neways-User)
    api/auth/[...nextauth]/    Auth.js route handler
    api/logout/route.ts        odhlásenie (FastAPI kosik/flash + Auth.js signOut)
  components/                 AppChrome (topbar), Mini, Tag, BinLabel, Breadcrumbs, formuláre
  lib/
    api.ts                    apiRead/apiAction - cookie + X-Neways-User forwarding do FastAPI
    actions.ts                 Server Actions pre formuláre (mimo prihlásenia/odhlásenia)
    kontext.ts                 dedup'ovaný fetch usera/počítadiel pre topbar
  app/globals.css              pôvodný vizuálny štýl (app.css), beze zmeny

import/                       zdrojové podklady na import (xlsx, json, prilohy/)
data/
  naradie.db                  databáza (SQLite)
  quotes/                     priložené PDF cenových ponúk
  uploads/items/               fotky položiek, názov = kód položky
  mail/                        vygenerované .eml v testovacom režime (MAIL_MODE=file)
```

---

Demo kontakty dodávateľov aj používateľov sú fiktívne (`@example.com`). Pred ostrým
nasadením s `AUTH_MODE=entra` musí `users.email` sedieť s reálnym firemným Entra
kontom (`@newayselectronics.com`/`.ai`) — bez zhody sa používateľ neprihlási, aj keď
je v Entra platný. Prepíš `backend/app/seed.py` alebo naplň tabuľky vlastnými dátami.
