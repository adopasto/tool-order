'use strict';
const { db } = require('../db');
const cfg = require('../config');
const { queueMail } = require('./mailer');

/**
 * Prehľad položiek pod signálnou zásobou.
 * Systém sám nič neobjednáva - len pripraví podklad pre oddelenie,
 * ktoré objednávky u dodávateľov vybavuje.
 */
function otvoreneAlerty() {
  return db.prepare(`
    SELECT a.id, a.status, a.qty_at_alert, a.created_at,
           i.id AS item_id, i.code, i.name, i.unit, i.stock_qty, i.reorder_point,
           i.reorder_qty, i.location, i.image_path,
           c.name AS cat_name,
           s.name AS supplier_name, s.lead_time_days, si.supplier_sku
    FROM stock_alerts a
    JOIN items i ON i.id = a.item_id
    LEFT JOIN categories c ON c.id = i.category_id
    LEFT JOIN supplier_items si ON si.item_id = i.id AND si.is_primary = 1
    LEFT JOIN suppliers s ON s.id = si.supplier_id
    WHERE a.status = 'OTVORENE'
    ORDER BY (i.stock_qty <= 0) DESC, i.code`).all();
}

/** Denný súhrn pre zodpovedné osoby vo firme. */
function posliSuhrn() {
  const alerty = otvoreneAlerty();
  if (alerty.length === 0) return 0;

  const html = `
    <p>Položky, ktoré klesli na signálnu zásobu alebo pod ňu: <b>${alerty.length}</b></p>
    <table border="1" cellpadding="4" cellspacing="0">
      <tr><th>Kód</th><th>Položka</th><th>Regál</th><th>Na sklade</th>
          <th>Signálna</th><th>Doobjednať</th><th>Obvyklý dodávateľ</th></tr>
      ${alerty.map(a => `<tr>
        <td>${a.code}</td><td>${a.name}</td><td>${a.location ?? '—'}</td>
        <td align="right">${a.stock_qty} ${a.unit}</td>
        <td align="right">${a.reorder_point}</td>
        <td align="right"><b>${a.reorder_qty ?? '—'}</b></td>
        <td>${a.supplier_name ?? '—'}${a.supplier_sku ? ` (${a.supplier_sku})` : ''}</td>
      </tr>`).join('')}
    </table>
    <p style="color:#666">Podklad pre doobjednanie. Objednávku vystavuje oddelenie nákupu.</p>`;

  queueMail(cfg.mailAlerts, `Podklad na doobjednanie – ${alerty.length} položiek`, html);
  return alerty.length;
}

/** CSV pre oddelenie nákupu. Bodkočiarka + BOM, aby to Excel otvoril správne. */
function exportCsv() {
  const alerty = otvoreneAlerty();
  const hlavicka = ['Kod', 'Nazov', 'Kategoria', 'Regal', 'Na sklade', 'Jednotka',
                    'Signalna zasoba', 'Doobjednat', 'Obvykly dodavatel', 'Kat. c. dodavatela'];
  const riadky = alerty.map(a => [
    a.code, a.name, a.cat_name ?? '', a.location ?? '', a.stock_qty, a.unit,
    a.reorder_point, a.reorder_qty ?? '', a.supplier_name ?? '', a.supplier_sku ?? '',
  ]);
  const esc = v => `"${String(v).replace(/"/g, '""')}"`;
  return '\uFEFF' + [hlavicka, ...riadky].map(r => r.map(esc).join(';')).join('\r\n');
}

/** Jednoduchý plánovač - raz denne o cfg.digestHour v pracovný deň. */
function startDigest() {
  let poslaneDnes = null;
  const tick = () => {
    const now = new Date();
    const dnes = now.toISOString().slice(0, 10);
    const pracovnyDen = now.getDay() >= 1 && now.getDay() <= 5;
    if (pracovnyDen && now.getHours() === cfg.digestHour && poslaneDnes !== dnes) {
      poslaneDnes = dnes;
      console.log(`[digest] podklad na doobjednanie, položiek: ${posliSuhrn()}`);
    }
  };
  setInterval(tick, 10 * 60 * 1000).unref();
}

module.exports = { otvoreneAlerty, posliSuhrn, exportCsv, startDigest };
