'use strict';
const express = require('express');
const { db } = require('../db');
const { requireLogin, requireRole } = require('../middleware/auth');
const { vydaj, AppError } = require('../services/stock');
const R = require('../services/requests');

const r = express.Router();
r.use(requireLogin);

const STAV_LABEL = {
  NOVA: 'Čaká na schválenie', SCHVALENA: 'Schválená', CAKA_NA_TOVAR: 'Čaká na tovar',
  CIASTOCNE_VYDANA: 'Čiastočne vydaná', VYDANA: 'Vydaná',
  ZAMIETNUTA: 'Zamietnutá', STORNO: 'Stornovaná',
};

r.get('/ziadanky', (req, res) => {
  const u = req.session.user;
  const stav = req.query.stav || '';
  const params = [];
  let where = '1=1';

  // Vyroba vidi len svoje, schvalovatel svoje stredisko, sklad/nakup/admin vsetko.
  if (u.role === 'requester') { where += ' AND rq.requester_id = ?'; params.push(u.id); }
  else if (u.role === 'approver') { where += ' AND (rq.cost_center = ? OR rq.requester_id = ?)'; params.push(u.cost_center, u.id); }

  if (stav) { where += ' AND rq.status = ?'; params.push(stav); }

  const ziadanky = db.prepare(`
    SELECT rq.*, us.full_name AS ziadatel,
           (SELECT COUNT(*) FROM request_lines rl WHERE rl.request_id = rq.id) AS pocet_riadkov
    FROM requests rq JOIN users us ON us.id = rq.requester_id
    WHERE ${where} ORDER BY rq.id DESC LIMIT 200`).all(...params);

  res.render('ziadanky', { ziadanky, STAV_LABEL, stav });
});

r.get('/ziadanky/:id', (req, res) => {
  const u = req.session.user;
  const z = db.prepare(`SELECT rq.*, us.full_name AS ziadatel, us.email AS ziadatel_email,
                               ap.full_name AS schvalil
                        FROM requests rq JOIN users us ON us.id = rq.requester_id
                        LEFT JOIN users ap ON ap.id = rq.approved_by
                        WHERE rq.id = ?`).get(req.params.id);
  if (!z) return res.status(404).render('chyba', { msg: 'Žiadanka neexistuje.' });
  if (u.role === 'requester' && z.requester_id !== u.id)
    return res.status(403).render('chyba', { msg: 'Vidíte len vlastné žiadanky.' });

  const riadky = db.prepare(`SELECT rl.*, i.code, i.name, i.unit, i.stock_qty, i.location, i.image_path,
                                    b.code AS bundle_code, b.name AS bundle_name
                             FROM request_lines rl
                             JOIN items i ON i.id = rl.item_id
                             LEFT JOIN bundles b ON b.id = rl.bundle_id
                             WHERE rl.request_id = ? ORDER BY rl.id`).all(z.id);

  res.render('ziadanka', { z, riadky, STAV_LABEL });
});

r.post('/ziadanky/:id/schvalit', requireRole('approver'), (req, res, next) => {
  try {
    R.schval(Number(req.params.id), req.session.user);
    req.session.flash = 'Žiadanka schválená.';
    res.redirect(`${req.app.locals.base}/ziadanky/${req.params.id}`);
  } catch (e) { handle(e, req, res, next); }
});

r.post('/ziadanky/:id/zamietnut', requireRole('approver'), (req, res, next) => {
  try {
    R.zamietni(Number(req.params.id), req.session.user, req.body.duvod);
    req.session.flash = 'Žiadanka zamietnutá.';
    res.redirect(`${req.app.locals.base}/ziadanky/${req.params.id}`);
  } catch (e) { handle(e, req, res, next); }
});

r.post('/ziadanky/:id/storno', (req, res, next) => {
  const z = db.prepare('SELECT * FROM requests WHERE id=?').get(req.params.id);
  const u = req.session.user;
  if (!z || (u.role === 'requester' && z.requester_id !== u.id))
    return res.status(403).render('chyba', { msg: 'Nemôžete stornovať cudziu žiadanku.' });
  R.storno(z.id, u);
  req.session.flash = 'Žiadanka stornovaná.';
  res.redirect(`${req.app.locals.base}/ziadanky/${z.id}`);
});

r.post('/ziadanky/:id/vydat', requireRole('storekeeper'), (req, res, next) => {
  try {
    const z = db.prepare('SELECT * FROM requests WHERE id=?').get(req.params.id);
    if (!z || !['SCHVALENA', 'CAKA_NA_TOVAR', 'CIASTOCNE_VYDANA'].includes(z.status))
      throw new AppError('Zo žiadanky v tomto stave nemožno vydávať.');

    // formular posiela qty_<idRiadku>
    const lines = Object.entries(req.body)
      .filter(([k, v]) => k.startsWith('qty_') && Number(v) > 0)
      .map(([k, v]) => ({ requestLineId: Number(k.slice(4)), qty: Number(v) }));
    if (lines.length === 0) throw new AppError('Nezadali ste žiadne množstvo na výdaj.');

    vydaj(lines, req.session.user.id);
    R.prepocitajStav(z.id);
    req.session.flash = 'Výdaj zaevidovaný.';
    res.redirect(`${req.app.locals.base}/ziadanky/${z.id}`);
  } catch (e) { handle(e, req, res, next); }
});

function handle(e, req, res, next) {
  if (e instanceof AppError) {
    req.session.flash = e.message;
    return res.redirect(`${req.app.locals.base}/ziadanky/${req.params.id}`);
  }
  next(e);
}

module.exports = r;
