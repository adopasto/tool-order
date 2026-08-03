'use strict';
const { db } = require('../db');
const cfg = require('../config');
const { queueMail } = require('./mailer');

class AppError extends Error {}

const qItem = db.prepare('SELECT * FROM items WHERE id = ?');
const insMove = db.prepare(`INSERT INTO stock_moves
  (item_id, move_type, qty, request_line_id, supplier_id, user_id, note)
  VALUES (@item_id, @move_type, @qty, @request_line_id, @supplier_id, @user_id, @note)`);

function pohyb(o) {
  insMove.run({
    item_id: o.itemId, move_type: o.type, qty: o.qty,
    request_line_id: o.requestLineId ?? null, supplier_id: o.supplierId ?? null,
    user_id: o.userId ?? null, note: o.note ?? null,
  });
}

/**
 * Kontrola signalnej zasoby. Bezi v tej istej transakcii ako pohyb -
 * upozornenie tak nemoze "vypadnut" pri chybe zapisu.
 * Ciastocny unikatny index ux_alert_open zabrani duplicitam.
 */
function checkReorder(itemId) {
  const it = qItem.get(itemId);
  if (!it) return;

  if (Number(it.stock_qty) > Number(it.reorder_point)) {
    // Zasoba je nad signalnou hranicou -> uzavri pripadne otvorene upozornenie.
    db.prepare(`UPDATE stock_alerts
                SET status='VYRIESENE', resolved_at=datetime('now','localtime')
                WHERE item_id=? AND status<>'VYRIESENE'`).run(itemId);
    return;
  }

  const otvorene = db.prepare(`SELECT id FROM stock_alerts
                               WHERE item_id=? AND status<>'VYRIESENE'`).get(itemId);
  if (otvorene) return;   // upozornenie uz bezi, neposielaj druhy mail

  db.prepare('INSERT INTO stock_alerts (item_id, qty_at_alert) VALUES (?,?)')
    .run(itemId, it.stock_qty);

  // Dodávateľ je tu len ako referencia pre oddelenie, ktoré objednáva -
  // tento systém sám nič neobjednáva.
  const dod = db.prepare(`SELECT s.name, s.lead_time_days, si.supplier_sku
                          FROM supplier_items si JOIN suppliers s ON s.id = si.supplier_id
                          WHERE si.item_id = ? AND si.is_primary = 1`).get(itemId);

  queueMail(cfg.mailAlerts,
    `Nízka zásoba: ${it.code} – ${it.name}`,
    `<p>Položka <b>${it.code} – ${it.name}</b> klesla na <b>${it.stock_qty} ${it.unit}</b>
      (signálna zásoba ${it.reorder_point} ${it.unit}).</p>
     <p>Odporúčané doobjednať: <b>${it.reorder_qty ?? '—'} ${it.unit}</b><br>
      Umiestnenie: ${it.location ?? '—'}</p>
     ${dod ? `<p>Obvyklý dodávateľ (pre oddelenie nákupu): ${dod.name},
      kat. č. ${dod.supplier_sku ?? '—'}, dodanie ~${dod.lead_time_days} dní.</p>` : ''}`);
}

/** Prijem na sklad (nakup / vratka). */
const prijem = db.transaction(({ itemId, qty, supplierId, userId, note }) => {
  if (!(qty > 0)) throw new AppError('Množstvo príjmu musí byť kladné.');
  pohyb({ itemId, type: 'PRIJEM', qty, supplierId, userId, note });
  checkReorder(itemId);
});

/** Korekcia / inventura - rozdiel oproti aktualnemu stavu. */
const korekcia = db.transaction(({ itemId, newQty, userId, note, type = 'INVENTURA' }) => {
  const it = qItem.get(itemId);
  if (!it) throw new AppError('Položka neexistuje.');
  const rozdiel = Number(newQty) - Number(it.stock_qty);
  if (rozdiel === 0) return;
  pohyb({ itemId, type, qty: rozdiel, userId, note: note || `Oprava stavu na ${newQty}` });
  checkReorder(itemId);
});

/**
 * Vydaj na ziadanku. Prechadza riadky, kontroluje kryciu zasobu a zapisuje pohyby.
 * V SQLite serializuje zapisy sam engine; v PostgreSQL sem patri SELECT ... FOR UPDATE.
 */
const vydaj = db.transaction((lines, userId) => {
  for (const l of lines) {
    const qty = Number(l.qty);
    if (!(qty > 0)) continue;

    const rl = db.prepare('SELECT * FROM request_lines WHERE id = ?').get(l.requestLineId);
    if (!rl) throw new AppError('Riadok žiadanky neexistuje.');

    const zostava = Number(rl.qty_requested) - Number(rl.qty_issued);
    if (qty > zostava + 1e-9)
      throw new AppError(`Nemožno vydať viac, než je požadované (zostáva ${zostava}).`);

    const it = qItem.get(rl.item_id);
    if (Number(it.stock_qty) < qty - 1e-9)
      throw new AppError(`Nedostatok zásoby: ${it.code} – na sklade ${it.stock_qty} ${it.unit}.`);

    pohyb({ itemId: rl.item_id, type: 'VYDAJ', qty: -qty, requestLineId: rl.id, userId });

    const vydane = Number(rl.qty_issued) + qty;
    db.prepare(`UPDATE request_lines SET qty_issued=?, line_status=?
                WHERE id=?`)
      .run(vydane, vydane >= Number(rl.qty_requested) - 1e-9 ? 'VYDANA' : 'CIASTOCNE', rl.id);

    checkReorder(rl.item_id);
  }
});

/** Farebny stav zasoby pre katalog. */
function stockState(item) {
  const q = Number(item.stock_qty), rop = Number(item.reorder_point);
  if (q <= 0) return 'nula';
  if (q <= rop) return 'nizka';
  return 'ok';
}

module.exports = { prijem, korekcia, vydaj, checkReorder, stockState, AppError };
