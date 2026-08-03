'use strict';
const fs = require('fs');
const path = require('path');
const express = require('express');
const { db } = require('../db');
const cfg = require('../config');
const { requireLogin } = require('../middleware/auth');
const { stockState } = require('../services/stock');
const P = require('../services/products');

// Karty produktov a balíkov - vidí ich každý prihlásený.
// Správa sortimentu je v routes/admin.js pod /sprava.
const r = express.Router();
r.use(requireLogin);

/* ---------------- DETAIL (vidí každý prihlásený) ---------------- */

r.get('/produkt/:id', (req, res) => {
  const i = P.detailPolozky(Number(req.params.id));
  if (!i) return res.status(404).render('chyba', { msg: 'Položka neexistuje.' });
  i.stav = stockState(i);
  res.render('produkt', { i });
});

r.get('/balik/:id', (req, res) => {
  const b = P.detailBalika(Number(req.params.id));
  if (!b) return res.status(404).render('chyba', { msg: 'Balík neexistuje.' });
  for (const k of b.komponenty) k.stav = stockState(k);
  res.render('balik', { b });
});


/** Príloha cenovej ponuky (PDF). Dostupná len prihláseným. */
r.get('/ponuka/:id/priloha', (req, res) => {
  const q = db.prepare('SELECT number, file_path FROM quotes WHERE id = ?').get(req.params.id);
  if (!q || !q.file_path) return res.status(404).render('chyba', { msg: 'Ponuka nemá prílohu.' });
  const subor = path.join(path.dirname(cfg.dbPath), 'quotes', q.file_path);
  if (!fs.existsSync(subor)) return res.status(404).render('chyba', { msg: 'Súbor ponuky sa nenašiel.' });
  res.download(subor, `${q.number}.pdf`);
});

module.exports = r;
