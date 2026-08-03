'use strict';
// node:sqlite je v Node.js označený ako experimentálny - upozornenie do konzoly netreba.
const _emit = process.emitWarning;
process.emitWarning = (w, ...r) => { if (String(w).includes('SQLite')) return; _emit(w, ...r); };
// Zmaze databazu aj vygenerovanu postu a znovu naplni demo data.
const fs = require('fs');
const path = require('path');
const cfg = require('./config');

for (const f of [cfg.dbPath, cfg.dbPath + '-wal', cfg.dbPath + '-shm']) {
  if (fs.existsSync(f)) fs.unlinkSync(f);
}
const mailDir = path.join(path.dirname(cfg.dbPath), 'mail');
if (fs.existsSync(mailDir)) fs.rmSync(mailDir, { recursive: true, force: true });

const { migrate } = require('./db');
const { seedIfEmpty } = require('./seed');
migrate();
seedIfEmpty();
console.log('Databáza vyresetovaná a naplnená demo dátami.');
