"""Sklad (stav/prijem/inventura/pohyby/doobjednat) + dodavatelia - mirror
src/routes/warehouse.js."""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel

from .. import db
from ..deps import require_login, require_role, set_flash
from ..errors import AppError
from ..services.alerts import export_csv, otvorene_alerty, posli_suhrn
from ..services.stock import korekcia, prijem, stock_state

router = APIRouter(dependencies=[Depends(require_login)], tags=["warehouse"])


def _sklad_data(q: str) -> dict:
    """Sklad ma jednu stranku so zalozkami - mirror zobrazSklad() v routes/warehouse.js."""
    polozky = db.all("""SELECT i.*, c.name AS cat_name FROM items i
                        LEFT JOIN categories c ON c.id = i.category_id
                        WHERE i.active = 1
                          AND (? = '' OR i.code LIKE ? OR i.name LIKE ? OR i.location LIKE ?)
                        ORDER BY i.code""", (q, f"%{q}%", f"%{q}%", f"%{q}%"))
    for p in polozky:
        p["stav"] = stock_state(p)

    pohyby = db.all("""SELECT m.*, i.code, i.name, i.unit, u.full_name,
                               rq.number AS ziadanka
                        FROM stock_moves m JOIN items i ON i.id = m.item_id
                        LEFT JOIN users u ON u.id = m.user_id
                        LEFT JOIN request_lines rl ON rl.id = m.request_line_id
                        LEFT JOIN requests rq ON rq.id = rl.request_id
                        ORDER BY m.id DESC LIMIT 100""")

    return {
        "q": q, "polozky": polozky, "pohyby": pohyby,
        "alerty": otvorene_alerty(),
        "dodavatelia": db.all("SELECT id, name FROM suppliers WHERE active=1 ORDER BY name"),
    }


@router.get("/sklad")
async def sklad(tab: str = "stav", q: str = "", user: dict = Depends(require_role("storekeeper", "buyer"))):
    povolene = ("stav", "prijem", "inventura", "pohyby")
    return {"zalozka": tab if tab in povolene else "stav", **_sklad_data(q.strip())}


@router.get("/sklad/doobjednat")
async def sklad_doobjednat(q: str = "", user: dict = Depends(require_role("storekeeper", "buyer"))):
    return {"zalozka": "doobjednat", **_sklad_data(q.strip())}


class PrijemBody(BaseModel):
    item_id: int
    qty: float
    supplier_id: Optional[int] = None
    note: Optional[str] = None


@router.post("/sklad/prijem")
async def sklad_prijem(request: Request, body: PrijemBody, user: dict = Depends(require_role("storekeeper"))):
    try:
        prijem(body.item_id, body.qty, body.supplier_id, user["id"], body.note)
        set_flash(request, "Príjem zaevidovaný.")
    except AppError as e:
        set_flash(request, str(e))
    return {"ok": True, "redirect": "/sklad?tab=prijem"}


class KorekciaBody(BaseModel):
    item_id: int
    new_qty: float
    note: Optional[str] = None
    typ: str = "INVENTURA"


@router.post("/sklad/korekcia")
async def sklad_korekcia(request: Request, body: KorekciaBody, user: dict = Depends(require_role("storekeeper"))):
    try:
        korekcia(body.item_id, body.new_qty, user["id"], body.note,
                "KOREKCIA" if body.typ == "KOREKCIA" else "INVENTURA")
        set_flash(request, "Stav upravený.")
    except AppError as e:
        set_flash(request, str(e))
    return {"ok": True, "redirect": "/sklad?tab=inventura"}


@router.post("/sklad/doobjednat/suhrn")
async def sklad_doobjednat_suhrn(request: Request, user: dict = Depends(require_role("storekeeper", "buyer"))):
    n = posli_suhrn()
    set_flash(request, f"Podklad na doobjednanie odoslaný ({n} položiek)." if n
              else "Žiadne položky pod signálnou zásobou.")
    return {"ok": True, "redirect": "/sklad/doobjednat"}


@router.get("/sklad/doobjednat/export.csv")
async def sklad_export_csv(user: dict = Depends(require_role("storekeeper", "buyer"))):
    from datetime import date
    datum = date.today().isoformat()
    return Response(
        content=export_csv(), media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="doobjednat-{datum}.csv"'})


# Stare adresy nech nekoncia na 404.
@router.get("/upozornenia")
async def upozornenia_redirect():
    return {"redirect": "/sklad/doobjednat"}


@router.get("/sklad/karta/{item_id}")
async def sklad_karta_redirect(item_id: int):
    return {"redirect": f"/produkt/{item_id}"}


# ---------------- DODAVATELIA ----------------

@router.get("/dodavatelia")
async def dodavatelia():
    zoznam = db.all("""SELECT s.*,
        (SELECT COUNT(*) FROM supplier_items si WHERE si.supplier_id = s.id) AS pocet_poloziek
        FROM suppliers s WHERE s.active = 1 ORDER BY s.name""")
    return {"dodavatelia": zoznam}


@router.get("/dodavatelia/{supplier_id}")
async def dodavatel_detail(supplier_id: int):
    d = db.get("SELECT * FROM suppliers WHERE id=?", (supplier_id,))
    if not d:
        raise HTTPException(status_code=404, detail="Dodávateľ neexistuje.")
    polozky = db.all("""SELECT i.*, si.supplier_sku, si.price, si.min_order_qty, si.is_primary
                        FROM supplier_items si JOIN items i ON i.id = si.item_id
                        WHERE si.supplier_id = ? ORDER BY i.code""", (supplier_id,))
    for p in polozky:
        p["stav"] = stock_state(p)
    ponuky = db.all("""SELECT q.*,
        (SELECT COUNT(*) FROM quote_lines ql WHERE ql.quote_id = q.id) AS riadkov
        FROM quotes q WHERE q.supplier_id = ? ORDER BY q.issued_at DESC""", (supplier_id,))
    return {"d": d, "polozky": polozky, "ponuky": ponuky}
