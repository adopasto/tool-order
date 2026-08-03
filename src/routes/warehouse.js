'use strict';
const express = require('express');
const { db } = require('../db');
const { requireLogin, requireRole } = require('../middleware/auth');
const { prijem, korekcia, stockState, AppError } = require('../services/stock');
const { otvoreneAlerty, posliSuhrn, exportCsv } = require('../services/alerts');

const r = express.Router();
r.use(requireLogin);

/* ---------------- SKLAD ---------------- */

/**
 * Sklad má jednu stránku so záložkami - stav, doobjednanie, príjem,
 * inventúra a pohyby. Menej položiek v menu, menej blúdenia.
 */
function zobrazSklad(req, res, zalozka) {
  const q = req.query.q ? String(req.query.q).trim() : '';
  const polozky = db.prepare(`SELECT i.*, c.name AS cat_name FROM items i
                              LEFT JOIN categories c ON c.id = i.category_id
                              WHERE i.active = 1
                                AND (? = '' OR i.code LIKE ? OR i.name LIKE ? OR i.location LIKE ?)
                              ORDER BY i.code`).all(q, `%${q}%`, `%${q}%`, `%${q}%`);
  for (const p of polozky) p.stav = stockState(p);

  const pohyby = db.prepare(`SELECT m.*, i.code, i.name, i.unit, u.full_name,
                                    rq.number AS ziadanka
                             FROM stock_moves m JOIN items i ON i.id = m.item_id
                             LEFT JOIN users u ON u.id = m.user_id
                             LEFT JOIN request_lines rl ON rl.id = m.request_line_id
                             LEFT JOIN requests rq ON rq.id = rl.request_id
                             ORDER BY m.id DESC LIMIT 100`).all();

  res.render('sklad', {
    zalozka, q, polozky, pohyby,
    alerty: otvoreneAlerty(),
    dodavatelia: db.prepare('SELECT id, name FROM suppliers WHERE active=1 ORDER BY name').all(),
  });
}

r.get('/sklad', requireRole('storekeeper', 'buyer'), (req, res) => {
  const povolene = ['stav', 'prijem', 'inventura', 'pohyby'];
  zobrazSklad(req, res, povolene.includes(req.query.tab) ? req.query.tab : 'stav');
});

r.get('/sklad/doobjednat', requireRole('storekeeper', 'buyer'),
  (req, res) => zobrazSklad(req, res, 'doobjednat'));

r.post('/sklad/prijem', requireRole('storekeeper'), (req, res, next) => {
  try {
    prijem({
      itemId: Number(req.body.item_id),
      qty: Number(req.body.qty),
      supplierId: req.body.supplier_id ? Number(req.body.supplier_id) : null,
      userId: req.session.user.id,
      note: req.body.note || null,
    });
    req.session.flash = 'Príjem zaevidovaný.';
  } catch (e) {
    if (!(e instanceof AppError)) return next(e);
    req.session.flash = e.message;
  }
  res.redirect(req.app.locals.base + '/sklad?tab=prijem');
});

r.post('/sklad/korekcia', requireRole('storekeeper'), (req, res, next) => {
  try {
    korekcia({
      itemId: Number(req.body.item_id),
      newQty: Number(req.body.new_qty),
      userId: req.session.user.id,
      note: req.body.note || null,
      type: req.body.typ === 'KOREKCIA' ? 'KOREKCIA' : 'INVENTURA',
    });
    req.session.flash = 'Stav upravený.';
  } catch (e) {
    if (!(e instanceof AppError)) return next(e);
    req.session.flash = e.message;
  }
  res.redirect(req.app.locals.base + '/sklad?tab=inventura');
});

r.post('/sklad/doobjednat/suhrn', requireRole('storekeeper', 'buyer'), (req, res) => {
  const n = posliSuhrn();
  req.session.flash = n ? `Podklad na doobjednanie odoslaný (${n} položiek).`
                        : 'Žiadne položky pod signálnou zásobou.';
  res.redirect(req.app.locals.base + '/sklad/doobjednat');
});

/** CSV pre oddelenie, ktoré vystavuje objednávky u dodávateľov. */
r.get('/sklad/doobjednat/export.csv', requireRole('storekeeper', 'buyer'), (req, res) => {
  const datum = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="doobjednat-${datum}.csv"`);
  res.send(exportCsv());
});

// Staré adresy nech nekončia na 404.
r.get('/upozornenia', (req, res) => res.redirect(req.app.locals.base + '/sklad/doobjednat'));
r.get('/sklad/karta/:id', (req, res) =>
  res.redirect(`${req.app.locals.base}/produkt/${req.params.id}`));

/* ---------------- DODAVATELIA ---------------- */

r.get('/dodavatelia', (req, res) => {
  const dodavatelia = db.prepare(`SELECT s.*,
      (SELECT COUNT(*) FROM supplier_items si WHERE si.supplier_id = s.id) AS pocet_poloziek
      FROM suppliers s WHERE s.active = 1 ORDER BY s.name`).all();
  res.render('dodavatelia', { dodavatelia });
});

r.get('/dodavatelia/:id', (req, res) => {
  const d = db.prepare('SELECT * FROM suppliers WHERE id=?').get(req.params.id);
  if (!d) return res.status(404).render('chyba', { msg: 'Dodávateľ neexistuje.' });
  const polozky = db.prepare(`SELECT i.*, si.supplier_sku, si.price, si.min_order_qty, si.is_primary
                              FROM supplier_items si JOIN items i ON i.id = si.item_id
                              WHERE si.supplier_id = ? ORDER BY i.code`).all(d.id);
  for (const p of polozky) p.stav = stockState(p);
  const ponuky = db.prepare(`SELECT q.*,
      (SELECT COUNT(*) FROM quote_lines ql WHERE ql.quote_id = q.id) AS riadkov
      FROM quotes q WHERE q.supplier_id = ? ORDER BY q.issued_at DESC`).all(d.id);
  res.render('dodavatel', { d, polozky, ponuky });
});

module.exports = r;
