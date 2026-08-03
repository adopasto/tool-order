'use strict';
// node:sqlite je v Node.js označený ako experimentálny - upozornenie do konzoly netreba.
const _emit = process.emitWarning;
process.emitWarning = (w, ...r) => { if (String(w).includes('SQLite')) return; _emit(w, ...r); };
const path = require('path');
const express = require('express');
const session = require('express-session');

const cfg = require('./src/config');
const { db, migrate } = require('./src/db');
const { seedIfEmpty } = require('./src/seed');
const { headerAuth } = require('./src/middleware/auth');
const mailer = require('./src/services/mailer');
const { startDigest } = require('./src/services/alerts');

migrate();
if (seedIfEmpty()) console.log('[db] naplnené demo dáta');

const VERZIA = require('./package.json').version;

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('trust proxy', 1);            // za reverznym proxy portalu
app.locals.base = cfg.basePath;

app.use(express.urlencoded({ extended: false }));
app.use(session({
  name: 'naradie.sid',
  secret: cfg.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', maxAge: 8 * 60 * 60 * 1000 },
}));

// Bezpecnostne hlavicky. Ak sa appka vklada do iframe portalu, nastav FRAME_ANCESTOR.
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy',
    `default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; ` +
    `frame-ancestors ${cfg.frameAncestor || "'none'"}`);
  next();
});

app.use(headerAuth);

// Premenne dostupne vo vsetkych sablonach.
app.use((req, res, next) => {
  const u = req.session.user || null;
  res.locals.base = cfg.basePath;
  res.locals.verzia = VERZIA;          // v pätičke aj v URL štýlu - hneď vidno, ktorý build beží
  res.locals.drobky = [];
  res.locals.user = u;
  res.locals.nav = '';
  res.locals.flash = req.session.flash || null;
  delete req.session.flash;

  res.locals.cartCount = (req.session.cart || []).reduce((s, c) => s + c.qty, 0);
  res.locals.alertCount = 0;
  res.locals.naSchvalenie = 0;

  if (u) {
    if (['storekeeper', 'buyer', 'admin'].includes(u.role)) {
      res.locals.alertCount = db.prepare(
        `SELECT COUNT(*) AS c FROM stock_alerts WHERE status <> 'VYRIESENE'`).get().c;
    }
    if (['approver', 'admin'].includes(u.role)) {
      res.locals.naSchvalenie = db.prepare(
        `SELECT COUNT(*) AS c FROM requests WHERE status = 'NOVA'
         AND (? = 'admin' OR cost_center = ?)`).get(u.role, u.cost_center).c;
    } else if (u.role === 'storekeeper') {
      res.locals.naSchvalenie = db.prepare(
        `SELECT COUNT(*) AS c FROM requests
         WHERE status IN ('SCHVALENA','CIASTOCNE_VYDANA','CAKA_NA_TOVAR')`).get().c;
    }
  }
  next();
});

const router = express.Router();
router.use(express.static(path.join(__dirname, 'public')));
router.get('/zdravie', (req, res) => res.json({ ok: true, cas: new Date().toISOString() }));
router.get('/', (req, res) => res.redirect(cfg.basePath + '/katalog'));
router.use(require('./src/routes/auth'));

// Fotky položiek - dostupné len prihláseným, cache na týždeň.
router.use('/foto', require('./src/middleware/auth').requireLogin,
  express.static(cfg.uploadDir, { maxAge: '7d', fallthrough: true }));
router.use(require('./src/routes/shop'));
router.use(require('./src/routes/products'));
router.use(require('./src/routes/requests'));
router.use(require('./src/routes/warehouse'));
router.use(require('./src/routes/admin'));

app.use(cfg.basePath || '/', router);

app.use((req, res) => res.status(404).render('chyba', { msg: 'Stránka neexistuje.' }));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('chyba', { msg: 'Neočakávaná chyba aplikácie. Skúste akciu zopakovať.' });
});

mailer.startWorker();
startDigest();

app.listen(cfg.port, () => {
  console.log(`Objednávky náradia beží na http://localhost:${cfg.port}${cfg.basePath}`);
  console.log(`DB: ${cfg.dbPath}`);
  console.log(`Pošta: režim ${cfg.mailMode}${cfg.mailMode === 'file' ? ` -> ${mailer.MAIL_DIR}` : ''}`);
});
