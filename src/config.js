'use strict';
const path = require('path');

// Vsetko sa da prepisat cez premenne prostredia - ziadny .env subor netreba.
module.exports = {
  port: Number(process.env.PORT || 3000),

  // Ak appku nasadis na portal pod podadresarom (napr. https://portal.../naradie),
  // nastav BASE_PATH=/naradie. Lokalne nechaj prazdne.
  basePath: process.env.BASE_PATH || '',

  dbPath: process.env.DB_PATH || path.join(__dirname, '..', 'data', 'naradie.db'),

  // Fotky položiek. Súbor sa volá podľa kódu položky (NAR-001.jpg),
  // takže priečinok sa dá naplniť aj hromadne mimo aplikácie.
  uploadDir: process.env.UPLOAD_DIR || path.join(__dirname, '..', 'data', 'uploads', 'items'),

  sessionSecret: process.env.SESSION_SECRET || 'zmen-ma-v-produkcii',

  // Azure Entra ID / App Service Easy Auth.
  // Portal newayselectronics.ai pouziva /.auth/login/aad, takze za reverznym proxy
  // pride hlavicka X-MS-CLIENT-PRINCIPAL-NAME s prihlasenym pouzivatelom.
  // Lokalne nechaj 0 -> pouzije sa vlastne prihlasovacie okno.
  trustHeaderAuth: process.env.TRUST_HEADER_AUTH === '1',
  headerAuthName: process.env.HEADER_AUTH_NAME || 'x-ms-client-principal-name',

  // Ak sa appka bude zobrazovat v iframe portalu, sem daj jeho origin.
  frameAncestor: process.env.FRAME_ANCESTOR || '',

  // Posta: 'file' = .eml subory do data/mail (lokalny test), 'smtp' = realne odoslanie.
  mailMode: process.env.MAIL_MODE || 'file',
  mailFrom: process.env.MAIL_FROM || 'naradie@newayselectronics.com',
  // Komu chodia upozornenia na nízku zásobu (interne, nie dodávateľom).
  mailAlerts: (process.env.MAIL_ALERTS || 'sklad@newayselectronics.com').split(','),

  // Hodina, kedy sa posiela denny suhrn otvorenych upozorneni.
  digestHour: Number(process.env.DIGEST_HOUR || 6),
};
