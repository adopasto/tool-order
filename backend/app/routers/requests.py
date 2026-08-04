"""Ziadanky - zoznam, detail, schvalenie/zamietnutie/storno/vydaj - mirror
src/routes/requests.js."""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from .. import db
from ..deps import require_login, require_role, set_flash
from ..errors import AppError
from ..services import requests as R
from ..services.stock import vydaj

router = APIRouter(dependencies=[Depends(require_login)], tags=["requests"])

STAV_LABEL = {
    "NOVA": "Čaká na schválenie", "SCHVALENA": "Schválená", "CAKA_NA_TOVAR": "Čaká na tovar",
    "CIASTOCNE_VYDANA": "Čiastočne vydaná", "VYDANA": "Vydaná",
    "ZAMIETNUTA": "Zamietnutá", "STORNO": "Stornovaná",
}


@router.get("/ziadanky")
async def ziadanky(request: Request, stav: Optional[str] = None, u: dict = Depends(require_login)):
    where = "1=1"
    params: list = []

    # Vyroba vidi len svoje, schvalovatel svoje stredisko, sklad/nakup/admin vsetko.
    if u["role"] == "requester":
        where += " AND rq.requester_id = ?"
        params.append(u["id"])
    elif u["role"] == "approver":
        where += " AND (rq.cost_center = ? OR rq.requester_id = ?)"
        params += [u["cost_center"], u["id"]]

    if stav:
        where += " AND rq.status = ?"
        params.append(stav)

    zoznam = db.all(f"""
        SELECT rq.*, us.full_name AS ziadatel,
               (SELECT COUNT(*) FROM request_lines rl WHERE rl.request_id = rq.id) AS pocet_riadkov
        FROM requests rq JOIN users us ON us.id = rq.requester_id
        WHERE {where} ORDER BY rq.id DESC LIMIT 200""", params)

    return {"ziadanky": zoznam, "STAV_LABEL": STAV_LABEL, "stav": stav or ""}


@router.get("/ziadanky/{req_id}")
async def ziadanka_detail(request: Request, req_id: int, u: dict = Depends(require_login)):
    z = db.get("""SELECT rq.*, us.full_name AS ziadatel, us.email AS ziadatel_email,
                          ap.full_name AS schvalil
                   FROM requests rq JOIN users us ON us.id = rq.requester_id
                   LEFT JOIN users ap ON ap.id = rq.approved_by
                   WHERE rq.id = ?""", (req_id,))
    if not z:
        raise HTTPException(status_code=404, detail="Žiadanka neexistuje.")
    if u["role"] == "requester" and z["requester_id"] != u["id"]:
        raise HTTPException(status_code=403, detail="Vidíte len vlastné žiadanky.")

    riadky = db.all("""SELECT rl.*, i.code, i.name, i.unit, i.stock_qty, i.location, i.image_path,
                               b.code AS bundle_code, b.name AS bundle_name
                        FROM request_lines rl
                        JOIN items i ON i.id = rl.item_id
                        LEFT JOIN bundles b ON b.id = rl.bundle_id
                        WHERE rl.request_id = ? ORDER BY rl.id""", (z["id"],))

    return {"z": z, "riadky": riadky, "STAV_LABEL": STAV_LABEL}


def _handle(request: Request, req_id: int, fn):
    try:
        fn()
    except AppError as e:
        set_flash(request, str(e))
        return {"error": str(e), "redirect": f"/ziadanky/{req_id}"}
    return None


@router.post("/ziadanky/{req_id}/schvalit")
async def schvalit(request: Request, req_id: int, user: dict = Depends(require_role("approver"))):
    err = _handle(request, req_id, lambda: R.schval(req_id, user))
    if err:
        return err
    set_flash(request, "Žiadanka schválená.")
    return {"ok": True, "redirect": f"/ziadanky/{req_id}"}


class ZamietnutBody(BaseModel):
    duvod: Optional[str] = None


@router.post("/ziadanky/{req_id}/zamietnut")
async def zamietnut(request: Request, req_id: int, body: ZamietnutBody,
                    user: dict = Depends(require_role("approver"))):
    err = _handle(request, req_id, lambda: R.zamietni(req_id, user, body.duvod))
    if err:
        return err
    set_flash(request, "Žiadanka zamietnutá.")
    return {"ok": True, "redirect": f"/ziadanky/{req_id}"}


@router.post("/ziadanky/{req_id}/storno")
async def storno(request: Request, req_id: int, u: dict = Depends(require_login)):
    z = db.get("SELECT * FROM requests WHERE id=?", (req_id,))
    if not z or (u["role"] == "requester" and z["requester_id"] != u["id"]):
        raise HTTPException(status_code=403, detail="Nemôžete stornovať cudziu žiadanku.")
    R.storno(z["id"], u)
    set_flash(request, "Žiadanka stornovaná.")
    return {"ok": True, "redirect": f"/ziadanky/{z['id']}"}


class VydatBody(BaseModel):
    qty: dict[str, float]  # {"<request_line_id>": qty}


@router.post("/ziadanky/{req_id}/vydat")
async def vydat(request: Request, req_id: int, body: VydatBody,
                user: dict = Depends(require_role("storekeeper"))):
    def akcia():
        z = db.get("SELECT * FROM requests WHERE id=?", (req_id,))
        if not z or z["status"] not in ("SCHVALENA", "CAKA_NA_TOVAR", "CIASTOCNE_VYDANA"):
            raise AppError("Zo žiadanky v tomto stave nemožno vydávať.")

        lines = [{"requestLineId": int(k), "qty": v} for k, v in body.qty.items() if v > 0]
        if not lines:
            raise AppError("Nezadali ste žiadne množstvo na výdaj.")

        with db.transaction():
            vydaj(lines, user["id"])
            R.prepocitaj_stav(z["id"])
            R.oznam_vydaj(z["id"], lines)

    err = _handle(request, req_id, akcia)
    if err:
        return err
    set_flash(request, "Výdaj zaevidovaný.")
    return {"ok": True, "redirect": f"/ziadanky/{req_id}"}
