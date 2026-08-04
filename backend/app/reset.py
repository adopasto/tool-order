"""Zmaze DB a naplni odznova - mirror src/reset.js. Spusti: python -m app.reset"""
from __future__ import annotations

from . import config
from . import db
from .seed import seed_if_empty


def main() -> None:
    db.close()
    for suffix in ("", "-wal", "-shm"):
        p = config.DB_PATH.with_name(config.DB_PATH.name + suffix)
        if p.exists():
            p.unlink()
    db.reopen()
    db.migrate()
    seed_if_empty()
    print(f"DB obnovená a naplnená demo dátami: {config.DB_PATH}")


if __name__ == "__main__":
    main()
