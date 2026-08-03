'use strict';
/**
 * Databázová vrstva nad vstavaným modulom node:sqlite.
 *
 * Zámerne bez better-sqlite3: ten je natívny modul a na Node 24 pre Windows
 * ešte nemá predkompilované binárky, takže by si musel inštalovať Python
 * a Visual Studio Build Tools. node:sqlite je súčasťou Node.js od v22.5
 * (bez prepínača od v23.4), takže netreba nič kompilovať.
 *
 * Vrstva napodobňuje rozhranie better-sqlite3 (prepare/get/all/run a
 * db.transaction), aby zvyšok kódu ostal nezmenený a prípadný prechod
 * na iný ovládač bol len o tomto súbore.
 */
const fs = require('fs');
const path = require('path');
const cfg = require('./config');

let DatabaseSync;
try {
  ({ DatabaseSync } = require('node:sqlite'));
} catch (e) {
  console.error(`
Modul node:sqlite nie je dostupný. Potrebuješ Node.js 24 (odporúčané)
alebo Node 22.5-23.3 spustený s prepínačom --experimental-sqlite.
Aktuálna verzia: ${process.version}
Stiahni LTS z https://nodejs.org
`);
  process.exit(1);
}

fs.mkdirSync(path.dirname(cfg.dbPath), { recursive: true });

const raw = new DatabaseSync(cfg.dbPath);
raw.exec('PRAGMA journal_mode = WAL');      // paralelné čítanie počas zápisu
raw.exec('PRAGMA foreign_keys = ON');
raw.exec('PRAGMA busy_timeout = 5000');

/**
 * Pripravený príkaz s rozhraním better-sqlite3.
 * Kompilácia SQL je odložená na prvé použitie - moduly tak môžu pripravovať
 * príkazy na úrovni súboru ešte pred tým, než migrácia vytvorí tabuľky.
 */
function prepare(sql) {
  let st = null;
  const stmt = () => (st ??= raw.prepare(sql));
  return {
    get: (...a) => stmt().get(...a),
    all: (...a) => stmt().all(...a),
    run: (...a) => {
      const r = stmt().run(...a);
      return { changes: Number(r.changes), lastInsertRowid: Number(r.lastInsertRowid) };
    },
  };
}

/**
 * Obal transakcie. node:sqlite nemá db.transaction(), takže BEGIN/COMMIT
 * riadime sami. Vnorené volanie použije SAVEPOINT, aby vnútorná chyba
 * nezrušila celú vonkajšiu transakciu.
 */
let hlbka = 0;
function transaction(fn) {
  return function (...args) {
    const sp = hlbka > 0 ? `sp${hlbka}` : null;
    raw.exec(sp ? `SAVEPOINT ${sp}` : 'BEGIN');
    hlbka++;
    try {
      const vysledok = fn.apply(this, args);
      hlbka--;
      raw.exec(sp ? `RELEASE ${sp}` : 'COMMIT');
      return vysledok;
    } catch (e) {
      hlbka--;
      raw.exec(sp ? `ROLLBACK TO ${sp}; RELEASE ${sp}` : 'ROLLBACK');
      throw e;
    }
  };
}

const db = {
  prepare,
  transaction,
  exec: (sql) => raw.exec(sql),
  close: () => raw.close(),
  raw,
};

/** ALTER TABLE ... ADD COLUMN sa v SQLite nedá podmieniť, preto kontrola cez PRAGMA. */
function pridajStlpec(tabulka, stlpec, definicia) {
  const stlpce = raw.prepare(`PRAGMA table_info(${tabulka})`).all();
  if (!stlpce.some(c => c.name === stlpec))
    raw.exec(`ALTER TABLE ${tabulka} ADD COLUMN ${stlpec} ${definicia}`);
}

function migrate() {
  db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

  // Údaje z importovaných prehľadov - orientačné, nie skladové.
  pridajStlpec('items', 'usage_6m', 'REAL');            // spotreba za 6 mesiacov z prehľadu
  pridajStlpec('items', 'ref_price', 'REAL');           // orientačná cena za MJ
  pridajStlpec('items', 'ref_price_note', 'TEXT');      // odkiaľ cena pochádza
}

module.exports = { db, migrate };
