"""Vstupny bod FastAPI - mirror povodneho server.js (session, hlavicky, mount routerov)."""
from __future__ import annotations

import asyncio
import contextlib
import logging
from datetime import datetime, timezone

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.sessions import SessionMiddleware

from . import config
from . import db
from .errors import AppError
from .seed import seed_if_empty
from .services.mailer import worker_loop as mail_worker_loop
from .services.alerts import digest_loop
from .routers import auth, shop, products, requests as requests_router, warehouse, admin, dashboard

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(message)s")
log = logging.getLogger("app")

VERZIA = "0.4.0"

_background_tasks: list[asyncio.Task] = []


@contextlib.asynccontextmanager
async def lifespan(app: FastAPI):
    db.migrate()
    if seed_if_empty():
        log.info("[db] naplnené demo dáta")
    _background_tasks.append(asyncio.create_task(mail_worker_loop()))
    _background_tasks.append(asyncio.create_task(digest_loop()))
    log.info("Objednávky náradia (API) beží, DB: %s", config.DB_PATH)
    yield
    for t in _background_tasks:
        t.cancel()


app = FastAPI(title="Objednávky náradia API", version=VERZIA, lifespan=lifespan)

app.add_middleware(
    SessionMiddleware,
    secret_key=config.SESSION_SECRET,
    session_cookie="naradie.sid",
    max_age=8 * 60 * 60,
    same_site="lax",
    https_only=False,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[config.FRONTEND_ORIGIN],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    """Bezpecnostne hlavicky. Ak sa appka vklada do iframe portalu, nastav FRAME_ANCESTOR."""
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "same-origin"
    frame_ancestor = config.FRAME_ANCESTOR or "'none'"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; "
        f"frame-ancestors {frame_ancestor}"
    )
    return response


@app.exception_handler(AppError)
async def app_error_handler(request: Request, exc: AppError):
    return JSONResponse(status_code=400, content={"error": str(exc)})


@app.get("/zdravie")
async def zdravie():
    return {"ok": True, "cas": datetime.now(timezone.utc).isoformat()}


app.include_router(auth.router)
app.include_router(shop.router)
app.include_router(products.router)
app.include_router(requests_router.router)
app.include_router(warehouse.router)
app.include_router(admin.router)
app.include_router(dashboard.router)
