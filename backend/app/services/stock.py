"""Prijem/vydaj/korekcia skladu + kontrola signalnej zasoby - mirror
src/services/stock.js. Kazda operacia je jedna DB transakcia."""
from __future__ import annotations

from typing import Optional

from .. import config
from .. import db
from ..errors import AppError
from .mailer import queue_mail


def _pohyb(item_id: int, move_type: str, qty: float, *, request_line_id: Optional[int] = None,
           supplier_id: Optional[int] = None, user_id: Optional[int] = None,
           note: Optional[str] = None) -> None:
    db.run("""INSERT INTO stock_moves
              (item_id, move_type, qty, request_line_id, supplier_id, user_id, note)
              VALUES (?,?,?,?,?,?,?)""",
           (item_id, move_type, qty, request_line_id, supplier_id, user_id, note))


def check_reorder(item_id: int) -> None:
    """Kontrola signalnej zasoby. Bezi v tej istej transakcii ako pohyb -
    upozornenie tak nemoze "vypadnut" pri chybe zapisu. Ciastocny unikatny
    index ux_alert_open zabrani duplicitam."""
    it = db.get("SELECT * FROM items WHERE id = ?", (item_id,))
    if not it:
        return

    if float(it["stock_qty"]) > float(it["reorder_point"]):
        db.run("""UPDATE stock_alerts SET status='VYRIESENE', resolved_at=datetime('now','localtime')
                   WHERE item_id=? AND status<>'VYRIESENE'""", (item_id,))
        return

    otvorene = db.get("SELECT id FROM stock_alerts WHERE item_id=? AND status<>'VYRIESENE'", (item_id,))
    if otvorene:
        return  # upozornenie uz bezi, neposielaj druhy mail

    db.run("INSERT INTO stock_alerts (item_id, qty_at_alert) VALUES (?,?)", (item_id, it["stock_qty"]))

    # Dodavatel je tu len ako referencia pre oddelenie, ktore objednava -
    # tento system sam nic neobjednava.
    dod = db.get("""SELECT s.name, s.lead_time_days, si.supplier_sku
                     FROM supplier_items si JOIN suppliers s ON s.id = si.supplier_id
                     WHERE si.item_id = ? AND si.is_primary = 1""", (item_id,))

    dod_html = (f"<p>Obvyklý dodávateľ (pre oddelenie nákupu): {dod['name']}, "
                f"kat. č. {dod['supplier_sku'] or '—'}, dodanie ~{dod['lead_time_days']} dní.</p>") if dod else ""

    queue_mail(config.MAIL_ALERTS,
               f"Nízka zásoba: {it['code']} – {it['name']}",
               f"""<p>Položka <b>{it['code']} – {it['name']}</b> klesla na <b>{it['stock_qty']} {it['unit']}</b>
                    (signálna zásoba {it['reorder_point']} {it['unit']}).</p>
                   <p>Odporúčané doobjednať: <b>{it['reorder_qty'] if it['reorder_qty'] is not None else '—'} {it['unit']}</b><br>
                    Umiestnenie: {it['location'] or '—'}</p>{dod_html}""")


def prijem(item_id: int, qty: float, supplier_id: Optional[int], user_id: int, note: Optional[str]) -> None:
    """Prijem na sklad (nakup / vratka)."""
    if not (qty > 0):
        raise AppError("Množstvo príjmu musí byť kladné.")
    with db.transaction():
        _pohyb(item_id, "PRIJEM", qty, supplier_id=supplier_id, user_id=user_id, note=note)
        check_reorder(item_id)


def korekcia(item_id: int, new_qty: float, user_id: int, note: Optional[str], typ: str = "INVENTURA") -> None:
    """Korekcia / inventura - rozdiel oproti aktualnemu stavu."""
    with db.transaction():
        it = db.get("SELECT * FROM items WHERE id = ?", (item_id,))
        if not it:
            raise AppError("Položka neexistuje.")
        rozdiel = float(new_qty) - float(it["stock_qty"])
        if rozdiel == 0:
            return
        _pohyb(item_id, typ, rozdiel, user_id=user_id, note=note or f"Oprava stavu na {new_qty}")
        check_reorder(item_id)


def vydaj(lines: list[dict], user_id: int) -> None:
    """Vydaj na ziadanku. Prechadza riadky, kontroluje kryciu zasobu a
    zapisuje pohyby. V SQLite serializuje zapisy _lock; v PostgreSQL sem
    patri SELECT ... FOR UPDATE."""
    with db.transaction():
        for l in lines:
            qty = float(l["qty"])
            if not (qty > 0):
                continue

            rl = db.get("SELECT * FROM request_lines WHERE id = ?", (l["requestLineId"],))
            if not rl:
                raise AppError("Riadok žiadanky neexistuje.")

            zostava = float(rl["qty_requested"]) - float(rl["qty_issued"])
            if qty > zostava + 1e-9:
                raise AppError(f"Nemožno vydať viac, než je požadované (zostáva {zostava}).")

            it = db.get("SELECT * FROM items WHERE id = ?", (rl["item_id"],))
            if float(it["stock_qty"]) < qty - 1e-9:
                raise AppError(f"Nedostatok zásoby: {it['code']} – na sklade {it['stock_qty']} {it['unit']}.")

            _pohyb(rl["item_id"], "VYDAJ", -qty, request_line_id=rl["id"], user_id=user_id)

            vydane = float(rl["qty_issued"]) + qty
            novy_status = "VYDANA" if vydane >= float(rl["qty_requested"]) - 1e-9 else "CIASTOCNE"
            db.run("UPDATE request_lines SET qty_issued=?, line_status=? WHERE id=?",
                   (vydane, novy_status, rl["id"]))

            check_reorder(rl["item_id"])


def stock_state(item: dict) -> str:
    """Farebny stav zasoby pre katalog."""
    q, rop = float(item["stock_qty"]), float(item["reorder_point"])
    if q <= 0:
        return "nula"
    if q <= rop:
        return "nizka"
    return "ok"
