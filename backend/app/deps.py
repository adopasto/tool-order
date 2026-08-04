"""Auth zavislosti pre FastAPI routery.

Identitu vydava Next.js (Auth.js - Entra ID alebo dev e-mail bypass) a na
kazdom requeste ju posiela v hlavicke config.HEADER_AUTH_NAME (vzdy
prepisanej na proxy vrstve, klient si ju sam nastavit neda). FastAPI teda
nema ziadnu vlastnu session s identitou - len najde pouzivatela podla
e-mailu. Session (Starlette SessionMiddleware) sa pouziva uz len na kosik
a flash spravu."""
from __future__ import annotations

from typing import Optional

from fastapi import Depends, HTTPException, Request

from . import config
from .db import get as db_get
from .errors import AppError  # re-export - routery importuju AppError odtial

ROLE_LABEL = {
    "requester": "Výroba",
    "approver": "Schvaľovateľ",
    "storekeeper": "Sklad",
    "buyer": "Zásobovanie",
    "admin": "Administrátor",
}


def public_user(u: dict) -> dict:
    return {
        "id": u["id"], "username": u["username"], "full_name": u["full_name"],
        "email": u["email"], "role": u["role"], "cost_center": u["cost_center"],
        "roleLabel": ROLE_LABEL[u["role"]],
    }


def get_current_user(request: Request) -> Optional[dict]:
    email = request.headers.get(config.HEADER_AUTH_NAME)
    if not email:
        return None
    u = db_get("SELECT * FROM users WHERE active = 1 AND lower(email) = lower(?)", (email,))
    return public_user(u) if u else None


def require_login(request: Request) -> dict:
    user = get_current_user(request)
    if user:
        return user
    raise HTTPException(status_code=401, detail="Vyžaduje sa prihlásenie cez Microsoft.")


def require_role(*roles: str):
    def checker(request: Request, user: dict = Depends(require_login)) -> dict:
        if user["role"] == "admin" or user["role"] in roles:
            return user
        raise HTTPException(status_code=403, detail="Na túto akciu nemáte oprávnenie.")
    return checker


def pop_flash(request: Request) -> Optional[str]:
    flash = request.session.get("flash")
    if "flash" in request.session:
        del request.session["flash"]
    return flash


def set_flash(request: Request, message: str) -> None:
    request.session["flash"] = message


def nav_counts(request: Request, user: Optional[dict]) -> dict:
    """cartCount / alertCount / naSchvalenie pre topbar - mirror server.js:59-77.
    Kosik je v DB viazany na usera (services/cart.py), nie v session cookie."""
    cart_count = 0
    alert_count = 0
    na_schvalenie = 0
    if user:
        cart_count = db_get(
            "SELECT COALESCE(SUM(qty),0) AS c FROM cart_items WHERE user_id=?", (user["id"],))["c"]
        if user["role"] in ("storekeeper", "buyer", "admin"):
            alert_count = db_get(
                "SELECT COUNT(*) AS c FROM stock_alerts WHERE status <> 'VYRIESENE'")["c"]
        if user["role"] in ("approver", "admin"):
            na_schvalenie = db_get(
                """SELECT COUNT(*) AS c FROM requests WHERE status = 'NOVA'
                   AND (? = 'admin' OR cost_center = ?)""",
                (user["role"], user["cost_center"]))["c"]
        elif user["role"] == "storekeeper":
            na_schvalenie = db_get(
                """SELECT COUNT(*) AS c FROM requests
                   WHERE status IN ('SCHVALENA','CIASTOCNE_VYDANA','CAKA_NA_TOVAR')""")["c"]
    return {"cartCount": cart_count, "alertCount": alert_count, "naSchvalenie": na_schvalenie}
