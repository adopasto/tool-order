"""Sprava sortimentu pod /sprava - polozky, baliky, kategorie, dodavatelia,
fotky - mirror src/routes/admin.js. Sortiment spravuje sklad aj administrator."""
from __future__ import annotations

import sqlite3
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from pydantic import BaseModel

from .. import db
from ..deps import require_role, set_flash
from ..errors import AppError
from ..services.photos import skenuj_priecinok, uloz_foto, zmaz_foto
from ..services.stock import stock_state

router = APIRouter(dependencies=[Depends(require_role("admin", "storekeeper"))],
                   prefix="/sprava", tags=["admin"])


def _nn(v) -> Optional[str]:
    """Prevedie prazdny retazec na None, aby v DB neboli prazdne texty."""
    if v is None or str(v).strip() == "":
        return None
    return str(v).strip()


def _chyba_db(e: Exception) -> str:
    msg = str(e)
    if "UNIQUE" in msg and "code" in msg:
        return "Kód už existuje, zvoľte iný."
    return f"Nepodarilo sa uložiť: {msg}"


# ==================== ROZCESTNIK ====================

@router.get("")
async def sprava():
    p = db.get("SELECT COUNT(*) c, SUM(active) a FROM items")
    return {"pocty": {
        "polozky": p["c"], "aktivne": p["a"],
        "bezFotky": db.get("SELECT COUNT(*) c FROM items WHERE image_path IS NULL AND active=1")["c"],
        "baliky": db.get("SELECT COUNT(*) c FROM bundles")["c"],
        "kategorie": db.get("SELECT COUNT(*) c FROM categories")["c"],
        "dodavatelia": db.get("SELECT COUNT(*) c FROM suppliers WHERE active=1")["c"],
    }}


# ==================== POLOZKY ====================

@router.get("/polozky")
async def polozky_list(q: Optional[str] = None):
    q = _nn(q)
    zoznam = db.all("""SELECT i.*, c.name AS cat_name FROM items i
                        LEFT JOIN categories c ON c.id = i.category_id
                        WHERE (? IS NULL OR i.code LIKE ? OR i.name LIKE ?)
                        ORDER BY i.code""", (q, f"%{q or ''}%", f"%{q or ''}%"))
    for p in zoznam:
        p["stav"] = stock_state(p)
    return {"polozky": zoznam, "q": q or ""}


@router.get("/polozka/nova")
async def polozka_novy_form():
    return {
        "p": {"unit": "ks", "reorder_point": 5, "active": 1, "is_esd": 0},
        "kategorie": db.all("SELECT * FROM categories ORDER BY sort_order, name"),
        "dodavatelia": [], "vsetciDodavatelia": [], "novy": True, "chyba": None,
    }


class PolozkaBody(BaseModel):
    code: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None
    category_id: Optional[int] = None
    unit: Optional[str] = None
    reorder_point: Optional[float] = 0
    reorder_qty: Optional[float] = None
    location: Optional[str] = None
    is_esd: bool = False
    active: bool = True
    pociatocny_stav: Optional[float] = 0


@router.post("/polozka/nova")
async def polozka_novy_submit(request: Request, body: PolozkaBody, user: dict = Depends(require_role("admin", "storekeeper"))):
    try:
        item_id = db.run("""INSERT INTO items
            (code, name, description, category_id, unit, reorder_point, reorder_qty, location, is_esd, active)
            VALUES (?,?,?,?,?,?,?,?,?,?)""",
            (_nn(body.code), _nn(body.name), _nn(body.description), body.category_id,
             _nn(body.unit) or "ks", body.reorder_point or 0, body.reorder_qty,
             _nn(body.location), int(body.is_esd), int(body.active)))["lastrowid"]

        # Pociatocny stav sa zapisuje ako pohyb, nie ako hodnota v items.
        if (body.pociatocny_stav or 0) > 0:
            db.run("""INSERT INTO stock_moves (item_id, move_type, qty, user_id, note)
                       VALUES (?, 'INVENTURA', ?, ?, 'Založenie položky')""",
                   (item_id, body.pociatocny_stav, user["id"]))

        set_flash(request, "Položka založená. Doplňte fotku a dodávateľov.")
        return {"ok": True, "redirect": f"/sprava/polozka/{item_id}"}
    except sqlite3.IntegrityError as e:
        set_flash(request, _chyba_db(e))
        return {"error": _chyba_db(e), "redirect": "/sprava/polozka/nova"}


