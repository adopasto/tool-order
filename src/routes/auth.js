'use strict';
const express = require('express');
const { db } = require('../db');
const { verifyPassword } = require('../services/auth-hash');
const { publicUser } = require('../middleware/auth');

const r = express.Router();

r.get('/prihlasenie', (req, res) => {
  if (req.session.user) return res.redirect(req.app.locals.base + '/katalog');
  const demo = db.prepare('SELECT username, full_name, role FROM users WHERE active=1 ORDER BY id').all();
  res.render('prihlasenie', { chyba: null, demo });
});

r.post('/prihlasenie', (req, res) => {
  const { username, password } = req.body;
  const u = db.prepare('SELECT * FROM users WHERE username = ? AND active = 1').get(String(username || '').trim());
  if (!u || !verifyPassword(String(password || ''), u.pass_hash)) {
    const demo = db.prepare('SELECT username, full_name, role FROM users WHERE active=1 ORDER BY id').all();
    return res.status(401).render('prihlasenie', { chyba: 'Nesprávne meno alebo heslo.', demo });
  }
  req.session.user = publicUser(u);
  const cieľ = req.session.returnTo || (req.app.locals.base + '/katalog');
  delete req.session.returnTo;
  res.redirect(cieľ);
});

r.post('/odhlasenie', (req, res) => {
  const base = req.app.locals.base;
  req.session.destroy(() => res.redirect(base + '/prihlasenie'));
});

module.exports = r;
