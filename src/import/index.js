'use strict';
// node:sqlite je označený ako experimentálny - upozornenie do konzoly netreba.
const _emit = process.emitWarning;
process.emitWarning = (w, ...r) => { if (String(w).includes('SQLite')) return; _emit(w, ...r); };

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { db, migrate } = require('../db');
const cfg = require('../config');

/**
 * Import podkladov do evidencie.
 *
 *   node src/import/index.js              # spracuje všetko v priečinku import/
 *   node src/import/index.js subor.xlsx   # spracuje jeden súbor
 *
 * Import je idempotentný: položky sa párujú podľa kódu, ponuky podľa čísla
 * a dodávateľa. Opakované spustenie preto nič nezduplikuje, len doplní zmeny.
 * Skladové množstvá import nikdy nemení - tie vznikajú výhradne pohybmi.
 */

const IMPORT_DIR = path.join(__dirname, '..', '..', 'import');
const QUOTES_DIR = path.join(path.dirname(cfg.dbPath), 'quotes');

const log = [];
const zapis = (t) => { log.push(t); console.log(t); };

/* ---------------------------------------------------------------- pomocné */

const nn = v => (v === undefined || v === null || String(v).trim() === '' ? null : String(v).trim());
const cislo = v => (v === undefined || v === null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

/** Kód z názvu pre položky, ktoré v prehľade kód nemajú. */
function kodZNazvu(nazov) {
  return nazov.normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // bez diakritiky
    .toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 20);
}

/** Zaradenie do kategórie podľa názvu - prehľad kategórie neobsahuje. */
function kategoriaPodlaNazvu(nazov) {
  const n = nazov.toLowerCase();
  if (/hrot|stpc|sttc|xds|xnt|xht|\brt\b|\bxt\b/.test(n)) return 'Spájkovacie hroty';
  if (/\bpero\b|odsavacie pero|wxp|wxmp|wxdp/.test(n)) return 'Spájkovacia technika';
  if (/hubka|špóny|spony|filter|activator|pásik|pasik|cybersolv|kefa|štetec|stetec/.test(n))
    return 'Spotrebný materiál';
  if (/kliešte|kliste|nož|noz|skrutkovač|skrutkovac|pinzeta|erem|ptr-|pnr-|dp-/.test(n))
    return 'Ručné náradie';
  if (/rukavic|okuliare|plášť|plast/.test(n)) return 'OOPP';
  return null;
}

const najdiKategoriu = db.prepare('SELECT id FROM categories WHERE lower(name) = lower(?)');
const vlozKategoriu = db.prepare('INSERT INTO categories (name, sort_order) VALUES (?,?)');

function kategoriaId(nazov) {
  if (!nazov) return null;
  const k = najdiKategoriu.get(nazov);
  if (k) return k.id;
  const poradie = (db.prepare('SELECT COALESCE(MAX(sort_order),0)+10 AS s FROM categories').get().s);
  const id = vlozKategoriu.run(nazov, poradie).lastInsertRowid;
  zapis(`  + kategória: ${nazov}`);
  return id;
}