def _formular_polozky(item_id: int) -> dict:
    p = db.get("SELECT * FROM items WHERE id = ?", (item_id,))
    if not p:
        raise HTTPException(status_code=404, detail="Položka neexistuje.")
    return {
        "p": p,
        "kategorie": db.all("SELECT * FROM categories ORDER BY sort_order, name"),
        "dodavatelia": db.all("""SELECT s.id, s.name, si.supplier_sku, si.price, si.min_order_qty, si.is_primary
                                  FROM supplier_items si JOIN suppliers s ON s.id = si.supplier_id
                                  WHERE si.item_id = ? ORDER BY si.is_primary DESC, s.name""", (p["id"],)),
        "vsetciDodavatelia": db.all("SELECT id, name FROM suppliers WHERE active = 1 ORDER BY name"),
        "novy": False, "chyba": None,
    }


@router.get("/polozka/{item_id}")
async def polozka_form(item_id: int):
    return _formular_polozky(item_id)


@router.post("/polozka/{item_id}")
async def polozka_update(request: Request, item_id: int, body: PolozkaBody):
    try:
        db.run("""UPDATE items SET code=?, name=?, description=?, category_id=?, unit=?,
                   reorder_point=?, reorder_qty=?, location=?, is_esd=?, active=? WHERE id=?""",
               (_nn(body.code), _nn(body.name), _nn(body.description), body.category_id,
                _nn(body.unit) or "ks", body.reorder_point or 0, body.reorder_qty,
                _nn(body.location), int(body.is_esd), int(body.active), item_id))
        set_flash(request, "Zmeny uložené.")
        return {"ok": True, "redirect": f"/sprava/polozka/{item_id}"}
    except sqlite3.IntegrityError as e:
        set_flash(request, _chyba_db(e))
        return {"error": _chyba_db(e), "redirect": f"/sprava/polozka/{item_id}"}


@router.post("/polozka/{item_id}/zmazat")
async def polozka_zmazat(request: Request, item_id: int):
    """Zmazat sa da len polozka bez historie. Inak sa deaktivuje."""
    pohyby = db.get("SELECT COUNT(*) c FROM stock_moves WHERE item_id=?", (item_id,))["c"]
    riadky = db.get("SELECT COUNT(*) c FROM request_lines WHERE item_id=?", (item_id,))["c"]

    if pohyby or riadky:
        db.run("UPDATE items SET active = 0 WHERE id = ?", (item_id,))
        set_flash(request, "Položka má históriu, preto bola len deaktivovaná – zostáva v evidencii.")
        return {"ok": True, "redirect": "/sprava/polozky"}

    with db.transaction():
        zmaz_foto(item_id)
        db.run("DELETE FROM supplier_items WHERE item_id=?", (item_id,))
        db.run("DELETE FROM bundle_items WHERE item_id=?", (item_id,))
        db.run("DELETE FROM stock_alerts WHERE item_id=?", (item_id,))
        db.run("DELETE FROM items WHERE id=?", (item_id,))
    set_flash(request, "Položka zmazaná.")
    return {"ok": True, "redirect": "/sprava/polozky"}


# ---- fotky ----

@router.post("/polozka/{item_id}/foto")
async def polozka_foto(request: Request, item_id: int, foto: UploadFile = File(...)):
    try:
        content = await foto.read()
        uloz_foto(item_id, content, foto.filename or "")
        set_flash(request, "Fotka uložená.")
    except AppError as e:
        set_flash(request, f"Fotku sa nepodarilo nahrať: {e}")
    return {"ok": True, "redirect": f"/sprava/polozky"}


@router.post("/polozka/{item_id}/foto/zmazat")
async def polozka_foto_zmazat(request: Request, item_id: int):
    zmaz_foto(item_id)
    set_flash(request, "Fotka odstránená.")
    return {"ok": True, "redirect": "/sprava/polozky"}


