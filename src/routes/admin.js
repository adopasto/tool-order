'use strict';
const express = require('express');
const { db } = require('../db');
const { requireLogin, requireRole } = require('../middleware/auth');
const { stockState } = require('../services/stock');
const { upload, ulozFoto, zmazFoto, skenujPriecinok } = require('../services/photos');

const r = express.Router();
r.use(requireLogin);

// Sortiment spravuje sklad aj administrátor - sklad má k položkám najbližšie.
const spravca = requireRole('admin', 'storekeeper');

/** Prevedie prázdny reťazec na null, aby v DB neboli prázdne texty. */
const nn = v => (v === undefined || v === null || String(v).trim() === '' ? null : String(v).trim());
const cislo = (v, d = null) => (v === undefined || v === '' || v === null ? d : Number(v));

function chybaDb(e) {
  if (String(e.message).includes('UNIQUE') && String(e.message).includes('code'))
    return 'Kód už existuje, zvoľte iný.';
  return `Nepodarilo sa uložiť: ${e.message}`;
}

/* ==================== ROZCESTNÍK ==================== */

r.get('/sprava', spravca, (req, res) => {
  const p = db.prepare(`SELECT COUNT(*) c, SUM(active) a FROM items`).get();
  res.render('sprava', {
    pocty: {
      polozky: p.c, aktivne: p.a,
      bezFotky: db.prepare('SELECT COUNT(*) c FROM items WHERE image_path IS NULL AND active=1').get().c,
      baliky: db.prepare('SELECT COUNT(*) c FROM bundles').get().c,
      kategorie: db.prepare('SELECT COUNT(*) c FROM categories').get().c,
      dodavatelia: db.prepare('SELECT COUNT(*) c FROM suppliers WHERE active=1').get().c,
    },
  });
});

/* ==================== POLOŽKY ==================== */

r.get('/sprava/polozky', spravca, (req, res) => {
  const q = nn(req.query.q);
  const polozky = db.prepare(`SELECT i.*, c.name AS cat_name FROM items i
                              LEFT JOIN categories c ON c.id = i.category_id
                              WHERE (? IS NULL OR i.code LIKE ? OR i.name LIKE ?)
                              ORDER BY i.code`).all(q, `%${q || ''}%`, `%${q || ''}%`);
  for (const p of polozky) p.stav = stockState(p);
  res.render('admin-polozky', { polozky, q: q || '' });
});

r.get('/sprava/polozka/nova', spravca, (req, res) => {
  res.render('admin-polozka-form', {
    p: { unit: 'ks', reorder_point: 5, active: 1, is_esd: 0 },
    kategorie: db.prepare('SELECT * FROM categories ORDER BY sort_order, name').all(),
    dodavatelia: [], vsetciDodavatelia: [], novy: true, chyba: null,
  });
});

