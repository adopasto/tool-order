'use strict';
const { db } = require('../db');
const { AppError } = require('./stock');

/* ------------------------------------------------------------------ *
 *  POLOŽKY                                                            *
 * ------------------------------------------------------------------ */

function detailPolozky(id) {
  const i = db.prepare(`SELECT i.*, c.name AS cat_name FROM items i
                        LEFT JOIN categories c ON c.id = i.category_id
                        WHERE i.id = ?`).get(id);
  if (!i) return null;

  i.dodavatelia = db.prepare(`SELECT s.id, s.name, s.email, s.phone, s.contact_person,
                                     s.lead_time_days, si.supplier_sku, si.price,
                                     si.min_order_qty, si.is_primary
                              FROM supplier_items si JOIN suppliers s ON s.id = si.supplier_id
                              WHERE si.item_id = ? ORDER BY si.is_primary DESC, s.name`).all(id);

  i.baliky = db.prepare(`SELECT b.id, b.code, b.name, bi.qty FROM bundle_items bi
                         JOIN bundles b ON b.id = bi.bundle_id
                         WHERE bi.item_id = ? AND b.active = 1 ORDER BY b.code`).all(id);

  i.pohyby = db.prepare(`SELECT m.move_type, m.qty, m.created_at, m.note,
                                u.full_name, rq.number AS ziadanka
                         FROM stock_moves m
                         LEFT JOIN users u ON u.id = m.user_id
                         LEFT JOIN request_lines rl ON rl.id = m.request_line_id
                         LEFT JOIN requests rq ON rq.id = rl.request_id
                         WHERE m.item_id = ? ORDER BY m.id DESC LIMIT 15`).all(id);

  // Spotreba za 90 dní - podklad na výpočet signálnej zásoby.
  const sp = db.prepare(`SELECT COALESCE(SUM(-qty), 0) AS spolu FROM stock_moves
                         WHERE item_id = ? AND move_type = 'VYDAJ'
                           AND created_at >= datetime('now','localtime','-90 days')`).get(id);
  i.spotreba90 = sp.spolu;

  // Množstevné cenové pásma z platných ponúk - podklad, koľko sa oplatí objednať.
  i.pasma = db.prepare(`SELECT ql.min_qty, ql.unit_price, ql.note, ql.supplier_sku,
                               q.number, q.valid_until, s.name AS supplier_name
                        FROM quote_lines ql
                        JOIN quotes q ON q.id = ql.quote_id
                        LEFT JOIN suppliers s ON s.id = q.supplier_id
                        WHERE ql.item_id = ?
                        ORDER BY q.issued_at DESC, ql.min_qty`).all(id);

  i.ponuky = db.prepare(`SELECT DISTINCT q.id, q.number, q.issued_at, q.valid_until,
                                q.file_path, s.name AS supplier_name
                         FROM quote_lines ql JOIN quotes q ON q.id = ql.quote_id
                         LEFT JOIN suppliers s ON s.id = q.supplier_id
                         WHERE ql.item_id = ? ORDER BY q.issued_at DESC`).all(id);
  return i;
}

function skontrolujPolozku(d, idAktualnej = null) {
  if (!d.code || !/^[A-Za-z0-9._-]{2,20}$/.test(d.code))
    throw new AppError('Kód musí mať 2–20 znakov: písmená, číslice, pomlčka, bodka alebo podčiarkovník.');
  if (!d.name || d.name.trim().length < 2)
    throw new AppError('Zadajte názov položky.');

  const kolizia = db.prepare('SELECT id FROM items WHERE upper(code) = upper(?)').get(d.code);
  if (kolizia && kolizia.id !== idAktualnej)
    throw new AppError(`Kód ${d.code} už používa iná položka.`);
}