@router.post("/fotky/skenovat")
async def fotky_skenovat(request: Request):
    r = skenuj_priecinok()
    msg = f"Priradených fotiek: {r['spojene']}."
    if r["nespojene"]:
        msg += f" Bez zhody s kódom položky: {', '.join(r['nespojene'])}"
    set_flash(request, msg)
    return {"ok": True, "redirect": "/sprava/polozky"}


# ---- dodavatelia polozky ----

class DodavatelPriradBody(BaseModel):
    supplier_id: int
    supplier_sku: Optional[str] = None
    price: Optional[float] = None
    min_order_qty: Optional[float] = 1
    is_primary: bool = False


@router.post("/polozka/{item_id}/dodavatel")
async def polozka_dodavatel_pridat(request: Request, item_id: int, body: DodavatelPriradBody):
    try:
        with db.transaction():
            if body.is_primary:
                db.run("UPDATE supplier_items SET is_primary=0 WHERE item_id=?", (item_id,))
            db.run("""INSERT INTO supplier_items
                (supplier_id, item_id, supplier_sku, price, min_order_qty, is_primary)
                VALUES (?,?,?,?,?,?)
                ON CONFLICT(supplier_id, item_id) DO UPDATE SET
                  supplier_sku=excluded.supplier_sku, price=excluded.price,
                  min_order_qty=excluded.min_order_qty, is_primary=excluded.is_primary""",
                (body.supplier_id, item_id, _nn(body.supplier_sku), body.price,
                 body.min_order_qty or 1, int(body.is_primary)))
        set_flash(request, "Dodávateľ priradený.")
    except sqlite3.IntegrityError as e:
        set_flash(request, _chyba_db(e))
    return {"ok": True, "redirect": f"/sprava/polozka/{item_id}"}


@router.post("/polozka/{item_id}/dodavatel/{supplier_id}/zmazat")
async def polozka_dodavatel_zmazat(request: Request, item_id: int, supplier_id: int):
    db.run("DELETE FROM supplier_items WHERE item_id=? AND supplier_id=?", (item_id, supplier_id))
    set_flash(request, "Väzba na dodávateľa zrušená.")
    return {"ok": True, "redirect": f"/sprava/polozka/{item_id}"}


# ==================== KATEGORIE ====================

@router.get("/kategorie")
async def kategorie_list():
    zoznam = db.all("""SELECT c.*,
        (SELECT COUNT(*) FROM items i WHERE i.category_id = c.id) AS pocet_poloziek,
        (SELECT COUNT(*) FROM bundles b WHERE b.category_id = c.id) AS pocet_balikov
        FROM categories c ORDER BY c.sort_order, c.name""")
    return {"kategorie": zoznam}


class KategoriaBody(BaseModel):
    name: Optional[str] = None
    sort_order: Optional[int] = 0


@router.post("/kategorie")
async def kategoria_pridat(request: Request, body: KategoriaBody):
    db.run("INSERT INTO categories (name, sort_order) VALUES (?,?)",
           (_nn(body.name), body.sort_order or 0))
    set_flash(request, "Kategória pridaná.")
    return {"ok": True, "redirect": "/sprava/kategorie"}


@router.post("/kategoria/{cat_id}")
async def kategoria_update(request: Request, cat_id: int, body: KategoriaBody):
    db.run("UPDATE categories SET name=?, sort_order=? WHERE id=?",
           (_nn(body.name), body.sort_order or 0, cat_id))
    set_flash(request, "Kategória uložená.")
    return {"ok": True, "redirect": "/sprava/kategorie"}


@router.post("/kategoria/{cat_id}/zmazat")
async def kategoria_zmazat(request: Request, cat_id: int):
    pouzita = db.get("""SELECT
        (SELECT COUNT(*) FROM items WHERE category_id=?) +
        (SELECT COUNT(*) FROM bundles WHERE category_id=?) AS c""", (cat_id, cat_id))["c"]
    if pouzita:
        set_flash(request, "Kategóriu nemožno zmazať, sú v nej položky alebo balíky.")
    else:
        db.run("DELETE FROM categories WHERE id=?", (cat_id,))
        set_flash(request, "Kategória zmazaná.")
    return {"ok": True, "redirect": "/sprava/kategorie"}


