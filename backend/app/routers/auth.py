"""Odhlasenie + spolocny 'kontext' pre topbar. Prihlasenie samotne rieši
Next.js (Auth.js - Entra ID alebo dev e-mail bypass), FastAPI heslo
neriesi vobec - pozri deps.get_current_user."""
from __future__ import annotations

from fastapi import APIRouter, Request

from .. import db
from ..deps import get_current_user, nav_counts, pop_flash

router = APIRouter(tags=["auth"])

VERZIA = "0.4.0"


@router.get("/prihlasenie")
async def prihlasenie_form():
    """Zoznam aktivnych poouzivatelov (e-mail) - pre dev-login formular na
    frontende, aby bolo vidno, ake ucty uz existuju v DB."""
    demo = db.all(
        "SELECT email, full_name, role FROM users WHERE active=1 AND email IS NOT NULL ORDER BY id")
    return {"demo": demo}


@router.post("/odhlasenie")
async def odhlasenie(request: Request):
    """Vola Next.js /api/logout pred Auth.js signOut() - vycisti kosik a
    flash spravu v FastAPI session (identitu FastAPI vobec neuklada)."""
    request.session.clear()
    return {"ok": True}


@router.get("/kontext")
async def kontext(request: Request):
    """Data pre topbar/nav na kazdej stranke - user, pocitadla, flash, verzia.
    Cita a hned zmaze flash spravu (mirror res.locals.flash + delete v server.js)."""
    user = get_current_user(request)
    counts = nav_counts(request, user)
    return {"user": user, "verzia": VERZIA, "flash": pop_flash(request), **counts}
