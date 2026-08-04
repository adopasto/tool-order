"""Transactional outbox + worker - mirror src/services/mailer.js.

queueMail sa vola VNUTRI transakcie. Ak sa transakcia vrati, zmizne aj mail.
Ziadne odosielanie pocas otvorenej transakcie - worker bezi az po commite."""
from __future__ import annotations

import asyncio
import logging
import smtplib
from email.message import EmailMessage
from typing import Iterable, Union

from .. import config
from .. import db

log = logging.getLogger("mailer")


def queue_mail(to_addr: Union[str, Iterable[str]], subject: str, body_html: str) -> None:
    addr = ",".join(to_addr) if not isinstance(to_addr, str) else to_addr
    db.run("INSERT INTO mail_outbox (to_addr, subject, body_html) VALUES (?,?,?)",
           (addr, subject, body_html))


def _send_smtp(mail: dict) -> None:
    if not config.SMTP_HOST:
        raise RuntimeError("SMTP_HOST nie je nastavený (MAIL_MODE=smtp).")

    msg = EmailMessage()
    msg["From"] = config.MAIL_FROM
    msg["To"] = mail["to_addr"]
    msg["Subject"] = mail["subject"]
    msg.set_content("Táto správa vyžaduje e-mailový klient s podporou HTML.")
    msg.add_alternative(mail["body_html"], subtype="html")

    smtp_cls = smtplib.SMTP_SSL if config.SMTP_USE_SSL else smtplib.SMTP
    with smtp_cls(config.SMTP_HOST, config.SMTP_PORT, timeout=15) as smtp:
        if not config.SMTP_USE_SSL and config.SMTP_STARTTLS:
            smtp.starttls()
        if config.SMTP_USER:
            smtp.login(config.SMTP_USER, config.SMTP_PASSWORD)
        smtp.send_message(msg)


def _send_one(mail: dict) -> None:
    if config.MAIL_MODE == "smtp":
        _send_smtp(mail)
        return
    # Lokalny test: uloz ako .eml, otvoritelny v Outlooku.
    config.MAIL_DIR.mkdir(parents=True, exist_ok=True)
    eml = (
        f"From: {config.MAIL_FROM}\r\nTo: {mail['to_addr']}\r\n"
        f"Subject: {mail['subject']}\r\nMIME-Version: 1.0\r\n"
        f"Content-Type: text/html; charset=utf-8\r\n\r\n{mail['body_html']}"
    )
    path = config.MAIL_DIR / f"{str(mail['id']).zfill(6)}.eml"
    path.write_text(eml, encoding="utf-8")


def process_outbox() -> None:
    batch = db.all("""SELECT * FROM mail_outbox
                       WHERE status = 'NOVA' AND attempts < 5
                       ORDER BY id LIMIT 20""")
    for m in batch:
        try:
            _send_one(m)
            db.run("""UPDATE mail_outbox SET status='ODOSLANA', sent_at=datetime('now','localtime')
                       WHERE id=?""", (m["id"],))
            log.info("mail #%s -> %s :: %s", m["id"], m["to_addr"], m["subject"])
        except Exception as e:
            attempts = m["attempts"] + 1
            db.run("""UPDATE mail_outbox SET attempts=?, last_error=?, status=?
                       WHERE id=?""",
                   (attempts, str(e), "CHYBA" if attempts >= 5 else "NOVA", m["id"]))


async def worker_loop(interval_s: float = 15.0) -> None:
    while True:
        try:
            process_outbox()
        except Exception:
            log.exception("mail worker zlyhal")
        await asyncio.sleep(interval_s)
