"""Tenky obal nad stdlib sqlite3 - mirror src/db.js z povodnej Node verzie.

Jedno pripojenie zdielane cez threading.RLock (FastAPI sync route handlery
bezia v threadpoole), co napodobnuje synchronny, jednovlaknovy pristup
povodneho node:sqlite. transaction() pouziva BEGIN/COMMIT, vnorene volanie
SAVEPOINT, presne ako v src/db.js.
"""
from __future__ import annotations

import sqlite3
import threading
from contextlib import contextmanager
from pathlib import Path

from . import config

config.DB_PATH.parent.mkdir(parents=True, exist_ok=True)


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(str(config.DB_PATH), check_same_thread=False, isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 5000")
    return conn


_conn = _connect()
_lock = threading.RLock()
_depth = 0


def close() -> None:
    with _lock:
        _conn.close()


def reopen() -> None:
    """Znovu otvori pripojenie - pouziva reset.py po zmazani DB suboru (close() musi predtym prebehnut)."""
    global _conn
    with _lock:
        _conn = _connect()


def get(sql: str, params=()) -> dict | None:
    with _lock:
        row = _conn.execute(sql, params).fetchone()
        return dict(row) if row is not None else None


def all(sql: str, params=()) -> list[dict]:
    with _lock:
        return [dict(r) for r in _conn.execute(sql, params).fetchall()]


def run(sql: str, params=()) -> dict:
    with _lock:
        cur = _conn.execute(sql, params)
        return {"changes": cur.rowcount, "lastrowid": cur.lastrowid}


def exec_script(sql: str) -> None:
    with _lock:
        _conn.executescript(sql)


@contextmanager
def transaction():
    """BEGIN/COMMIT obal; vnorene volanie pouzije SAVEPOINT, aby vnutorna
    chyba nezrusila celu vonkajsiu transakciu (mirror src/db.js:56-78)."""
    global _depth
    _lock.acquire()
    sp = f"sp{_depth}" if _depth > 0 else None
    _conn.execute(f"SAVEPOINT {sp}" if sp else "BEGIN")
    _depth += 1
    try:
        yield
    except Exception:
        _depth -= 1
        if sp:
            _conn.execute(f"ROLLBACK TO {sp}")
            _conn.execute(f"RELEASE {sp}")
        else:
            _conn.execute("ROLLBACK")
        raise
    else:
        _depth -= 1
        _conn.execute(f"RELEASE {sp}" if sp else "COMMIT")
    finally:
        _lock.release()


def _add_column_if_missing(table: str, column: str, definition: str) -> None:
    """ALTER TABLE ... ADD COLUMN sa v SQLite neda podmienit, preto kontrola cez PRAGMA."""
    cols = all(f"PRAGMA table_info({table})")
    if not any(c["name"] == column for c in cols):
        exec_script(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")


def migrate() -> None:
    schema_path = Path(__file__).parent / "schema.sql"
    exec_script(schema_path.read_text(encoding="utf-8"))

    # Udaje z importovanych prehladov - orientacne, nie skladove.
    _add_column_if_missing("items", "usage_6m", "REAL")       # spotreba za 6 mesiacov z prehladu
    _add_column_if_missing("items", "ref_price", "REAL")      # orientacna cena za MJ
    _add_column_if_missing("items", "ref_price_note", "TEXT")  # odkial cena pochadza
