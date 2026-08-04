"""Ziadanky - cislovanie dokladov, odoslanie kosika, schvalovanie, prepocet
stavu - mirror src/services/requests.js."""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from .. import db
from ..errors import AppError
from .mailer import queue_mail


def dalsie_cislo(doc_type: str = "ZN") -> str:
    """Cislo dokladu s rocnym resetom: ZN-2026-0042. AUTOINCREMENT sa na
    cisla dokladov nehodi - pri rollbacku vznikaju diery."""
    year = datetime.now().year
    db.run("""INSERT INTO doc_counters (doc_type, year, last_no) VALUES (?,?,0)
              ON CONFLICT(doc_type, year) DO NOTHING""", (doc_type, year))
    db.run("UPDATE doc_counters SET last_no = last_no + 1 WHERE doc_type=? AND year=?", (doc_type, year))
    row = db.get("SELECT last_no FROM doc_counters WHERE doc_type=? AND year=?", (doc_type, year))
    return f"{doc_type}-{year}-{str(row['last_no']).zfill(4)}"


def rozloz_balik(bundle_id: int, qty: float) -> list[dict]:
    """Balik nie je skladova polozka - pri odoslani sa rozklada na komponenty."""
    return db.all("SELECT item_id, qty * ? AS qty, ? AS bundle_id FROM bundle_items WHERE bundle_id = ?",
                  (qty, bundle_id, bundle_id))


def odosli_kosik(cart: list[dict], user: dict, note: Optional[str]) -> dict:
    """Odoslanie kosika -> ziadanka. cart = [{kind:'item'|'bundle', id, qty}]"""
    if not cart:
        raise AppError("Košík je prázdny.")

    with db.transaction():
        # 1) rozloz baliky a zluc rovnake polozky
        riadky: dict[str, dict] = {}
        for c in cart:
            zdroje = rozloz_balik(c["id"], c["qty"]) if c["kind"] == "bundle" \
                else [{"item_id": c["id"], "qty": c["qty"], "bundle_id": None}]
            for z in zdroje:
                k = f"{z['item_id']}|{z['bundle_id'] or ''}"
                existing = riadky.get(k)
                riadky[k] = {**z, "qty": (existing["qty"] if existing else 0) + float(z["qty"])}

        number = dalsie_cislo("ZN")
        req_id = db.run("""INSERT INTO requests (number, requester_id, cost_center, note)
                            VALUES (?,?,?,?)""",
                        (number, user["id"], user["cost_center"], note or None))["lastrowid"]

        for r in riadky.values():
            db.run("""INSERT INTO request_lines (request_id, item_id, bundle_id, qty_requested)
                       VALUES (?,?,?,?)""", (req_id, r["item_id"], r["bundle_id"], r["qty"]))

        # 2) notifikacia schvalovatelom strediska (fallback: vsetci schvalovatelia)
        prijemcovia = [x["email"] for x in db.all(
            "SELECT email FROM users WHERE role='approver' AND active=1 AND cost_center = ?",
            (user["cost_center"],)) if x["email"]]
        if not prijemcovia:
            prijemcovia = [x["email"] for x in db.all(
                "SELECT email FROM users WHERE role='approver' AND active=1") if x["email"]]

        detail = db.all("""SELECT i.code, i.name, rl.qty_requested, i.unit
                            FROM request_lines rl JOIN items i ON i.id = rl.item_id
                            WHERE rl.request_id = ?""", (req_id,))

        if prijemcovia:
            rows_html = "".join(
                f"<tr><td>{d['code']}</td><td>{d['name']}</td>"
                f"<td align='right'>{d['qty_requested']} {d['unit']}</td></tr>" for d in detail)
            queue_mail(prijemcovia, f"Nová žiadanka {number} – {user['full_name']}",
                       f"""<p>Žiadateľ: <b>{user['full_name']}</b> ({user['cost_center'] or '—'})</p>
                           {f"<p>Poznámka: {note}</p>" if note else ''}
                           <table border="1" cellpadding="4" cellspacing="0">
                             <tr><th>Kód</th><th>Položka</th><th>Množstvo</th></tr>{rows_html}
                           </table>""")

        return {"id": req_id, "number": number}


def prepocitaj_stav(req_id: int) -> None:
    """Prepocet hlavicky podla riadkov - vola sa po kazdom vydaji."""
    rows = db.all("""SELECT rl.qty_requested, rl.qty_issued, i.stock_qty
                      FROM request_lines rl JOIN items i ON i.id = rl.item_id
                      WHERE rl.request_id = ? AND rl.line_status <> 'STORNO'""", (req_id,))
    if not rows:
        return

    vsetko_vydane = all(r["qty_issued"] >= r["qty_requested"] - 1e-9 for r in rows)
    nieco_vydane = any(r["qty_issued"] > 0 for r in rows)
    chyba_tovar = any((r["qty_requested"] - r["qty_issued"]) > r["stock_qty"] + 1e-9 for r in rows)

    status = ("VYDANA" if vsetko_vydane else
              "CIASTOCNE_VYDANA" if nieco_vydane else
              "CAKA_NA_TOVAR" if chyba_tovar else
              "SCHVALENA")

    db.run("""UPDATE requests SET status=? WHERE id=? AND status NOT IN ('ZAMIETNUTA','STORNO','NOVA')""",
           (status, req_id))