# ==================== BALIKY ====================

@router.get("/baliky")
async def baliky_list():
    zoznam = db.all("""SELECT b.*, c.name AS cat_name,
        (SELECT COUNT(*) FROM bundle_items bi WHERE bi.bundle_id = b.id) AS pocet
        FROM bundles b LEFT JOIN categories c ON c.id = b.category_id
        ORDER BY b.code""")
    return {"baliky": zoznam}


@router.get("/balik/novy")
async def balik_novy_form():
    return {
        "b": {"active": 1}, "komponenty": [], "novy": True,
        "kategorie": db.all("SELECT * FROM categories ORDER BY sort_order, name"),
        "polozky": [], "chyba": None,
    }


class BalikBody(BaseModel):
    code: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None
    category_id: Optional[int] = None
    active: bool = True


@router.post("/balik/novy")
async def balik_novy_submit(request: Request, body: BalikBody):
    try:
        bundle_id = db.run("""INSERT INTO bundles (code, name, description, category_id, active)
                               VALUES (?,?,?,?,?)""",
                           (_nn(body.code), _nn(body.name), _nn(body.description),
                            body.category_id, int(body.active)))["lastrowid"]
        set_flash(request, "Balík založený. Pridajte komponenty.")
        return {"ok": True, "redirect": f"/sprava/balik/{bundle_id}"}
    except sqlite3.IntegrityError as e:
        set_flash(request, _chyba_db(e))
        return {"error": _chyba_db(e), "redirect": "/sprava/balik/novy"}


@router.get("/balik/{bundle_id}")
async def balik_form(bundle_id: int):
    b = db.get("SELECT * FROM bundles WHERE id=?", (bundle_id,))
    if not b:
        raise HTTPException(status_code=404, detail="Balík neexistuje.")
    return {
        "b": b, "novy": False, "chyba": None,
        "komponenty": db.all("""SELECT i.id, i.code, i.name, i.unit, i.stock_qty, i.image_path, bi.qty
                                 FROM bundle_items bi JOIN items i ON i.id = bi.item_id
                                 WHERE bi.bundle_id=? ORDER BY i.code""", (bundle_id,)),
        "kategorie": db.all("SELECT * FROM categories ORDER BY sort_order, name"),
        "polozky": db.all("SELECT id, code, name, unit FROM items WHERE active=1 ORDER BY code"),
    }


@router.post("/balik/{bundle_id}")
async def balik_update(request: Request, bundle_id: int, body: BalikBody):
    db.run("UPDATE bundles SET code=?, name=?, description=?, category_id=?, active=? WHERE id=?",
           (_nn(body.code), _nn(body.name), _nn(body.description), body.category_id,
            int(body.active), bundle_id))
    set_flash(request, "Balík uložený.")
    return {"ok": True, "redirect": f"/sprava/balik/{bundle_id}"}


class KomponentBody(BaseModel):
    item_id: Optional[int] = None
    qty: Optional[float] = 1


@router.post("/balik/{bundle_id}/komponent")
async def balik_komponent_pridat(request: Request, bundle_id: int, body: KomponentBody):
    if not body.item_id:
        set_flash(request, "Vyberte položku, ktorú chcete pridať.")
    elif not (body.qty and body.qty > 0):
        set_flash(request, "Množstvo musí byť väčšie ako nula.")
    else:
        db.run("""INSERT INTO bundle_items (bundle_id, item_id, qty) VALUES (?,?,?)
                   ON CONFLICT(bundle_id, item_id) DO UPDATE SET qty = excluded.qty""",
               (bundle_id, body.item_id, body.qty))
        set_flash(request, "Komponent uložený.")
    return {"ok": True, "redirect": f"/sprava/balik/{bundle_id}"}


@router.post("/balik/{bundle_id}/komponent/{item_id}/zmazat")
async def balik_komponent_zmazat(request: Request, bundle_id: int, item_id: int):
    db.run("DELETE FROM bundle_items WHERE bundle_id=? AND item_id=?", (bundle_id, item_id))
    set_flash(request, "Komponent odstránený.")
    return {"ok": True, "redirect": f"/sprava/balik/{bundle_id}"}


