"""Prehlad pre admina a nakup - kluczove cisla na jednom mieste namiesto
preklikavania viacerych sekcii (nizka zasoba, ziadanky na schvalenie,
posledna aktivita)."""
from __future__ import annotations

from fastapi import APIRouter, Depends

from .. import db
from ..deps import require_role
from ..services.alerts import otvorene_alerty

router = APIRouter(dependencies=[Depends(require_role("admin", "buyer"))], tags=["dashboard"])


@router.get("/prehlad")
async def prehlad():
    alerty = otvorene_alerty()

    na_schvalenie = db.all("""SELECT rq.id, rq.number, rq.cost_center, rq.created_at,
                                      us.full_name AS ziadatel
                               FROM requests rq JOIN users us ON us.id = rq.requester_id
                               WHERE rq.status = 'NOVA' ORDER BY rq.id DESC LIMIT 5""")
    na_schvalenie_pocet = db.get("SELECT COUNT(*) c FROM requests WHERE status='NOVA'")["c"]

    aktivita = db.all("""SELECT m.created_at, m.move_type, m.qty, i.id AS item_id, i.code, i.name,
                                 i.unit, u.full_name
                          FROM stock_moves m JOIN items i ON i.id = m.item_id
                          LEFT JOIN users u ON u.id = m.user_id
                          ORDER BY m.id DESC LIMIT 10""")

    return {
        "nizkaZasoba": {"pocet": len(alerty), "polozky": alerty[:5]},
        "naSchvalenie": {"pocet": na_schvalenie_pocet, "ziadanky": na_schvalenie},
        "aktivita": aktivita,
    }
