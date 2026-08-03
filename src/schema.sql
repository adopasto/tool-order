-- Schema objednavkoveho systemu naradia.
-- SQLite kvoli lokalnemu behu; nazvy a typy su drzane blizko PostgreSQL,
-- aby migracia na PG bola len o zamene INTEGER PRIMARY KEY AUTOINCREMENT -> SERIAL
-- a triggeru na plpgsql funkciu.

CREATE TABLE IF NOT EXISTS users (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  username    TEXT UNIQUE NOT NULL,
  full_name   TEXT NOT NULL,
  email       TEXT,
  role        TEXT NOT NULL CHECK (role IN ('requester','approver','storekeeper','buyer','admin')),
  cost_center TEXT,                      -- stredisko / linka
  pass_hash   TEXT NOT NULL,
  active      INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS categories (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_id  INTEGER REFERENCES categories(id),
  name       TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS items (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  code          TEXT UNIQUE NOT NULL,     -- interny kod polozky
  name          TEXT NOT NULL,
  description   TEXT,
  category_id   INTEGER REFERENCES categories(id),
  unit          TEXT NOT NULL DEFAULT 'ks',
  stock_qty     REAL NOT NULL DEFAULT 0,  -- CACHE, zdroj pravdy je stock_moves
  reorder_point REAL NOT NULL DEFAULT 5,  -- signalna zasoba
  reorder_qty   REAL,                     -- odporucane objednavacie mnozstvo
  location      TEXT,                     -- regal / box
  is_esd        INTEGER NOT NULL DEFAULT 0,
  image_path    TEXT,
  active        INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS ix_items_cat ON items(category_id);

CREATE TABLE IF NOT EXISTS bundles (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  code        TEXT UNIQUE,
  name        TEXT NOT NULL,
  description TEXT,
  category_id INTEGER REFERENCES categories(id),
  active      INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS bundle_items (
  bundle_id INTEGER NOT NULL REFERENCES bundles(id) ON DELETE CASCADE,
  item_id   INTEGER NOT NULL REFERENCES items(id),
  qty       REAL NOT NULL,
  PRIMARY KEY (bundle_id, item_id)
);

CREATE TABLE IF NOT EXISTS suppliers (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name           TEXT NOT NULL,
  ico            TEXT,
  dic            TEXT,
  contact_person TEXT,
  email          TEXT,
  phone          TEXT,
  web            TEXT,
  address        TEXT,
  lead_time_days INTEGER NOT NULL DEFAULT 7,
  note           TEXT,
  active         INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS supplier_items (
  supplier_id   INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  item_id       INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  supplier_sku  TEXT,                    -- kat. cislo dodavatela
  price         REAL,
  currency      TEXT NOT NULL DEFAULT 'EUR',
  min_order_qty REAL NOT NULL DEFAULT 1,
  is_primary    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (supplier_id, item_id)
);

CREATE TABLE IF NOT EXISTS requests (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  number       TEXT UNIQUE NOT NULL,      -- ZN-2026-0042
  requester_id INTEGER NOT NULL REFERENCES users(id),
  cost_center  TEXT,
  status       TEXT NOT NULL DEFAULT 'NOVA'
               CHECK (status IN ('NOVA','SCHVALENA','CAKA_NA_TOVAR','CIASTOCNE_VYDANA',
                                 'VYDANA','ZAMIETNUTA','STORNO')),
  note         TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  approved_by  INTEGER REFERENCES users(id),
  approved_at  TEXT,
  reject_note  TEXT
);
CREATE INDEX IF NOT EXISTS ix_req_status ON requests(status);

CREATE TABLE IF NOT EXISTS request_lines (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id    INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  item_id       INTEGER NOT NULL REFERENCES items(id),
  bundle_id     INTEGER REFERENCES bundles(id),   -- z ktoreho balika riadok vznikol
  qty_requested REAL NOT NULL,
  qty_issued    REAL NOT NULL DEFAULT 0,
  line_status   TEXT NOT NULL DEFAULT 'NOVA'
                CHECK (line_status IN ('NOVA','CIASTOCNE','VYDANA','STORNO'))
);
CREATE INDEX IF NOT EXISTS ix_rl_req ON request_lines(request_id);

-- Jediny zdroj pravdy o sklade. items.stock_qty je len cache.
CREATE TABLE IF NOT EXISTS stock_moves (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id         INTEGER NOT NULL REFERENCES items(id),
  move_type       TEXT NOT NULL CHECK (move_type IN ('PRIJEM','VYDAJ','KOREKCIA','INVENTURA')),
  qty             REAL NOT NULL,          -- + prijem, - vydaj
  request_line_id INTEGER REFERENCES request_lines(id),
  supplier_id     INTEGER REFERENCES suppliers(id),
  user_id         INTEGER REFERENCES users(id),
  note            TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS ix_moves_item ON stock_moves(item_id, id);

-- Cache sa aktualizuje triggerom, nie v aplikacii - nedaju sa tak obist pohyby.
CREATE TRIGGER IF NOT EXISTS stock_moves_ai AFTER INSERT ON stock_moves
BEGIN
  UPDATE items SET stock_qty = stock_qty + NEW.qty WHERE id = NEW.item_id;
END;

CREATE TABLE IF NOT EXISTS stock_alerts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id       INTEGER NOT NULL REFERENCES items(id),
  qty_at_alert  REAL,
  status        TEXT NOT NULL DEFAULT 'OTVORENE'
                CHECK (status IN ('OTVORENE','VYRIESENE')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  resolved_at   TEXT
);
-- Ciastocny unikatny index: na polozku moze byt naraz len jedno neuzavrete upozornenie.
CREATE UNIQUE INDEX IF NOT EXISTS ux_alert_open
  ON stock_alerts(item_id) WHERE status <> 'VYRIESENE';

CREATE TABLE IF NOT EXISTS doc_counters (
  doc_type TEXT NOT NULL,
  year     INTEGER NOT NULL,
  last_no  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (doc_type, year)
);

-- Transactional outbox: posta sa najprv zapise, odosle ju az worker po commite.
CREATE TABLE IF NOT EXISTS mail_outbox (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  to_addr    TEXT NOT NULL,
  subject    TEXT NOT NULL,
  body_html  TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'NOVA' CHECK (status IN ('NOVA','ODOSLANA','CHYBA')),
  attempts   INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  sent_at    TEXT
);

-- ---------------------------------------------------------------------------
-- Cenové ponuky dodávateľov (evidencia dokladov, nie objednávanie).
-- Systém u dodávateľa nič neobjednáva - ponuky slúžia ako podklad pre nákup
-- a ako zdroj množstevných cenových pásiem.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS quotes (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  number       TEXT NOT NULL,                 -- CP250313
  supplier_id  INTEGER REFERENCES suppliers(id),
  issued_at    TEXT,                          -- dátum vystavenia (RRRR-MM-DD)
  valid_until  TEXT,                          -- platnosť do
  total_no_vat REAL,
  total_vat    REAL,
  currency     TEXT NOT NULL DEFAULT 'EUR',
  file_path    TEXT,                          -- názov súboru v data/quotes
  note         TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_quote_no ON quotes(supplier_id, number);

-- Riadok ponuky. Jedna položka môže mať viac riadkov - množstevné pásma.
CREATE TABLE IF NOT EXISTS quote_lines (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  quote_id     INTEGER NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  item_id      INTEGER REFERENCES items(id),
  supplier_sku TEXT,
  description  TEXT,
  min_qty      REAL NOT NULL DEFAULT 1,       -- od akého množstva cena platí
  unit         TEXT,
  unit_price   REAL,
  note         TEXT
);
CREATE INDEX IF NOT EXISTS ix_ql_item ON quote_lines(item_id, min_qty);
