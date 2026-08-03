'use strict';
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { db } = require('../db');
const cfg = require('../config');

const POVOLENE = { '.jpg': 1, '.jpeg': 1, '.png': 1, '.webp': 1, '.gif': 1 };

fs.mkdirSync(cfg.uploadDir, { recursive: true });

/**
 * Súbor sa vždy ukladá pod kódom položky (NAR-001.jpg). Vďaka tomu je
 * priečinok čitateľný aj bez databázy a dá sa naplniť hromadne - stačí
 * fotky pomenovať kódmi a nakopírovať ich do data/uploads/items.
 */
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, cfg.uploadDir),
  filename: (req, file, cb) => {
    const it = db.prepare('SELECT code FROM items WHERE id = ?').get(Number(req.params.id));
    if (!it) return cb(new Error('Položka neexistuje.'));
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${it.code}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 4 * 1024 * 1024 },   // 4 MB - z mobilu stačí, sieť to unesie
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, !!POVOLENE[ext]);
  },
});

/** Po nahratí: zapíš cestu a zmaž starý súbor s inou príponou. */
function ulozFoto(itemId, filename) {
  const it = db.prepare('SELECT code, image_path FROM items WHERE id = ?').get(itemId);
  if (!it) return;
  if (it.image_path && it.image_path !== filename) {
    const stary = path.join(cfg.uploadDir, it.image_path);
    if (fs.existsSync(stary)) fs.unlinkSync(stary);
  }
  db.prepare('UPDATE items SET image_path = ? WHERE id = ?').run(filename, itemId);
}

function zmazFoto(itemId) {
  const it = db.prepare('SELECT image_path FROM items WHERE id = ?').get(itemId);
  if (it?.image_path) {
    const f = path.join(cfg.uploadDir, it.image_path);
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }
  db.prepare('UPDATE items SET image_path = NULL WHERE id = ?').run(itemId);
}

/**
 * Hromadné priradenie: prejde priečinok a spáruje súbory s položkami podľa
 * názvu (bez prípony) = kód položky. Pri 200 položkách ušetrí 200 klikaní.
 * Vracia { spojene, nespojene: [názvy súborov bez zhody] }.
 */
function skenujPriecinok() {
  const subory = fs.readdirSync(cfg.uploadDir)
    .filter(f => POVOLENE[path.extname(f).toLowerCase()]);

  const upd = db.prepare('UPDATE items SET image_path = ? WHERE id = ?');
  const najdi = db.prepare('SELECT id FROM items WHERE upper(code) = upper(?)');

  let spojene = 0;
  const nespojene = [];
  for (const f of subory) {
    const kod = path.basename(f, path.extname(f));
    const it = najdi.get(kod);
    if (it) { upd.run(f, it.id); spojene++; }
    else nespojene.push(f);
  }
  return { spojene, nespojene };
}

module.exports = { upload, ulozFoto, zmazFoto, skenujPriecinok, POVOLENE };