/** Nová položka. Počiatočný stav sa zapíše ako pohyb, nie ako priamy UPDATE. */
const vytvorPolozku = db.transaction((d, userId) => {
  skontrolujPolozku(d);
  // Objekt musí obsahovať presne tie kľúče, ktoré SQL používa - node:sqlite
  // odmietne prebytočné pomenované parametre (better-sqlite3 ich toleroval).
  const id = db.prepare(`INSERT INTO items
    (code, name, description, category_id, unit, reorder_point, reorder_qty,
     location, is_esd, active)
    VALUES (@code,@name,@description,@category_id,@unit,@reorder_point,@reorder_qty,
            @location,@is_esd,@active)`).run({
    code: d.code, name: d.name, description: d.description, category_id: d.category_id,
    unit: d.unit, reorder_point: d.reorder_point, reorder_qty: d.reorder_qty,
    location: d.location, is_esd: d.is_esd, active: d.active,
  }).lastInsertRowid;

  if (Number(d.pociatocny_stav) > 0) {
    db.prepare(`INSERT INTO stock_moves (item_id, move_type, qty, user_id, note)
                VALUES (?, 'INVENTURA', ?, ?, 'Počiatočný stav pri založení položky')`)
      .run(id, Number(d.pociatocny_stav), userId);
  }
  return id;
});

const upravPolozku = db.transaction((id, d) => {
  skontrolujPolozku(d, id);
  db.prepare(`UPDATE items SET code=@code, name=@name, description=@description,
              category_id=@category_id, unit=@unit, reorder_point=@reorder_point,
              reorder_qty=@reorder_qty, location=@location, is_esd=@is_esd, active=@active
              WHERE id=@id`).run({
    id, code: d.code, name: d.name, description: d.description, category_id: d.category_id,
    unit: d.unit, reorder_point: d.reorder_point, reorder_qty: d.reorder_qty,
    location: d.location, is_esd: d.is_esd, active: d.active,
  });
});

/**
 * Zmazať sa dá len položka bez histórie. Ak už má pohyby alebo je na žiadanke,
 * histórii by sme urobili dieru - vtedy sa len deaktivuje a zmizne z katalógu.
 */
const zmazPolozku = db.transaction((id) => {
  const pohyby = db.prepare('SELECT COUNT(*) c FROM stock_moves WHERE item_id=?').get(id).c;
  const riadky = db.prepare('SELECT COUNT(*) c FROM request_lines WHERE item_id=?').get(id).c;

  if (pohyby > 0 || riadky > 0) {
    db.prepare('UPDATE items SET active = 0 WHERE id = ?').run(id);
    return { zmazane: false, pohyby, riadky };
  }
  db.prepare('DELETE FROM supplier_items WHERE item_id=?').run(id);
  db.prepare('DELETE FROM bundle_items WHERE item_id=?').run(id);
  db.prepare('DELETE FROM items WHERE id=?').run(id);
  return { zmazane: true };
});

/* ------------------------------------------------------------------ *
 *  VÄZBA POLOŽKA ↔ DODÁVATEĽ                                          *
 * ------------------------------------------------------------------ */

const priradDodavatela = db.transaction((itemId, d) => {
  if (!d.supplier_id) throw new AppError('Vyberte dodávateľa.');
  if (Number(d.is_primary))
    db.prepare('UPDATE supplier_items SET is_primary = 0 WHERE item_id = ?').run(itemId);

  db.prepare(`INSERT INTO supplier_items
    (supplier_id, item_id, supplier_sku, price, min_order_qty, is_primary)
    VALUES (@supplier_id, @item_id, @supplier_sku, @price, @min_order_qty, @is_primary)
    ON CONFLICT(supplier_id, item_id) DO UPDATE SET
      supplier_sku = excluded.supplier_sku, price = excluded.price,
      min_order_qty = excluded.min_order_qty, is_primary = excluded.is_primary`)
    .run({ ...d, item_id: itemId });
});

function odoberDodavatela(itemId, supplierId) {
  db.prepare('DELETE FROM supplier_items WHERE item_id=? AND supplier_id=?').run(itemId, supplierId);
}

/* ------------------------------------------------------------------ *
 *  BALÍKY                                                             *
 * ------------------------------------------------------------------ */

