"""Prehlad poloziek pod signalnou zasobou - mirror src/services/alerts.js.
System sam nic neobjednava - len pripravi podklad pre oddelenie, ktore
objednavky u dodavatelov vybavuje."""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime

from .. import config
from .. import db
from .mailer import queue_mail

log = logging.getLogger("alerts")


def otvorene_alerty() -> list[dict]:
    return db.all("""
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
        ORDER BY (i.stock_qty <= 0) DESC, i.code""")


def posli_suhrn() -> int:
    """Denny suhrn pre zodpovedne osoby vo firme."""
    alerty = otvorene_alerty()
    if not alerty:
        return 0

    rows_html = "".join(f"""<tr>
        <td>{a['code']}</td><td>{a['name']}</td><td>{a['location'] or '—'}</td>
        <td align="right">{a['stock_qty']} {a['unit']}</td>
        <td align="right">{a['reorder_point']}</td>
        <td align="right"><b>{a['reorder_qty'] if a['reorder_qty'] is not None else '—'}</b></td>
        <td>{a['supplier_name'] or '—'}{f" ({a['supplier_sku']})" if a['supplier_sku'] else ''}</td>
      </tr>""" for a in alerty)

    html = f"""
      <p>Položky, ktoré klesli na signálnu zásobu alebo pod ňu: <b>{len(alerty)}</b></p>
      <table border="1" cellpadding="4" cellspacing="0">
        <tr><th>Kód</th><th>Položka</th><th>Regál</th><th>Na sklade</th>
            <th>Signálna</th><th>Doobjednať</th><th>Obvyklý dodávateľ</th></tr>
        {rows_html}
      </table>
      <p style="color:#666">Podklad pre doobjednanie. Objednávku vystavuje oddelenie nákupu.</p>"""

    queue_mail(config.MAIL_ALERTS, f"Podklad na doobjednanie – {len(alerty)} položiek", html)
    return len(alerty)


def export_csv() -> str:
    """CSV pre oddelenie nakupu. Bodkociarka + BOM, aby to Excel otvoril spravne."""
    alerty = otvorene_alerty()
    hlavicka = ["Kod", "Nazov", "Kategoria", "Regal", "Na sklade", "Jednotka",
                "Signalna zasoba", "Doobjednat", "Obvykly dodavatel", "Kat. c. dodavatela"]
    riadky = [[
        a["code"], a["name"], a["cat_name"] or "", a["location"] or "", a["stock_qty"], a["unit"],
        a["reorder_point"], a["reorder_qty"] if a["reorder_qty"] is not None else "",
        a["supplier_name"] or "", a["supplier_sku"] or "",
    ] for a in alerty]

    def esc(v) -> str:
        return '"' + str(v).replace('"', '""') + '"'

    lines = [";".join(esc(v) for v in row) for row in [hlavicka, *riadky]]
    return "﻿" + "\r\n".join(lines)


async def digest_loop(tick_s: float = 600.0) -> None:
    """Jednoduchy planovac - raz denne o config.DIGEST_HOUR v pracovny den."""
    poslane_dnes: str | None = None
    while True:
        try:
            now = datetime.now()
            dnes = now.strftime("%Y-%m-%d")
            pracovny_den = now.weekday() <= 4  # Mon=0 .. Fri=4
            if pracovny_den and now.hour == config.DIGEST_HOUR and poslane_dnes != dnes:
                poslane_dnes = dnes
                n = posli_suhrn()
                log.info("digest: podklad na doobjednanie, položiek: %s", n)
        except Exception:
            log.exception("digest zlyhal")
        await asyncio.sleep(tick_s)
