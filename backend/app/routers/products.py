"""Karty produktov a balikov - vidi ich kazdy prihlaseny. Sprava sortimentu je
v routers/admin.py pod /sprava. Mirror src/routes/products.js + src/services/products.js
(cast detailPolozky/detailBalika - CRUD cast je v admin.py, mirror admin.js)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse

from .. import config
from .. import db
from ..deps import require_login
from ..services.stock import stock_state

router = APIRouter(dependencies=[Depends(require_login)], tags=["products"])


def detail_polozky(item_id: int) -> dict | None:
    i = db.get("""SELECT i.*, c.name AS cat_name FROM items i
                  LEFT JOIN categories c ON c.id = i.category_id WHERE i.id = ?""", (item_id,))
    if not i:
        return None

    i["dodavatelia"] = db.all("""SELECT s.id, s.name, s.email, s.phone, s.contact_person,
                                         s.lead_time_days, si.supplier_sku, si.price,
                                         si.min_order_qty, si.is_primary
                                  FROM supplier_items si JOIN suppliers s ON s.id = si.supplier_id
                                  WHERE si.item_id = ? ORDER BY si.is_primary DESC, s.name""", (item_id,))

    i["baliky"] = db.all("""SELECT b.id, b.code, b.name, bi.qty FROM bundle_items bi
                             JOIN bundles b ON b.id = bi.bundle_id
                             WHERE bi.item_id = ? AND b.active = 1 ORDER BY b.code""", (item_id,))

    i["pohyby"] = db.all("""SELECT m.move_type, m.qty, m.created_at, m.note,
                                    u.full_name, rq.number AS ziadanka
                             FROM stock_moves m
                             LEFT JOIN users u ON u.id = m.user_id
                             LEFT JOIN request_lines rl ON rl.id = m.request_line_id
                             LEFT JOIN requests rq ON rq.id = rl.request_id
                             WHERE m.item_id = ? ORDER BY m.id DESC LIMIT 15""", (item_id,))

    # Spotreba za 90 dni - podklad na vypocet signalnej zasoby.
    sp = db.get("""SELECT COALESCE(SUM(-qty), 0) AS spolu FROM stock_moves
                   WHERE item_id = ? AND move_type = 'VYDAJ'
                     AND created_at >= datetime('now','localtime','-90 days')""", (item_id,))
    i["spotreba90"] = sp["spolu"]

    # Mnozstevne cenove pasma z platnych ponuk - podklad, kolko sa oplati objednat.
    i["pasma"] = db.all("""SELECT ql.min_qty, ql.unit_price, ql.note, ql.supplier_sku,
                                   q.number, q.valid_until, s.name AS supplier_name
                            FROM quote_lines ql
                            JOIN quotes q ON q.id = ql.quote_id
                            LEFT JOIN suppliers s ON s.id = q.supplier_id
                            WHERE ql.item_id = ?
                            ORDER BY q.issued_at DESC, ql.min_qty""", (item_id,))

    i["ponuky"] = db.all("""SELECT DISTINCT q.id, q.number, q.issued_at, q.valid_until,
                                    q.file_path, s.name AS supplier_name
                             FROM quote_lines ql JOIN quotes q ON q.id = ql.quote_id
                             LEFT JOIN suppliers s ON s.id = q.supplier_id
                             WHERE ql.item_id = ? ORDER BY q.issued_at DESC""", (item_id,))
    return i


def detail_balika(bundle_id: int) -> dict | None:
    b = db.get("""SELECT b.*, c.name AS cat_name FROM bundles b
                  LEFT JOIN categories c ON c.id = b.category_id WHERE b.id = ?""", (bundle_id,))
    if not b:
        return None
    b["komponenty"] = db.all("""SELECT i.id, i.code, i.name, i.unit, i.stock_qty,
                                        i.reorder_point, i.image_path, bi.qty
                                 FROM bundle_items bi JOIN items i ON i.id = bi.item_id
                                 WHERE bi.bundle_id = ? ORDER BY i.code""", (bundle_id,))
    b["dostupnost"] = (int(min(k["stock_qty"] / k["qty"] for k in b["komponenty"]))
                       if b["komponenty"] else 0)
    return b


@router.get("/produkt/{item_id}")
async def produkt(item_id: int):
    i = detail_polozky(item_id)
    if not i:
        raise HTTPException(status_code=404, detail="Položka neexistuje.")
    i["stav"] = stock_state(i)
    return {"i": i}


@router.get("/balik/{bundle_id}")
async def balik(bundle_id: int):
    b = detail_balika(bundle_id)
    if not b:
        raise HTTPException(status_code=404, detail="Balík neexistuje.")
    for k in b["komponenty"]:
        k["stav"] = stock_state(k)
    return {"b": b}


@router.get("/ponuka/{quote_id}/priloha")
async def ponuka_priloha(quote_id: int):
    q = db.get("SELECT number, file_path FROM quotes WHERE id = ?", (quote_id,))
    if not q or not q["file_path"]:
        raise HTTPException(status_code=404, detail="Ponuka nemá prílohu.")
    subor = config.QUOTES_DIR / q["file_path"]
    if not subor.exists():
        raise HTTPException(status_code=404, detail="Súbor ponuky sa nenašiel.")
    return FileResponse(subor, filename=f"{q['number']}.pdf", media_type="application/pdf")