/** Založí alebo doplní položku podľa kódu. Nikdy nemení stock_qty. */
function ulozPolozku(p) {
  const existuje = db.prepare('SELECT * FROM items WHERE upper(code) = upper(?)').get(p.code);

  if (!existuje) {
    const id = db.prepare(`INSERT INTO items
      (code, name, description, category_id, unit, reorder_point, reorder_qty,
       is_esd, active, usage_6m, ref_price, ref_price_note)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(p.code, p.name, p.description ?? null, p.category_id ?? null, p.unit || 'ks',
           p.reorder_point ?? 5, p.reorder_qty ?? null, p.is_esd ? 1 : 0,
           p.active === 0 ? 0 : 1, p.usage_6m ?? null, p.ref_price ?? null,
           p.ref_price_note ?? null).lastInsertRowid;
    return { id, novy: true };
  }

  // Existujúcu položku len dopĺňame - ručné úpravy v aplikácii majú prednosť.
  db.prepare(`UPDATE items SET
      name = COALESCE(?, name),
      description = COALESCE(description, ?),
      category_id = COALESCE(category_id, ?),
      usage_6m = COALESCE(?, usage_6m),
      ref_price = COALESCE(?, ref_price),
      ref_price_note = COALESCE(?, ref_price_note)
    WHERE id = ?`)
    .run(p.name || null, p.description ?? null, p.category_id ?? null,
         p.usage_6m ?? null, p.ref_price ?? null, p.ref_price_note ?? null, existuje.id);
  return { id: existuje.id, novy: false };
}

/* ------------------------------------------------- prehľad zásob z tabuľky */

/**
 * Očakávané stĺpce (poradie nerozhoduje, hľadá sa podľa názvu):
 *   Kód | Názov | Spotreba 6 mes. | Min. zásoba | Cena / ks | Návrh 6M zásoba | Poznámka
 */
function importPrehlad(subor) {
  const wb = XLSX.readFile(subor);
  const hárok = wb.Sheets[wb.SheetNames[0]];
  const riadky = XLSX.utils.sheet_to_json(hárok, { defval: null });
  if (riadky.length === 0) return zapis(`  hárok je prázdny`);

  // mapovanie hlavičiek - v súbore majú zalomenia riadkov a dvojité medzery
  const kluce = Object.keys(riadky[0]);
  const najdi = (vzor) => kluce.find(k => vzor.test(k.replace(/\s+/g, ' ').trim().toLowerCase()));
  const K = {
    kod: najdi(/^kód/), nazov: najdi(/^názov/), spotreba: najdi(/spotreba/),
    min: najdi(/min\.? zásoba/), cena: najdi(/cena/), navrh: najdi(/návrh/),
    pozn: najdi(/poznámka/),
  };
  if (!K.nazov) return zapis(`  ! nenašiel som stĺpec Názov, súbor preskakujem`);

  // Voľná poznámka mimo tabuľky (napr. zoznam dodávateľov) - vezme sa ako popis zdroja.
  const zdroj = path.basename(subor);
  let nove = 0, doplnene = 0, bezKodu = [];

  const tx = db.transaction(() => {
    for (const r of riadky) {
      const nazov = nn(r[K.nazov]);
      if (!nazov) continue;

      let kod = nn(K.kod && r[K.kod]);
      const vlastnyKod = !kod;
      if (!kod) { kod = kodZNazvu(nazov); bezKodu.push(`${kod} (${nazov})`); }

      const pozn = nn(K.pozn && r[K.pozn]);
      // "cena za balík v ktorom je 5ks" -> merná jednotka je balenie, nie kus
      const balenie = pozn && /balík|balik|balen/i.test(pozn);

      const { id, novy } = ulozPolozku({
        code: kod,
        name: nazov,
        description: pozn,
        category_id: kategoriaId(kategoriaPodlaNazvu(nazov)),
        unit: balenie ? 'bal' : 'ks',
        reorder_point: cislo(K.min && r[K.min]) ?? 5,
        reorder_qty: cislo(K.navrh && r[K.navrh]),
        is_esd: /esd/i.test(nazov) ? 1 : 0,
        // položky bez kódu sú neúplné - do katalógu ich nepúšťame, kým ich niekto neskontroluje
        active: vlastnyKod ? 0 : 1,
        usage_6m: cislo(K.spotreba && r[K.spotreba]),
        ref_price: cislo(K.cena && r[K.cena]),
        ref_price_note: cislo(K.cena && r[K.cena]) != null ? `orientačne podľa ${zdroj}` : null,
      });
      if (novy) nove++; else doplnene++;
      void id;
    }
  });
  tx();

  zapis(`  položky: ${nove} nových, ${doplnene} doplnených`);
  if (bezKodu.length) {
    zapis(`  ! ${bezKodu.length} položiek nemalo v prehľade kód – založené ako NEAKTÍVNE`);
    zapis(`    doplň im kód a cenu v Správe → Položky, potom ich aktivuj:`);
    for (const b of bezKodu) zapis(`      ${b}`);
  }
}

/* ------------------------------------------------------- cenová ponuka JSON */

function ulozDodavatela(d) {
  const existuje = db.prepare(`SELECT * FROM suppliers
                               WHERE lower(name) = lower(?) OR (ico IS NOT NULL AND ico = ?)`)
    .get(d.nazov, d.ico ?? null);
  if (existuje) {
    db.prepare(`UPDATE suppliers SET ico = COALESCE(ico, ?), dic = COALESCE(dic, ?),
                contact_person = COALESCE(contact_person, ?), email = COALESCE(email, ?),
                phone = COALESCE(phone, ?), address = COALESCE(address, ?),
                note = COALESCE(note, ?) WHERE id = ?`)
      .run(d.ico ?? null, d.dic ?? null, d.kontakt ?? null, d.email ?? null,
           d.telefon ?? null, d.adresa ?? null, d.poznamka ?? null, existuje.id);
    return existuje.id;
  }
  const id = db.prepare(`INSERT INTO suppliers
    (name, ico, dic, contact_person, email, phone, address, lead_time_days, note, active)
    VALUES (?,?,?,?,?,?,?,?,?,1)`)
    .run(d.nazov, d.ico ?? null, d.dic ?? null, d.kontakt ?? null, d.email ?? null,
         d.telefon ?? null, d.adresa ?? null, d.dodacia_lehota ?? 7, d.poznamka ?? null)
    .lastInsertRowid;
  zapis(`  + dodávateľ: ${d.nazov}`);
  return id;
}

function importPonuka(subor) {
  const p = JSON.parse(fs.readFileSync(subor, 'utf8'));
  const supplierId = ulozDodavatela(p.dodavatel);

  // príloha (PDF) sa odkladá k databáze, aby ju aplikácia vedela ponúknuť na stiahnutie
  let priloha = null;
  if (p.priloha) {
    const zdroj = path.join(IMPORT_DIR, 'prilohy', p.priloha);
    if (fs.existsSync(zdroj)) {
      fs.mkdirSync(QUOTES_DIR, { recursive: true });
      fs.copyFileSync(zdroj, path.join(QUOTES_DIR, p.priloha));
      priloha = p.priloha;
    } else {
      zapis(`  ! príloha ${p.priloha} sa nenašla v import/prilohy`);
    }
  }

  const tx = db.transaction(() => {
    const stara = db.prepare('SELECT id FROM quotes WHERE supplier_id = ? AND number = ?')
      .get(supplierId, p.cislo);
    if (stara) db.prepare('DELETE FROM quotes WHERE id = ?').run(stara.id);  // prepíšeme celú

    const quoteId = db.prepare(`INSERT INTO quotes
      (number, supplier_id, issued_at, valid_until, total_no_vat, total_vat,
       currency, file_path, note)
      VALUES (?,?,?,?,?,?,?,?,?)`)
      .run(p.cislo, supplierId, p.vystavena ?? null, p.platna_do ?? null,
           p.spolu_bez_dph ?? null, p.spolu_s_dph ?? null, p.mena || 'EUR',
           priloha, p.poznamka ?? null).lastInsertRowid;

    const vlozRiadok = db.prepare(`INSERT INTO quote_lines
      (quote_id, item_id, supplier_sku, description, min_qty, unit, unit_price, note)
      VALUES (?,?,?,?,?,?,?,?)`);

    for (const r of p.riadky) {
      let itemId = null;
      if (r.polozka) {
        const v = ulozPolozku({
          code: r.polozka.kod,
          name: r.polozka.nazov,
          description: r.polozka.popis ?? null,
          category_id: kategoriaId(r.polozka.kategoria),
          unit: r.polozka.jednotka || 'ks',
          reorder_point: r.polozka.signalna_zasoba ?? 5,
          is_esd: r.polozka.esd ? 1 : 0,
        });
        itemId = v.id;
        if (v.novy) zapis(`  + položka: ${r.polozka.kod} – ${r.polozka.nazov}`);

        // väzba na dodávateľa: cena najnižšieho pásma = bežná objednávacia cena
        const zaklad = [...r.pasma].sort((a, b) => a.od_mnozstva - b.od_mnozstva)[0];
        db.prepare(`INSERT INTO supplier_items
          (supplier_id, item_id, supplier_sku, price, min_order_qty, is_primary)
          VALUES (?,?,?,?,?,1)
          ON CONFLICT(supplier_id, item_id) DO UPDATE SET
            supplier_sku = excluded.supplier_sku, price = excluded.price,
            min_order_qty = excluded.min_order_qty`)
          .run(supplierId, itemId, r.kod_dodavatela ?? null,
               zaklad?.cena ?? null, zaklad?.od_mnozstva ?? 1);
      }

      for (const pasmo of r.pasma) {
        vlozRiadok.run(quoteId, itemId, r.kod_dodavatela ?? null, r.popis ?? null,
                       pasmo.od_mnozstva, r.polozka?.jednotka ?? null, pasmo.cena,
                       pasmo.poznamka ?? null);
      }
    }
  });
  tx();

  const pasiem = p.riadky.reduce((s, r) => s + r.pasma.length, 0);
  zapis(`  ponuka ${p.cislo}: ${p.riadky.length} položiek, ${pasiem} cenových pásiem` +
        (priloha ? `, príloha ${priloha}` : ''));
}

/* ------------------------------------------------------------------- beh */

function spusti(subory) {
  migrate();
  for (const f of subory) {
    const nazov = path.basename(f);
    zapis(`\n▸ ${nazov}`);
    try {
      if (/\.xlsx?$/i.test(f)) importPrehlad(f);
      else if (/\.json$/i.test(f)) importPonuka(f);
      else zapis('  neznámy typ súboru, preskakujem');
    } catch (e) {
      zapis(`  ! chyba: ${e.message}`);
    }
  }

  const s = db.prepare(`SELECT
      (SELECT COUNT(*) FROM items) AS polozky,
      (SELECT COUNT(*) FROM items WHERE active = 0) AS neaktivne,
      (SELECT COUNT(*) FROM suppliers) AS dodavatelia,
      (SELECT COUNT(*) FROM quotes) AS ponuky,
      (SELECT COUNT(*) FROM quote_lines) AS pasma`).get();
  zapis(`\nStav evidencie: ${s.polozky} položiek (z toho ${s.neaktivne} neaktívnych), ` +
        `${s.dodavatelia} dodávateľov, ${s.ponuky} ponúk, ${s.pasma} cenových pásiem.`);
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const subory = args.length
    ? args.map(a => path.resolve(a))
    : (fs.existsSync(IMPORT_DIR)
        ? fs.readdirSync(IMPORT_DIR).filter(f => /\.(xlsx?|json)$/i.test(f))
            .map(f => path.join(IMPORT_DIR, f))
        : []);

  if (subory.length === 0) {
    console.log(`Nič na import. Vlož súbory do ${IMPORT_DIR} (xlsx prehľady, json ponuky).`);
    process.exit(0);
  }
  spusti(subory);
}

module.exports = { spusti, importPrehlad, importPonuka };
