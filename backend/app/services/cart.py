"""Kosik viazany na pouzivatela (tabulka cart_items), nie na anonymnu session
cookie - kazdy prihlaseny ma vlastny kosik bez ohladu na to, ci zdiela
prehliadac/pocitac s niekym inym (napr. spolocna stanica na dielni)."""
from __future__ import annotations

from .. import db


def get_cart(user_id: int) -> list[dict]:
    """Riadky kosika - `id` je id polozky/balika (podla kind), `cartItemId`
    je id riadku v cart_items, pouziva sa na upravu/zmazanie konkretneho riadku."""
    rows = db.all("SELECT id, kind, item_id, qty FROM cart_items WHERE user_id=? ORDER BY id", (user_id,))
    return [{"cartItemId": r["id"], "kind": r["kind"], "id": r["item_id"], "qty": r["qty"]} for r in rows]


def cart_count(user_id: int) -> float:
    return db.get("SELECT COALESCE(SUM(qty),0) AS c FROM cart_items WHERE user_id=?", (user_id,))["c"]


def add_to_cart(user_id: int, kind: str, item_id: int, qty: float) -> None:
    db.run("""INSERT INTO cart_items (user_id, kind, item_id, qty) VALUES (?,?,?,?)
               ON CONFLICT(user_id, kind, item_id) DO UPDATE SET qty = qty + excluded.qty""",
           (user_id, kind, item_id, qty))


def update_cart_qty(user_id: int, cart_item_id: int, qty: float) -> None:
    if qty <= 0:
        db.run("DELETE FROM cart_items WHERE id=? AND user_id=?", (cart_item_id, user_id))
    else:
        db.run("UPDATE cart_items SET qty=? WHERE id=? AND user_id=?", (qty, cart_item_id, user_id))


def clear_cart(user_id: int) -> None:
    db.run("DELETE FROM cart_items WHERE user_id=?", (user_id,))
