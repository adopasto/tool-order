"""Katalog + kosik - mirror src/routes/shop.js."""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel

from .. import db
from ..deps import require_login, set_flash
from ..errors import AppError
from ..services.cart import add_to_cart, clear_cart, get_cart, update_cart_qty
from ..services.requests import odosli_kosik
from ..services.stock import stock_state

router = APIRouter(dependencies=[Depends(require_login)], tags=["shop"])


def _dostupnost_balika(bundle_id: int) -> int:
    """Dostupnost balika = kolko kompletnych sad pokryje sklad."""
    rows = db.all("""SELECT i.stock_qty, bi.qty FROM bundle_items bi
                      JOIN items i ON i.id = bi.item_id WHERE bi.bundle_id = ?""", (bundle_id,))
    if not rows:
        return 0
    return int(min(r["stock_qty"] / r["qty"] for r in rows))


@router.get("/katalog")
async def katalog(cat: Optional[int] = None, q: Optional[str] = None,
                   typ: str = "polozky", zobrazenie: str = "dlazdice"):
    typ = "baliky" if typ == "baliky" else "polozky"
    zobrazenie = "zoznam" if zobrazenie == "zoznam" else "dlazdice"

    kategorie = db.all("""SELECT c.*,
        (SELECT COUNT(*) FROM items i WHERE i.category_id = c.id AND i.active = 1) AS pocet
        FROM categories c ORDER BY c.sort_order, c.name""")
    spolu = db.get("SELECT COUNT(*) c FROM items WHERE active = 1")["c"]

    polozky: list[dict] = []
    baliky: list[dict] = []
    if typ == "baliky":
        baliky = db.all("""SELECT b.*, c.name AS cat_name FROM bundles b
                            LEFT JOIN categories c ON c.id = b.category_id
                            WHERE b.active = 1 AND (? IS NULL OR b.category_id = ?)
                              AND (? IS NULL OR b.name LIKE ? OR b.code LIKE ?)
                            ORDER BY b.code""",
                        (cat, cat, q or None, f"%{q or ''}%", f"%{q or ''}%"))
        for b in baliky:
            b["komponenty"] = db.all("""SELECT i.code, i.name, i.unit, i.stock_qty, bi.qty
                                         FROM bundle_items bi JOIN items i ON i.id = bi.item_id
                                         WHERE bi.bundle_id = ? ORDER BY i.code""", (b["id"],))
            b["dostupnost"] = _dostupnost_balika(b["id"])
    else:
        polozky = db.all("""SELECT i.*, c.name AS cat_name FROM items i
                             LEFT JOIN categories c ON c.id = i.category_id
                             WHERE i.active = 1 AND (? IS NULL OR i.category_id = ?)
                               AND (? IS NULL OR i.name LIKE ? OR i.code LIKE ?
                                    OR i.description LIKE ? OR i.location LIKE ?)
                             ORDER BY i.code""",
                        (cat, cat, q or None, f"%{q or ''}%", f"%{q or ''}%",
                         f"%{q or ''}%", f"%{q or ''}%"))
        for p in polozky:
            p["stav"] = stock_state(p)

    return {
        "kategorie": kategorie, "spolu": spolu, "polozky": polozky, "baliky": baliky,
        "cat": cat, "q": q or "", "typ": typ, "zobrazenie": zobrazenie,
    }


class PridatBody(BaseModel):
    kind: str = "item"
    id: int
    qty: int = 1
    redirect: str = "/katalog"


@router.post("/kosik/pridat")
async def kosik_pridat(request: Request, body: PridatBody, user: dict = Depends(require_login)):
    kind = "bundle" if body.kind == "bundle" else "item"
    qty = max(1, body.qty)
    add_to_cart(user["id"], kind, body.id, qty)
    set_flash(request, "Pridané do košíka.")
    return {"ok": True, "redirect": body.redirect}


@router.get("/kosik")
async def kosik(user: dict = Depends(require_login)):
    riadky = []
    for c in get_cart(user["id"]):
        if c["kind"] == "bundle":
            b = db.get("SELECT * FROM bundles WHERE id=?", (c["id"],))
            komp = db.all("""SELECT i.code, i.name, i.unit, bi.qty FROM bundle_items bi
                              JOIN items i ON i.id = bi.item_id WHERE bi.bundle_id=?""", (c["id"],))
            riadky.append({**c, "nazov": b["name"] if b else None, "kod": b["code"] if b else None,
                           "jednotka": "sada", "foto": None, "komponenty": komp,
                           "dostupnost": _dostupnost_balika(c["id"])})
        else:
            i = db.get("SELECT * FROM items WHERE id=?", (c["id"],))
            riadky.append({**c, "nazov": i["name"] if i else None, "kod": i["code"] if i else None,
                           "jednotka": i["unit"] if i else None, "foto": i["image_path"] if i else None,
                           "sklad": i["stock_qty"] if i else None, "stav": stock_state(i) if i else None})
    return {"riadky": riadky}


class ZmenitBody(BaseModel):
    cartItemId: int
    qty: float


@router.post("/kosik/zmenit")
async def kosik_zmenit(request: Request, body: ZmenitBody, user: dict = Depends(require_login)):
    update_cart_qty(user["id"], body.cartItemId, body.qty)
    return {"ok": True, "redirect": "/kosik"}


@router.post("/kosik/vyprazdnit")
async def kosik_vyprazdnit(request: Request, user: dict = Depends(require_login)):
    clear_cart(user["id"])
    return {"ok": True, "redirect": "/kosik"}


class OdoslatBody(BaseModel):
    note: Optional[str] = None


@router.post("/kosik/odoslat")
async def kosik_odoslat(request: Request, body: OdoslatBody, user: dict = Depends(require_login)):
    try:
        vysledok = odosli_kosik(get_cart(user["id"]), user, body.note)
    except AppError as e:
        set_flash(request, str(e))
        return {"error": str(e), "redirect": "/kosik"}
    clear_cart(user["id"])
    set_flash(request, f"Žiadanka {vysledok['number']} odoslaná na schválenie.")
    return {"ok": True, "redirect": f"/ziadanky/{vysledok['id']}"}
