"""Nahravanie a hromadne parovanie fotiek poloziek - mirror src/services/photos.js.

Subor sa vzdy uklada pod kodom polozky (NAR-001.jpg). Vdaka tomu je priecinok
citatelny aj bez databazy a da sa naplnit hromadne - stacia fotky pomenovat
kodmi a nakopirovat ich do data/uploads/items."""
from __future__ import annotations

from pathlib import Path
from typing import Optional

from .. import config
from .. import db
from ..errors import AppError

POVOLENE = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
MAX_BYTES = 4 * 1024 * 1024  # 4 MB - z mobilu stacia, siet to unesie

config.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


def validate_upload(filename: str, size: int) -> str:
    ext = Path(filename).suffix.lower()
    if ext not in POVOLENE:
        raise AppError("Vyberte súbor JPG, PNG, WEBP alebo GIF.")
    if size > MAX_BYTES:
        raise AppError("Súbor je príliš veľký (limit 4 MB).")
    return ext


def uloz_foto(item_id: int, content: bytes, original_filename: str) -> None:
    it = db.get("SELECT code, image_path FROM items WHERE id = ?", (item_id,))
    if not it:
        raise AppError("Položka neexistuje.")
    ext = validate_upload(original_filename, len(content))

    if it["image_path"] and it["image_path"] != f"{it['code']}{ext}":
        stary = config.UPLOAD_DIR / it["image_path"]
        if stary.exists():
            stary.unlink()

    filename = f"{it['code']}{ext}"
    (config.UPLOAD_DIR / filename).write_bytes(content)
    db.run("UPDATE items SET image_path = ? WHERE id = ?", (filename, item_id))


def zmaz_foto(item_id: int) -> None:
    it = db.get("SELECT image_path FROM items WHERE id = ?", (item_id,))
    if it and it["image_path"]:
        f = config.UPLOAD_DIR / it["image_path"]
        if f.exists():
            f.unlink()
    db.run("UPDATE items SET image_path = NULL WHERE id = ?", (item_id,))


def skenuj_priecinok() -> dict:
    """Prejde priecinok a sparuje subory s polozkami podla nazvu (bez pripony)
    = kod polozky. Vracia {spojene, nespojene: [nazvy suborov bez zhody]}."""
    subory = [f.name for f in config.UPLOAD_DIR.iterdir()
              if f.is_file() and f.suffix.lower() in POVOLENE]

    spojene = 0
    nespojene: list[str] = []
    for f in subory:
        kod = Path(f).stem
        it = db.get("SELECT id FROM items WHERE upper(code) = upper(?)", (kod,))
        if it:
            db.run("UPDATE items SET image_path = ? WHERE id = ?", (f, it["id"]))
            spojene += 1
        else:
            nespojene.append(f)
    return {"spojene": spojene, "nespojene": nespojene}