def schval(req_id: int, user: dict) -> None:
    with db.transaction():
        r = db.get("SELECT * FROM requests WHERE id=?", (req_id,))
        if not r or r["status"] != "NOVA":
            raise AppError("Žiadanku už nemožno schváliť.")
        db.run("""UPDATE requests SET status='SCHVALENA', approved_by=?,
                   approved_at=datetime('now','localtime') WHERE id=?""", (user["id"], req_id))
        prepocitaj_stav(req_id)

        sklad = [x["email"] for x in db.all(
            "SELECT email FROM users WHERE role='storekeeper' AND active=1") if x["email"]]
        if sklad:
            queue_mail(sklad, f"Žiadanka {r['number']} schválená – pripravte výdaj",
                       f"<p>Žiadanku <b>{r['number']}</b> schválil {user['full_name']}. "
                       f"Je pripravená na výdaj.</p>")


def zamietni(req_id: int, user: dict, duvod: Optional[str]) -> None:
    with db.transaction():
        r = db.get("SELECT * FROM requests WHERE id=?", (req_id,))
        if not r or r["status"] != "NOVA":
            raise AppError("Žiadanku už nemožno zamietnuť.")
        db.run("""UPDATE requests SET status='ZAMIETNUTA', approved_by=?,
                   approved_at=datetime('now','localtime'), reject_note=? WHERE id=?""",
               (user["id"], duvod or None, req_id))

        ziadatel = db.get("SELECT email FROM users WHERE id=?", (r["requester_id"],))
        if ziadatel and ziadatel["email"]:
            queue_mail(ziadatel["email"], f"Žiadanka {r['number']} zamietnutá",
                       f"<p>Žiadanku <b>{r['number']}</b> zamietol {user['full_name']}.</p>"
                       f"<p>Dôvod: {duvod or '—'}</p>")


def oznam_vydaj(req_id: int, lines: list[dict]) -> None:
    """Notifikacia ziadatelovi po (ciastocnom) vydani - lines = [{requestLineId, qty}]
    prave vydane v tejto akcii. Vola sa po vydaj() + prepocitaj_stav()."""
    r = db.get("""SELECT rq.number, rq.status, us.email
                  FROM requests rq JOIN users us ON us.id = rq.requester_id
                  WHERE rq.id=?""", (req_id,))
    if not r or not r["email"] or not lines:
        return

    ids = [l["requestLineId"] for l in lines]
    qty_by_id = {l["requestLineId"]: l["qty"] for l in lines}
    riadky = db.all(
        f"""SELECT rl.id, i.code, i.name, i.unit FROM request_lines rl
            JOIN items i ON i.id = rl.item_id
            WHERE rl.id IN ({",".join("?" * len(ids))})""", ids)

    stav_text = "vydaná v plnom rozsahu" if r["status"] == "VYDANA" else "čiastočne vydaná"
    rows_html = "".join(
        f"<tr><td>{x['code']}</td><td>{x['name']}</td>"
        f"<td align='right'>{qty_by_id.get(x['id'], 0)} {x['unit']}</td></tr>" for x in riadky)

    queue_mail(r["email"], f"Žiadanka {r['number']} – {stav_text}",
               f"""<p>Vaša žiadanka <b>{r['number']}</b> bola {stav_text}. Môžete si vyzdvihnúť:</p>
                   <table border="1" cellpadding="4" cellspacing="0">
                     <tr><th>Kód</th><th>Položka</th><th>Vydané množstvo</th></tr>{rows_html}
                   </table>""")


def storno(req_id: int, user: dict) -> None:
    with db.transaction():
        r = db.get("SELECT * FROM requests WHERE id=?", (req_id,))
        if not r:
            return
        vysledok = db.run("""UPDATE requests SET status='STORNO'
                              WHERE id=? AND status IN ('NOVA','SCHVALENA','CAKA_NA_TOVAR')""", (req_id,))
        if vysledok["changes"] == 0:
            return

        prijemcovia = [x["email"] for x in db.all(
            """SELECT email FROM users WHERE active=1
               AND ((role='approver' AND cost_center=?) OR role='storekeeper')""",
            (r["cost_center"],)) if x["email"]]
        if prijemcovia:
            queue_mail(prijemcovia, f"Žiadanka {r['number']} stornovaná",
                       f"<p>Žiadanku <b>{r['number']}</b> stornoval {user['full_name']} "
                       f"({user['roleLabel']}).</p>")