r.post('/sprava/polozka/nova', spravca, (req, res) => {
  const b = req.body;
  try {
    const id = db.prepare(`INSERT INTO items
      (code, name, description, category_id, unit, reorder_point, reorder_qty, location, is_esd, active)
      VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .run(nn(b.code), nn(b.name), nn(b.description), cislo(b.category_id),
           nn(b.unit) || 'ks', cislo(b.reorder_point, 0), cislo(b.reorder_qty),
           nn(b.location), b.is_esd ? 1 : 0, b.active ? 1 : 0).lastInsertRowid;

    // Počiatočný stav sa zapisuje ako pohyb, nie ako hodnota v items.
    const pociatok = cislo(b.pociatocny_stav, 0);
    if (pociatok > 0)
      db.prepare(`INSERT INTO stock_moves (item_id, move_type, qty, user_id, note)
                  VALUES (?, 'INVENTURA', ?, ?, 'Založenie položky')`)
        .run(id, pociatok, req.session.user.id);

    req.session.flash = 'Položka založená. Doplňte fotku a dodávateľov.';
    res.redirect(`${req.app.locals.base}/sprava/polozka/${id}`);
  } catch (e) {
    res.status(400).render('admin-polozka-form', {
      p: b, kategorie: db.prepare('SELECT * FROM categories ORDER BY sort_order, name').all(),
      dodavatelia: [], vsetciDodavatelia: [], novy: true, chyba: chybaDb(e),
    });
  }
});

function formularPolozky(req, res, chyba = null, status = 200) {
  const p = db.prepare('SELECT * FROM items WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).render('chyba', { msg: 'Položka neexistuje.' });
  res.status(status).render('admin-polozka-form', {
    p,
    kategorie: db.prepare('SELECT * FROM categories ORDER BY sort_order, name').all(),
    dodavatelia: db.prepare(`SELECT s.id, s.name, si.supplier_sku, si.price, si.min_order_qty, si.is_primary
                             FROM supplier_items si JOIN suppliers s ON s.id = si.supplier_id
                             WHERE si.item_id = ? ORDER BY si.is_primary DESC, s.name`).all(p.id),
    vsetciDodavatelia: db.prepare('SELECT id, name FROM suppliers WHERE active = 1 ORDER BY name').all(),
    novy: false, chyba,
  });
}

r.get('/sprava/polozka/:id', spravca, (req, res) => formularPolozky(req, res));

r.post('/sprava/polozka/:id', spravca, (req, res) => {
  const b = req.body;
  try {
    db.prepare(`UPDATE items SET code=?, name=?, description=?, category_id=?, unit=?,
                reorder_point=?, reorder_qty=?, location=?, is_esd=?, active=? WHERE id=?`)
      .run(nn(b.code), nn(b.name), nn(b.description), cislo(b.category_id), nn(b.unit) || 'ks',
           cislo(b.reorder_point, 0), cislo(b.reorder_qty), nn(b.location),
           b.is_esd ? 1 : 0, b.active ? 1 : 0, req.params.id);
    req.session.flash = 'Zmeny uložené.';
    res.redirect(`${req.app.locals.base}/sprava/polozka/${req.params.id}`);
  } catch (e) {
    formularPolozky(req, res, chybaDb(e), 400);
  }
});

/** Zmazať sa dá len položka bez histórie. Inak sa deaktivuje. */
r.post('/sprava/polozka/:id/zmazat', spravca, (req, res) => {
  const id = Number(req.params.id);
  const pohyby = db.prepare('SELECT COUNT(*) c FROM stock_moves WHERE item_id=?').get(id).c;
  const riadky = db.prepare('SELECT COUNT(*) c FROM request_lines WHERE item_id=?').get(id).c;

  if (pohyby || riadky) {
    db.prepare('UPDATE items SET active = 0 WHERE id = ?').run(id);
    req.session.flash = 'Položka má históriu, preto bola len deaktivovaná – zostáva v evidencii.';
    return res.redirect(req.app.locals.base + '/sprava/polozky');
  }
  const tx = db.transaction(() => {
    zmazFoto(id);
    db.prepare('DELETE FROM supplier_items WHERE item_id=?').run(id);
    db.prepare('DELETE FROM bundle_items WHERE item_id=?').run(id);
    db.prepare('DELETE FROM stock_alerts WHERE item_id=?').run(id);
    db.prepare('DELETE FROM items WHERE id=?').run(id);
  });
  tx();
  req.session.flash = 'Položka zmazaná.';
  res.redirect(req.app.locals.base + '/sprava/polozky');
});

/* ---- fotky ---- */

r.post('/sprava/polozka/:id/foto', spravca, (req, res) => {
  upload.single('foto')(req, res, (err) => {
    if (err) req.session.flash = `Fotku sa nepodarilo nahrať: ${err.message}`;
    else if (!req.file) req.session.flash = 'Vyberte súbor JPG, PNG alebo WEBP do 4 MB.';
    else {
      ulozFoto(Number(req.params.id), req.file.filename);
      req.session.flash = 'Fotka uložená.';
    }
    res.redirect(req.get('referer') || (req.app.locals.base + '/sprava/polozky'));
  });
});

r.post('/sprava/polozka/:id/foto/zmazat', spravca, (req, res) => {
  zmazFoto(Number(req.params.id));
  req.session.flash = 'Fotka odstránená.';
  res.redirect(req.get('referer') || (req.app.locals.base + '/sprava/polozky'));
});

r.post('/sprava/fotky/skenovat', spravca, (req, res) => {
  const { spojene, nespojene } = skenujPriecinok();
  req.session.flash = `Priradených fotiek: ${spojene}.` +
    (nespojene.length ? ` Bez zhody s kódom položky: ${nespojene.join(', ')}` : '');
  res.redirect(req.app.locals.base + '/sprava/polozky');
});

/* ---- dodávatelia položky ---- */

r.post('/sprava/polozka/:id/dodavatel', spravca, (req, res) => {
  const b = req.body, id = Number(req.params.id);
  try {
    const tx = db.transaction(() => {
      if (b.is_primary) db.prepare('UPDATE supplier_items SET is_primary=0 WHERE item_id=?').run(id);
      db.prepare(`INSERT INTO supplier_items
        (supplier_id, item_id, supplier_sku, price, min_order_qty, is_primary)
        VALUES (?,?,?,?,?,?)
        ON CONFLICT(supplier_id, item_id) DO UPDATE SET
          supplier_sku=excluded.supplier_sku, price=excluded.price,
          min_order_qty=excluded.min_order_qty, is_primary=excluded.is_primary`)
        .run(cislo(b.supplier_id), id, nn(b.supplier_sku), cislo(b.price),
             cislo(b.min_order_qty, 1), b.is_primary ? 1 : 0);
    });
    tx();
    req.session.flash = 'Dodávateľ priradený.';
  } catch (e) { req.session.flash = chybaDb(e); }
  res.redirect(`${req.app.locals.base}/sprava/polozka/${id}`);
});

r.post('/sprava/polozka/:id/dodavatel/:sid/zmazat', spravca, (req, res) => {
  db.prepare('DELETE FROM supplier_items WHERE item_id=? AND supplier_id=?')
    .run(req.params.id, req.params.sid);
  req.session.flash = 'Väzba na dodávateľa zrušená.';
  res.redirect(`${req.app.locals.base}/sprava/polozka/${req.params.id}`);
});

/* ==================== KATEGÓRIE ==================== */

r.get('/sprava/kategorie', spravca, (req, res) => {
  const kategorie = db.prepare(`SELECT c.*,
      (SELECT COUNT(*) FROM items i WHERE i.category_id = c.id) AS pocet_poloziek,
      (SELECT COUNT(*) FROM bundles b WHERE b.category_id = c.id) AS pocet_balikov
      FROM categories c ORDER BY c.sort_order, c.name`).all();
  res.render('admin-kategorie', { kategorie });
});

r.post('/sprava/kategorie', spravca, (req, res) => {
  db.prepare('INSERT INTO categories (name, sort_order) VALUES (?,?)')
    .run(nn(req.body.name), cislo(req.body.sort_order, 0));
  req.session.flash = 'Kategória pridaná.';
  res.redirect(req.app.locals.base + '/sprava/kategorie');
});

r.post('/sprava/kategoria/:id', spravca, (req, res) => {
  db.prepare('UPDATE categories SET name=?, sort_order=? WHERE id=?')
    .run(nn(req.body.name), cislo(req.body.sort_order, 0), req.params.id);
  req.session.flash = 'Kategória uložená.';
  res.redirect(req.app.locals.base + '/sprava/kategorie');
});

r.post('/sprava/kategoria/:id/zmazat', spravca, (req, res) => {
  const id = Number(req.params.id);
  const pouzita = db.prepare(`SELECT
      (SELECT COUNT(*) FROM items WHERE category_id=?) +
      (SELECT COUNT(*) FROM bundles WHERE category_id=?) AS c`).get(id, id).c;
  if (pouzita) req.session.flash = 'Kategóriu nemožno zmazať, sú v nej položky alebo balíky.';
  else { db.prepare('DELETE FROM categories WHERE id=?').run(id); req.session.flash = 'Kategória zmazaná.'; }
  res.redirect(req.app.locals.base + '/sprava/kategorie');
});

/* ==================== BALÍKY ==================== */

r.get('/sprava/baliky', spravca, (req, res) => {
  const baliky = db.prepare(`SELECT b.*, c.name AS cat_name,
      (SELECT COUNT(*) FROM bundle_items bi WHERE bi.bundle_id = b.id) AS pocet
      FROM bundles b LEFT JOIN categories c ON c.id = b.category_id
      ORDER BY b.code`).all();
  res.render('admin-baliky', { baliky });
});

r.get('/sprava/balik/novy', spravca, (req, res) => {
  res.render('admin-balik-form', {
    b: { active: 1 }, komponenty: [], novy: true,
    kategorie: db.prepare('SELECT * FROM categories ORDER BY sort_order, name').all(),
    polozky: [], chyba: null,
  });
});

r.post('/sprava/balik/novy', spravca, (req, res) => {
  const b = req.body;
  try {
    const id = db.prepare('INSERT INTO bundles (code, name, description, category_id, active) VALUES (?,?,?,?,?)')
      .run(nn(b.code), nn(b.name), nn(b.description), cislo(b.category_id), b.active ? 1 : 0).lastInsertRowid;
    req.session.flash = 'Balík založený. Pridajte komponenty.';
    res.redirect(`${req.app.locals.base}/sprava/balik/${id}`);
  } catch (e) {
    res.status(400).render('admin-balik-form', {
      b, komponenty: [], novy: true,
      kategorie: db.prepare('SELECT * FROM categories ORDER BY sort_order, name').all(),
      polozky: [], chyba: chybaDb(e),
    });
  }
});

r.get('/sprava/balik/:id', spravca, (req, res) => {
  const b = db.prepare('SELECT * FROM bundles WHERE id=?').get(req.params.id);
  if (!b) return res.status(404).render('chyba', { msg: 'Balík neexistuje.' });
  res.render('admin-balik-form', {
    b, novy: false, chyba: null,
    komponenty: db.prepare(`SELECT i.id, i.code, i.name, i.unit, i.stock_qty, i.image_path, bi.qty
                            FROM bundle_items bi JOIN items i ON i.id = bi.item_id
                            WHERE bi.bundle_id=? ORDER BY i.code`).all(b.id),
    kategorie: db.prepare('SELECT * FROM categories ORDER BY sort_order, name').all(),
    polozky: db.prepare('SELECT id, code, name, unit FROM items WHERE active=1 ORDER BY code').all(),
  });
});

r.post('/sprava/balik/:id', spravca, (req, res) => {
  const b = req.body;
  db.prepare('UPDATE bundles SET code=?, name=?, description=?, category_id=?, active=? WHERE id=?')
    .run(nn(b.code), nn(b.name), nn(b.description), cislo(b.category_id), b.active ? 1 : 0, req.params.id);
  req.session.flash = 'Balík uložený.';
  res.redirect(`${req.app.locals.base}/sprava/balik/${req.params.id}`);
});

r.post('/sprava/balik/:id/komponent', spravca, (req, res) => {
  const itemId = cislo(req.body.item_id);
  const qty = cislo(req.body.qty, 1);
  if (!itemId) req.session.flash = 'Vyberte položku, ktorú chcete pridať.';
  else if (!(qty > 0)) req.session.flash = 'Množstvo musí byť väčšie ako nula.';
  else {
    db.prepare(`INSERT INTO bundle_items (bundle_id, item_id, qty) VALUES (?,?,?)
                ON CONFLICT(bundle_id, item_id) DO UPDATE SET qty = excluded.qty`)
      .run(req.params.id, itemId, qty);
    req.session.flash = 'Komponent uložený.';
  }
  res.redirect(`${req.app.locals.base}/sprava/balik/${req.params.id}`);
});

r.post('/sprava/balik/:id/komponent/:iid/zmazat', spravca, (req, res) => {
  db.prepare('DELETE FROM bundle_items WHERE bundle_id=? AND item_id=?').run(req.params.id, req.params.iid);
  req.session.flash = 'Komponent odstránený.';
  res.redirect(`${req.app.locals.base}/sprava/balik/${req.params.id}`);
});

r.post('/sprava/balik/:id/zmazat', spravca, (req, res) => {
  const id = Number(req.params.id);
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM bundle_items WHERE bundle_id=?').run(id);
    // request_lines.bundle_id je len informácia o pôvode riadku - uvoľníme ju
    db.prepare('UPDATE request_lines SET bundle_id = NULL WHERE bundle_id=?').run(id);
    db.prepare('DELETE FROM bundles WHERE id=?').run(id);
  });
  tx();
  req.session.flash = 'Balík zmazaný.';
  res.redirect(req.app.locals.base + '/sprava/baliky');
});

/* ==================== DODÁVATELIA ==================== */

r.get('/sprava/dodavatelia', spravca, (req, res) => {
  const dodavatelia = db.prepare(`SELECT s.*,
      (SELECT COUNT(*) FROM supplier_items si WHERE si.supplier_id = s.id) AS pocet_poloziek
      FROM suppliers s ORDER BY s.name`).all();
  res.render('admin-dodavatelia', { dodavatelia });
});

r.get('/sprava/dodavatel/novy', spravca, (req, res) =>
  res.render('admin-dodavatel-form', { d: { active: 1, lead_time_days: 7 }, novy: true, polozky: [] }));

r.post('/sprava/dodavatel/novy', spravca, (req, res) => {
  const b = req.body;
  const id = db.prepare(`INSERT INTO suppliers
    (name, ico, dic, contact_person, email, phone, web, address, lead_time_days, note, active)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(nn(b.name), nn(b.ico), nn(b.dic), nn(b.contact_person), nn(b.email), nn(b.phone),
         nn(b.web), nn(b.address), cislo(b.lead_time_days, 7), nn(b.note), b.active ? 1 : 0).lastInsertRowid;
  req.session.flash = 'Dodávateľ pridaný.';
  res.redirect(`${req.app.locals.base}/sprava/dodavatel/${id}`);
});

r.get('/sprava/dodavatel/:id', spravca, (req, res) => {
  const d = db.prepare('SELECT * FROM suppliers WHERE id=?').get(req.params.id);
  if (!d) return res.status(404).render('chyba', { msg: 'Dodávateľ neexistuje.' });
  res.render('admin-dodavatel-form', {
    d, novy: false,
    polozky: db.prepare(`SELECT i.id, i.code, i.name, si.supplier_sku, si.price, si.is_primary
                         FROM supplier_items si JOIN items i ON i.id = si.item_id
                         WHERE si.supplier_id=? ORDER BY i.code`).all(d.id),
  });
});

r.post('/sprava/dodavatel/:id', spravca, (req, res) => {
  const b = req.body;
  db.prepare(`UPDATE suppliers SET name=?, ico=?, dic=?, contact_person=?, email=?, phone=?,
              web=?, address=?, lead_time_days=?, note=?, active=? WHERE id=?`)
    .run(nn(b.name), nn(b.ico), nn(b.dic), nn(b.contact_person), nn(b.email), nn(b.phone),
         nn(b.web), nn(b.address), cislo(b.lead_time_days, 7), nn(b.note), b.active ? 1 : 0, req.params.id);
  req.session.flash = 'Dodávateľ uložený.';
  res.redirect(`${req.app.locals.base}/sprava/dodavatel/${req.params.id}`);
});

r.post('/sprava/dodavatel/:id/zmazat', spravca, (req, res) => {
  const id = Number(req.params.id);
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM supplier_items WHERE supplier_id=?').run(id);
    db.prepare('UPDATE stock_moves SET supplier_id = NULL WHERE supplier_id=?').run(id);
    db.prepare('DELETE FROM suppliers WHERE id=?').run(id);
  });
  tx();
  req.session.flash = 'Dodávateľ zmazaný.';
  res.redirect(req.app.locals.base + '/sprava/dodavatelia');
});

module.exports = r;
