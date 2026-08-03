'use strict';
const { db } = require('../db');
const { queueMail } = require('./mailer');
const { AppError } = require('./stock');

/**
 * Cislo dokladu s rocnym resetom: ZN-2026-0042.
 * AUTOINCREMENT sa na cisla dokladov nehodi - pri rollbacku vznikaju diery.
 */
function dalsieCislo(docType = 'ZN') {
  const year = new Date().getFullYear();
  db.prepare(`INSERT INTO doc_counters (doc_type, year, last_no) VALUES (?,?,0)
              ON CONFLICT(doc_type, year) DO NOTHING`).run(docType, year);
  db.prepare('UPDATE doc_counters SET last_no = last_no + 1 WHERE doc_type=? AND year=?')
    .run(docType, year);
  const { last_no } = db.prepare('SELECT last_no FROM doc_counters WHERE doc_type=? AND year=?')
    .get(docType, year);
  return `${docType}-${year}-${String(last_no).padStart(4, '0')}`;
}

/** Balik nie je skladova polozka - pri odoslani sa rozklada na komponenty. */
function rozlozBalik(bundleId, qty) {
  return db.prepare(`SELECT item_id, qty * ? AS qty, ? AS bundle_id
                     FROM bundle_items WHERE bundle_id = ?`).all(qty, bundleId, bundleId);
}

/** Odoslanie kosika -> ziadanka. cart = [{kind:'item'|'bundle', id, qty}] */
const odosliKosik = db.transaction((cart, user, note) => {
  if (!cart || cart.length === 0) throw new AppError('Košík je prázdny.');

  // 1) rozloz baliky a zluc rovnake polozky
  const riadky = new Map();   // key = item_id + '|' + bundle_id
  for (const c of cart) {
    const zdroje = c.kind === 'bundle'
      ? rozlozBalik(c.id, c.qty)
      : [{ item_id: c.id, qty: c.qty, bundle_id: null }];
    for (const z of zdroje) {
      const k = `${z.item_id}|${z.bundle_id ?? ''}`;
      riadky.set(k, { ...z, qty: (riadky.get(k)?.qty || 0) + Number(z.qty) });
    }
  }

  const number = dalsieCislo('ZN');
  const reqId = db.prepare(`INSERT INTO requests (number, requester_id, cost_center, note)
                            VALUES (?,?,?,?)`)
                  .run(number, user.id, user.cost_center, note || null).lastInsertRowid;

  const ins = db.prepare(`INSERT INTO request_lines (request_id, item_id, bundle_id, qty_requested)
                          VALUES (?,?,?,?)`);
  for (const r of riadky.values()) ins.run(reqId, r.item_id, r.bundle_id, r.qty);

  // 2) notifikacia schvalovatelom strediska (fallback: vsetci schvalovatelia)
  let prijemcovia = db.prepare(`SELECT email FROM users
                                WHERE role='approver' AND active=1 AND cost_center = ?`)
                      .all(user.cost_center).map(x => x.email).filter(Boolean);
  if (prijemcovia.length === 0)
    prijemcovia = db.prepare(`SELECT email FROM users WHERE role='approver' AND active=1`)
                    .all().map(x => x.email).filter(Boolean);

  const detail = db.prepare(`SELECT i.code, i.name, rl.qty_requested, i.unit
                             FROM request_lines rl JOIN items i ON i.id = rl.item_id
                             WHERE rl.request_id = ?`).all(reqId);

  if (prijemcovia.length)
    queueMail(prijemcovia, `Nová žiadanka ${number} – ${user.full_name}`,
      `<p>Žiadateľ: <b>${user.full_name}</b> (${user.cost_center ?? '—'})</p>
       ${note ? `<p>Poznámka: ${note}</p>` : ''}
       <table border="1" cellpadding="4" cellspacing="0">
         <tr><th>Kód</th><th>Položka</th><th>Množstvo</th></tr>
         ${detail.map(d => `<tr><td>${d.code}</td><td>${d.name}</td>
            <td align="right">${d.qty_requested} ${d.unit}</td></tr>`).join('')}
       </table>`);

  return { id: reqId, number };
});

/** Prepocet hlavicky podla riadkov - vola sa po kazdom vydaji. */
function prepocitajStav(reqId) {
  const rows = db.prepare(`SELECT rl.qty_requested, rl.qty_issued, i.stock_qty
                           FROM request_lines rl JOIN items i ON i.id = rl.item_id
                           WHERE rl.request_id = ? AND rl.line_status <> 'STORNO'`).all(reqId);
  if (rows.length === 0) return;

  const vsetkoVydane = rows.every(r => r.qty_issued >= r.qty_requested - 1e-9);
  const niecoVydane = rows.some(r => r.qty_issued > 0);
  const chybaTovar = rows.some(r => (r.qty_requested - r.qty_issued) > r.stock_qty + 1e-9);

  const status = vsetkoVydane ? 'VYDANA'
               : niecoVydane ? 'CIASTOCNE_VYDANA'
               : chybaTovar ? 'CAKA_NA_TOVAR'
               : 'SCHVALENA';

  db.prepare(`UPDATE requests SET status=? WHERE id=? AND status NOT IN ('ZAMIETNUTA','STORNO','NOVA')`)
    .run(status, reqId);
}

const schval = db.transaction((reqId, user) => {
  const r = db.prepare('SELECT * FROM requests WHERE id=?').get(reqId);
  if (!r || r.status !== 'NOVA') throw new AppError('Žiadanku už nemožno schváliť.');
  db.prepare(`UPDATE requests SET status='SCHVALENA', approved_by=?,
              approved_at=datetime('now','localtime') WHERE id=?`).run(user.id, reqId);
  prepocitajStav(reqId);

  const sklad = db.prepare(`SELECT email FROM users WHERE role='storekeeper' AND active=1`)
                  .all().map(x => x.email).filter(Boolean);
  if (sklad.length)
    queueMail(sklad, `Žiadanka ${r.number} schválená – pripravte výdaj`,
      `<p>Žiadanku <b>${r.number}</b> schválil ${user.full_name}. Je pripravená na výdaj.</p>`);
});

const zamietni = db.transaction((reqId, user, duvod) => {
  const r = db.prepare('SELECT * FROM requests WHERE id=?').get(reqId);
  if (!r || r.status !== 'NOVA') throw new AppError('Žiadanku už nemožno zamietnuť.');
  db.prepare(`UPDATE requests SET status='ZAMIETNUTA', approved_by=?,
              approved_at=datetime('now','localtime'), reject_note=? WHERE id=?`)
    .run(user.id, duvod || null, reqId);

  const ziadatel = db.prepare('SELECT email FROM users WHERE id=?').get(r.requester_id);
  if (ziadatel?.email)
    queueMail(ziadatel.email, `Žiadanka ${r.number} zamietnutá`,
      `<p>Žiadanku <b>${r.number}</b> zamietol ${user.full_name}.</p>
       <p>Dôvod: ${duvod || '—'}</p>`);
});

const storno = db.transaction((reqId, user) => {
  db.prepare(`UPDATE requests SET status='STORNO' WHERE id=? AND status IN ('NOVA','SCHVALENA','CAKA_NA_TOVAR')`)
    .run(reqId);
});

module.exports = { odosliKosik, prepocitajStav, schval, zamietni, storno, dalsieCislo, rozlozBalik };
