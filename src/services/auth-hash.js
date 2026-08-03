'use strict';
const crypto = require('crypto');

// scrypt z node:crypto - ziadna native zavislost navyse (bcrypt netreba).
function hashPassword(plain) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(plain, salt, 64);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}

function verifyPassword(plain, stored) {
  try {
    const [alg, saltHex, keyHex] = String(stored).split('$');
    if (alg !== 'scrypt') return false;
    const key = crypto.scryptSync(plain, Buffer.from(saltHex, 'hex'), 64);
    return crypto.timingSafeEqual(key, Buffer.from(keyHex, 'hex'));
  } catch {
    return false;
  }
}

module.exports = { hashPassword, verifyPassword };