function detailBalika(id) {
  const b = db.prepare(`SELECT b.*, c.name AS cat_name FROM bundles b
                        LEFT JOIN categories c ON c.id = b.category_id
                        WHERE b.id = ?`).get(id);
  if (!b) return null;
  b.komponenty = db.prepare(`SELECT i.id, i.code, i.name, i.unit, i.stock_qty,
                                    i.reorder_point, i.image_path, bi.qty
                             FROM bundle_items bi JOIN items i ON i.id = bi.item_id
                             WHERE bi.bundle_id = ? ORDER BY i.code`).all(id);
  b.dostupnost = b.komponenty.length
    ? Math.floor(Math.min(...b.komponenty.map(k => k.stock_qty / k.qty))) : 0;
  return b;
}

/** riadky = [{item_id, qty}] */
const ulozBalik = db.transaction((id, d, riadky) => {
  if (!d.name || d.name.trim().length < 2) throw new AppError('Zadajte názov balíka.');
  const platne = riadky.filter(r => r.item_id && Number(r.qty) > 0);
  if (platne.length === 0) throw new AppError('Balík musí obsahovať aspoň jednu položku.');

  if (id) {
    db.prepare(`UPDATE bundles SET code=@code, name=@name, description=@description,
                category_id=@category_id, active=@active WHERE id=@id`).run({ ...d, id });
    db.prepare('DELETE FROM bundle_items WHERE bundle_id=?').run(id);
  } else {
    id = db.prepare(`INSERT INTO bundles (code, name, description, category_id, active)
                     VALUES (@code,@name,@description,@category_id,@active)`).run(d).lastInsertRowid;
  }

  const ins = db.prepare('INSERT INTO bundle_items (bundle_id, item_id, qty) VALUES (?,?,?)');
  const zlucene = new Map();
  for (const r of platne)
    zlucene.set(Number(r.item_id), (zlucene.get(Number(r.item_id)) || 0) + Number(r.qty));
  for (const [itemId, qty] of zlucene) ins.run(id, itemId, qty);
  return id;
});

const zmazBalik = db.transaction((id) => {
  const pouzity = db.prepare('SELECT COUNT(*) c FROM request_lines WHERE bundle_id=?').get(id).c;
  if (pouzity > 0) {
    db.prepare('UPDATE bundles SET active = 0 WHERE id = ?').run(id);
    return { zmazane: false, pouzity };
  }
  db.prepare('DELETE FROM bundle_items WHERE bundle_id=?').run(id);
  db.prepare('DELETE FROM bundles WHERE id=?').run(id);
  return { zmazane: true };
});

/* ------------------------------------------------------------------ *
 *  KATEGÓRIE A DODÁVATELIA                                            *
 * ------------------------------------------------------------------ */

function ulozKategoriu(id, name, sort) {
  if (!name || name.trim().length < 2) throw new AppError('Zadajte názov kategórie.');
  if (id) db.prepare('UPDATE categories SET name=?, sort_order=? WHERE id=?').run(name, sort, id);
  else db.prepare('INSERT INTO categories (name, sort_order) VALUES (?,?)').run(name, sort);
}

function zmazKategoriu(id) {
  const pocet = db.prepare('SELECT COUNT(*) c FROM items WHERE category_id=?').get(id).c;
  if (pocet > 0) throw new AppError(`Kategóriu nemožno zmazať, patrí do nej ${pocet} položiek.`);
  db.prepare('DELETE FROM categories WHERE id=?').run(id);
}

function ulozDodavatela(id, d) {
  if (!d.name || d.name.trim().length < 2) throw new AppError('Zadajte názov dodávateľa.');
  if (id) {
    db.prepare(`UPDATE suppliers SET name=@name, ico=@ico, contact_person=@contact_person,
                email=@email, phone=@phone, web=@web, address=@address,
                lead_time_days=@lead_time_days, note=@note, active=@active
                WHERE id=@id`).run({ ...d, id });
    return id;
  }
  return db.prepare(`INSERT INTO suppliers
    (name, ico, contact_person, email, phone, web, address, lead_time_days, note, active)
    VALUES (@name,@ico,@contact_person,@email,@phone,@web,@address,@lead_time_days,@note,@active)`)
    .run(d).lastInsertRowid;
}

module.exports = {
  detailPolozky, vytvorPolozku, upravPolozku, zmazPolozku,
  priradDodavatela, odoberDodavatela,
  detailBalika, ulozBalik, zmazBalik,
  ulozKategoriu, zmazKategoriu, ulozDodavatela,
};
