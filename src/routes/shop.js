'use strict';
const express = require('express');
const { db } = require('../db');
const { requireLogin } = require('../middleware/auth');
const { stockState, AppError } = require('../services/stock');
const { odosliKosik } = require('../services/requests');

const r = express.Router();
r.use(requireLogin);

function kosik(req) {
  if (!req.session.cart) req.session.cart = [];
  return req.session.cart;
}

/** Dostupnost balika = kolko kompletnych sad pokryje sklad. */
function dostupnostBalika(bundleId) {
  const rows = db.prepare(`SELECT i.stock_qty, bi.qty FROM bundle_items bi
                           JOIN items i ON i.id = bi.item_id WHERE bi.bundle_id = ?`).all(bundleId);
  if (rows.length === 0) return 0;
  return Math.floor(Math.min(...rows.map(x => x.stock_qty / x.qty)));
}

r.get('/katalog', (req, res) => {
  const { cat, q } = req.query;
  const typ = req.query.typ === 'baliky' ? 'baliky' : 'polozky';
  const zobrazenie = req.query.zobrazenie === 'zoznam' ? 'zoznam' : 'dlazdice';

  const kategorie = db.prepare(`SELECT c.*,
      (SELECT COUNT(*) FROM items i WHERE i.category_id = c.id AND i.active = 1) AS pocet
      FROM categories c ORDER BY c.sort_order, c.name`).all();
  const spolu = db.prepare('SELECT COUNT(*) c FROM items WHERE active = 1').get().c;

  let polozky = [], baliky = [];
  if (typ === 'baliky') {
    baliky = db.prepare(`SELECT b.*, c.name AS cat_name FROM bundles b
                         LEFT JOIN categories c ON c.id = b.category_id
                         WHERE b.active = 1 AND (? IS NULL OR b.category_id = ?)
                           AND (? IS NULL OR b.name LIKE ? OR b.code LIKE ?)
                         ORDER BY b.code`)
      .all(cat || null, cat || null, q || null, `%${q || ''}%`, `%${q || ''}%`);
    for (const b of baliky) {
      b.komponenty = db.prepare(`SELECT i.code, i.name, i.unit, i.stock_qty, bi.qty
                                 FROM bundle_items bi JOIN items i ON i.id = bi.item_id
                                 WHERE bi.bundle_id = ? ORDER BY i.code`).all(b.id);
      b.dostupnost = dostupnostBalika(b.id);
    }
  } else {
    polozky = db.prepare(`SELECT i.*, c.name AS cat_name FROM items i
                          LEFT JOIN categories c ON c.id = i.category_id
                          WHERE i.active = 1 AND (? IS NULL OR i.category_id = ?)
                            AND (? IS NULL OR i.name LIKE ? OR i.code LIKE ?
                                 OR i.description LIKE ? OR i.location LIKE ?)
                          ORDER BY i.code`)
      .all(cat || null, cat || null, q || null, `%${q || ''}%`, `%${q || ''}%`,
           `%${q || ''}%`, `%${q || ''}%`);
    for (const p of polozky) p.stav = stockState(p);
  }

  res.render('katalog', {
    kategorie, spolu, polozky, baliky,
    cat: cat ? Number(cat) : null, q: q || '', typ, zobrazenie,
  });
});

r.post('/kosik/pridat', (req, res) => {
  const kind = req.body.kind === 'bundle' ? 'bundle' : 'item';
  const id = Number(req.body.id);
  const qty = Math.max(1, Number(req.body.qty) || 1);
  const c = kosik(req);
  const exist = c.find(x => x.kind === kind && x.id === id);
  if (exist) exist.qty += qty; else c.push({ kind, id, qty });
  req.session.flash = 'Pridané do košíka.';
  res.redirect(req.get('referer') || (req.app.locals.base + '/katalog'));
});

r.get('/kosik', (req, res) => {
  const riadky = kosik(req).map(c => {
    if (c.kind === 'bundle') {
      const b = db.prepare('SELECT * FROM bundles WHERE id=?').get(c.id);
      const komp = db.prepare(`SELECT i.code, i.name, i.unit, bi.qty FROM bundle_items bi
                               JOIN items i ON i.id = bi.item_id WHERE bi.bundle_id=?`).all(c.id);
      return { ...c, nazov: b?.name, kod: b?.code, jednotka: 'sada', foto: null,
               komponenty: komp, dostupnost: dostupnostBalika(c.id) };
    }
    const i = db.prepare('SELECT * FROM items WHERE id=?').get(c.id);
    return { ...c, nazov: i?.name, kod: i?.code, jednotka: i?.unit, foto: i?.image_path,
             sklad: i?.stock_qty, stav: i ? stockState(i) : null };
  });
  res.render('kosik', { riadky });
});

r.post('/kosik/zmenit', (req, res) => {
  const c = kosik(req);
  const idx = Number(req.body.index);
  const qty = Number(req.body.qty);
  if (c[idx]) {
    if (qty <= 0) c.splice(idx, 1);
    else c[idx].qty = qty;
  }
  res.redirect(req.app.locals.base + '/kosik');
});

r.post('/kosik/vyprazdnit', (req, res) => {
  req.session.cart = [];
  res.redirect(req.app.locals.base + '/kosik');
});

r.post('/kosik/odoslat', (req, res, next) => {
  try {
    const { number, id } = odosliKosik(kosik(req), req.session.user, req.body.note);
    req.session.cart = [];
    req.session.flash = `Žiadanka ${number} odoslaná na schválenie.`;
    res.redirect(`${req.app.locals.base}/ziadanky/${id}`);
  } catch (e) {
    if (e instanceof AppError) {
      req.session.flash = e.message;
      return res.redirect(req.app.locals.base + '/kosik');
    }
    next(e);
  }
});

module.exports = r;
