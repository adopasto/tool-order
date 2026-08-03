'use strict';
const fs = require('fs');
const path = require('path');
const { db } = require('../db');
const cfg = require('../config');

const MAIL_DIR = path.join(path.dirname(cfg.dbPath), 'mail');

// Zapis do outboxu - vola sa VNUTRI transakcie. Ak sa transakcia vrati,
// zmizne aj mail. Ziadne odosielanie pocas otvorenej transakcie.
function queueMail(toAddr, subject, bodyHtml) {
  db.prepare('INSERT INTO mail_outbox (to_addr, subject, body_html) VALUES (?,?,?)')
    .run(Array.isArray(toAddr) ? toAddr.join(',') : toAddr, subject, bodyHtml);
}

function sendOne(mail) {
  if (cfg.mailMode === 'smtp') {
    // Produkcia: nodemailer. Doinstaluj `npm i nodemailer` a odkomentuj.
    // const nodemailer = require('nodemailer');
    // const t = nodemailer.createTransport({ host: process.env.SMTP_HOST, port: 25 });
    // return t.sendMail({ from: cfg.mailFrom, to: mail.to_addr, subject: mail.subject, html: mail.body_html });
    throw new Error('SMTP režim nie je nakonfigurovaný (chýba nodemailer).');
  }
  // Lokalny test: uloz ako .eml, otvoritelny v Outlooku.
  fs.mkdirSync(MAIL_DIR, { recursive: true });
  const eml =
    `From: ${cfg.mailFrom}\r\nTo: ${mail.to_addr}\r\n` +
    `Subject: ${mail.subject}\r\nMIME-Version: 1.0\r\n` +
    `Content-Type: text/html; charset=utf-8\r\n\r\n${mail.body_html}`;
  fs.writeFileSync(path.join(MAIL_DIR, `${String(mail.id).padStart(6, '0')}.eml`), eml, 'utf8');
}

// Worker: bezi po commite, mimo akejkolvek transakcie.
function processOutbox() {
  const davka = db.prepare(`SELECT * FROM mail_outbox
                            WHERE status = 'NOVA' AND attempts < 5
                            ORDER BY id LIMIT 20`).all();
  for (const m of davka) {
    try {
      sendOne(m);
      db.prepare(`UPDATE mail_outbox SET status='ODOSLANA', sent_at=datetime('now','localtime')
                  WHERE id=?`).run(m.id);
      console.log(`[mail] #${m.id} -> ${m.to_addr} :: ${m.subject}`);
    } catch (e) {
      const attempts = m.attempts + 1;
      db.prepare(`UPDATE mail_outbox SET attempts=?, last_error=?, status=?
                  WHERE id=?`).run(attempts, String(e.message), attempts >= 5 ? 'CHYBA' : 'NOVA', m.id);
    }
  }
}

function startWorker(intervalMs = 15000) {
  setInterval(processOutbox, intervalMs).unref();
  processOutbox();
}

module.exports = { queueMail, processOutbox, startWorker, MAIL_DIR };
