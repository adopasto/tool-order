'use strict';
const { db } = require('../db');
const cfg = require('../config');

const ROLE_LABEL = {
  requester: 'Výroba',
  approver: 'Schvaľovateľ',
  storekeeper: 'Sklad',
  buyer: 'Zásobovanie',
  admin: 'Administrátor',
};

// Ak bezime za Azure Easy Auth (portal), pouzivatela urcuje hlavicka od proxy,
// nie nase prihlasovacie okno. Konto musi uz existovat v tabulke users.
function headerAuth(req, res, next) {
  if (!cfg.trustHeaderAuth || req.session.user) return next();
  const login = req.get(cfg.headerAuthName);
  if (!login) return next();
  const u = db.prepare(`SELECT * FROM users
                        WHERE active = 1 AND (lower(username) = lower(?) OR lower(email) = lower(?))`)
              .get(login, login);
  if (u) req.session.user = publicUser(u);
  return next();
}

function publicUser(u) {
  return {
    id: u.id, username: u.username, full_name: u.full_name,
    email: u.email, role: u.role, cost_center: u.cost_center,
    roleLabel: ROLE_LABEL[u.role],
  };
}

function requireLogin(req, res, next) {
  if (req.session.user) return next();
  if (cfg.trustHeaderAuth) return res.status(401).render('chyba', { msg: 'Neprihlásený používateľ. Prihláste sa cez portál.' });
  req.session.returnTo = req.originalUrl;
  return res.redirect(req.app.locals.base + '/prihlasenie');
}

// admin ma vzdy pristup
function requireRole(...roles) {
  return (req, res, next) => {
    const u = req.session.user;
    if (!u) return requireLogin(req, res, next);
    if (u.role === 'admin' || roles.includes(u.role)) return next();
    return res.status(403).render('chyba', { msg: 'Na túto akciu nemáte oprávnenie.' });
  };
}

module.exports = { headerAuth, requireLogin, requireRole, publicUser, ROLE_LABEL };