@router.post("/balik/{bundle_id}/zmazat")
async def balik_zmazat(request: Request, bundle_id: int):
    with db.transaction():
        db.run("DELETE FROM bundle_items WHERE bundle_id=?", (bundle_id,))
        # request_lines.bundle_id je len informacia o povode riadku - uvolnime ju
        db.run("UPDATE request_lines SET bundle_id = NULL WHERE bundle_id=?", (bundle_id,))
        db.run("DELETE FROM bundles WHERE id=?", (bundle_id,))
    set_flash(request, "Balík zmazaný.")
    return {"ok": True, "redirect": "/sprava/baliky"}


# ==================== DODAVATELIA ====================

@router.get("/dodavatelia")
async def sprava_dodavatelia_list():
    zoznam = db.all("""SELECT s.*,
        (SELECT COUNT(*) FROM supplier_items si WHERE si.supplier_id = s.id) AS pocet_poloziek
        FROM suppliers s ORDER BY s.name""")
    return {"dodavatelia": zoznam}


@router.get("/dodavatel/novy")
async def dodavatel_novy_form():
    return {"d": {"active": 1, "lead_time_days": 7}, "novy": True, "polozky": []}


class DodavatelBody(BaseModel):
    name: Optional[str] = None
    ico: Optional[str] = None
    dic: Optional[str] = None
    contact_person: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    web: Optional[str] = None
    address: Optional[str] = None
    lead_time_days: Optional[int] = 7
    note: Optional[str] = None
    active: bool = True


@router.post("/dodavatel/novy")
async def dodavatel_novy_submit(request: Request, body: DodavatelBody):
    supplier_id = db.run("""INSERT INTO suppliers
        (name, ico, dic, contact_person, email, phone, web, address, lead_time_days, note, active)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
        (_nn(body.name), _nn(body.ico), _nn(body.dic), _nn(body.contact_person), _nn(body.email),
         _nn(body.phone), _nn(body.web), _nn(body.address), body.lead_time_days or 7,
         _nn(body.note), int(body.active)))["lastrowid"]
    set_flash(request, "Dodávateľ pridaný.")
    return {"ok": True, "redirect": f"/sprava/dodavatel/{supplier_id}"}


@router.get("/dodavatel/{supplier_id}")
async def dodavatel_form(supplier_id: int):
    d = db.get("SELECT * FROM suppliers WHERE id=?", (supplier_id,))
    if not d:
        raise HTTPException(status_code=404, detail="Dodávateľ neexistuje.")
    return {
        "d": d, "novy": False,
        "polozky": db.all("""SELECT i.id, i.code, i.name, si.supplier_sku, si.price, si.is_primary
                              FROM supplier_items si JOIN items i ON i.id = si.item_id
                              WHERE si.supplier_id=? ORDER BY i.code""", (supplier_id,)),
    }


@router.post("/dodavatel/{supplier_id}")
async def dodavatel_update(request: Request, supplier_id: int, body: DodavatelBody):
    db.run("""UPDATE suppliers SET name=?, ico=?, dic=?, contact_person=?, email=?, phone=?,
               web=?, address=?, lead_time_days=?, note=?, active=? WHERE id=?""",
           (_nn(body.name), _nn(body.ico), _nn(body.dic), _nn(body.contact_person), _nn(body.email),
            _nn(body.phone), _nn(body.web), _nn(body.address), body.lead_time_days or 7,
            _nn(body.note), int(body.active), supplier_id))
    set_flash(request, "Dodávateľ uložený.")
    return {"ok": True, "redirect": f"/sprava/dodavatel/{supplier_id}"}


@router.post("/dodavatel/{supplier_id}/zmazat")
async def dodavatel_zmazat(request: Request, supplier_id: int):
    with db.transaction():
        db.run("DELETE FROM supplier_items WHERE supplier_id=?", (supplier_id,))
        db.run("UPDATE stock_moves SET supplier_id = NULL WHERE supplier_id=?", (supplier_id,))
        db.run("DELETE FROM suppliers WHERE id=?", (supplier_id,))
    set_flash(request, "Dodávateľ zmazaný.")
    return {"ok": True, "redirect": "/sprava/dodavatelia"}
