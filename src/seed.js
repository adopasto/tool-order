'use strict';
const { db } = require('./db');
const { hashPassword } = require('./services/auth-hash');

// Demo data. Vsetky kontakty su fiktivne (@example.com) - pred ostrym nasadenim prepis.
function seedIfEmpty() {
  const { c } = db.prepare('SELECT COUNT(*) AS c FROM users').get();
  if (c > 0) return false;

  const tx = db.transaction(() => {
    // --- pouzivatelia (heslo = username + "123") ---
    const insU = db.prepare(`INSERT INTO users (username, full_name, email, role, cost_center, pass_hash)
                             VALUES (?,?,?,?,?,?)`);
    const users = [
      ['vyroba',  'Jozef Operátor',   'vyroba@example.com',  'requester',   'SMT-1'],
      ['majster', 'Peter Majster',    'majster@example.com', 'approver',    'SMT-1'],
      ['sklad',   'Anna Skladníčka',  'sklad@example.com',   'storekeeper', 'SKLAD'],
      ['nakup',   'Martin Nákupca',   'nakup@example.com',   'buyer',       'NAKUP'],
      ['admin',   'Andrej Pastorek',  'admin@example.com',   'admin',       'MET'],
    ];
    for (const u of users) insU.run(...u, hashPassword(u[0] + '123'));

    // --- kategorie ---
    const insC = db.prepare('INSERT INTO categories (name, sort_order) VALUES (?,?)');
    const cat = {};
    [['Ručné náradie', 10], ['Spájkovanie', 20], ['ESD ochrana', 30],
     ['Meradlá', 40], ['Spotrebný materiál', 50], ['OOPP', 60]
    ].forEach(([n, s], i) => { cat[n] = insC.run(n, s).lastInsertRowid; });

    // --- polozky ---
    const insI = db.prepare(`INSERT INTO items
      (code, name, description, category_id, unit, reorder_point, reorder_qty, location, is_esd)
      VALUES (@code,@name,@desc,@cat,@unit,@rop,@roq,@loc,@esd)`);
    const it = {};
    const items = [
      ['NAR-001','Kliešte štikacie ESD 120 mm','Bočné štikacie kliešte, ESD vodivé rukoväte','Ručné náradie','ks',5,20,'A1-03',1],
      ['NAR-002','Pinzeta ESD rovná 120 mm','Antimagnetická, nerez, ESD','Ručné náradie','ks',10,50,'A1-04',1],
      ['NAR-003','Pinzeta ESD zahnutá 120 mm','Antimagnetická, nerez, ESD','Ručné náradie','ks',10,50,'A1-05',1],
      ['NAR-004','Skrutkovač TORX T10 ESD','Izolovaná rukoväť','Ručné náradie','ks',4,10,'A2-01',1],
      ['NAR-005','Momentový skrutkovač 0,4–2 Nm','Kalibrovaný, evidovaný v cal-esd-db','Ručné náradie','ks',1,2,'A2-06',0],
      ['SPA-001','Spájkovacia stanica 80 W','Digitálna, ESD safe, s podstavcom','Spájkovanie','ks',2,4,'B1-01',1],
      ['SPA-002','Hrot D 1,6 mm','Náhradný hrot dlátový','Spájkovanie','ks',8,40,'B1-04',0],
      ['SPA-003','Hrot I 0,4 mm','Náhradný hrot ihlový','Spájkovanie','ks',8,40,'B1-05',0],
      ['SPA-004','Cín Sn99,3Cu0,7 0,8 mm 500 g','Bezolovnatá spájka s tavidlom','Spájkovanie','ks',6,24,'B2-01',0],
      ['SPA-005','Odsávacia lanko 2,0 mm','Odspájkovacie lanko s tavidlom','Spájkovanie','ks',10,50,'B2-03',0],
      ['SPA-006','Tavidlové pero','No-clean tavidlo','Spájkovanie','ks',5,20,'B2-05',0],
      ['ESD-001','ESD náramok s káblom 1,8 m','1 MΩ rezistor, banánik 4 mm','ESD ochrana','ks',15,60,'C1-01',1],
      ['ESD-002','ESD pätný pásik','Nastaviteľný, pár','ESD ochrana','pár',20,100,'C1-02',1],
      ['ESD-003','ESD rukavice veľ. M','Polyester s uhlíkovým vláknom','ESD ochrana','pár',25,200,'C1-05',1],
      ['ESD-004','ESD podložka na stôl 600×1200','Dvojvrstvová, s uzemňovacím káblom','ESD ochrana','ks',3,6,'C2-01',1],
      ['ESD-005','ESD sáčok tienený 200×300','Antistatické balenie, 100 ks','ESD ochrana','bal',10,40,'C2-04',1],
      ['MER-001','Posuvné meradlo 150 mm digitálne','Rozlíšenie 0,01 mm, podlieha kalibrácii','Meradlá','ks',2,4,'D1-01',0],
      ['MER-002','Multimeter digitálny TRMS','CAT III 600 V, podlieha kalibrácii','Meradlá','ks',1,2,'D1-03',0],
      ['SPO-001','Izopropylalkohol 1 l','IPA 99,9 %, čistenie DPS','Spotrebný materiál','l',6,24,'E1-01',0],
      ['SPO-002','Bezprašné utierky 100 ks','Netkaná textília, bez chĺpkov','Spotrebný materiál','bal',12,60,'E1-03',0],
      ['SPO-003','Antistatická páska 19 mm','Lepiaca páska ESD','Spotrebný materiál','ks',8,30,'E1-05',0],
      ['OOP-001','Ochranné okuliare číre','EN 166','OOPP','ks',10,40,'F1-01',0],
      ['OOP-002','ESD plášť veľ. L','Antistatický pracovný plášť','OOPP','ks',5,20,'F1-04',1],
    ];
    for (const [code, name, desc, catName, unit, rop, roq, loc, esd] of items) {
      it[code] = insI.run({ code, name, desc, cat: cat[catName], unit, rop, roq, loc, esd }).lastInsertRowid;
    }

    // --- pociatocny stav skladu (prijem = auditovatelny pohyb, nie UPDATE) ---
    const insM = db.prepare(`INSERT INTO stock_moves (item_id, move_type, qty, user_id, note)
                             VALUES (?, 'INVENTURA', ?, 5, 'Počiatočný stav')`);
    const stavy = {
      'NAR-001':18,'NAR-002':42,'NAR-003':35,'NAR-004':9,'NAR-005':3,
      'SPA-001':5,'SPA-002':26,'SPA-003':7,'SPA-004':14,'SPA-005':31,'SPA-006':12,
      'ESD-001':48,'ESD-002':64,'ESD-003':120,'ESD-004':6,'ESD-005':22,
      'MER-001':4,'MER-002':2,
      'SPO-001':11,'SPO-002':38,'SPO-003':16,
      'OOP-001':27,'OOP-002':13,
    };
    for (const [code, q] of Object.entries(stavy)) insM.run(it[code], q);

    // --- baliky ---
    const insB = db.prepare('INSERT INTO bundles (code, name, description, category_id) VALUES (?,?,?,?)');
    const insBI = db.prepare('INSERT INTO bundle_items (bundle_id, item_id, qty) VALUES (?,?,?)');
    const baliky = [
      ['BAL-001','Výbava nového operátora','Základná ESD výbava pre nástup na linku', 'ESD ochrana',
        [['ESD-001',1],['ESD-002',1],['ESD-003',2],['OOP-002',1]]],
      ['BAL-002','Spájkovacie pracovisko – štart','Kompletné vybavenie jedného spájkovacieho miesta','Spájkovanie',
        [['SPA-001',1],['SPA-002',2],['SPA-003',2],['SPA-004',1],['SPA-005',1],['SPA-006',1],['NAR-001',1],['NAR-002',1]]],
      ['BAL-003','Mesačný spotrebný materiál linky','Bežná mesačná spotreba jednej SMT linky','Spotrebný materiál',
        [['SPO-001',2],['SPO-002',4],['SPO-003',2],['ESD-003',10]]],
    ];
    for (const [code, name, desc, catName, lines] of baliky) {
      const bid = insB.run(code, name, desc, cat[catName]).lastInsertRowid;
      for (const [icode, q] of lines) insBI.run(bid, it[icode], q);
    }

    // --- dodavatelia ---
    const insS = db.prepare(`INSERT INTO suppliers
      (name, ico, contact_person, email, phone, web, address, lead_time_days, note)
      VALUES (?,?,?,?,?,?,?,?,?)`);
    const insSI = db.prepare(`INSERT INTO supplier_items
      (supplier_id, item_id, supplier_sku, price, min_order_qty, is_primary) VALUES (?,?,?,?,?,?)`);
    const dod = [
      ['Tool Trade SK, s.r.o.','36000001','Ing. Ján Obchodník','predaj@tooltrade.example.com','+421 32 111 2233','tooltrade.example.com','Trenčín',5,'Rámcová zmluva 2026, doprava zdarma nad 200 €',
        [['NAR-001','TT-8100',12.40,1,1],['NAR-002','TT-8210',6.90,5,1],['NAR-003','TT-8211',6.90,5,1],
         ['NAR-004','TT-4410',9.20,1,1],['NAR-005','TT-7702',148.00,1,1],['OOP-001','TT-9001',4.50,10,1]]],
      ['ESD Systems Slovakia, s.r.o.','36000002','Mgr. Eva Antistatická','info@esdsystems.example.com','+421 2 555 6677','esdsystems.example.com','Bratislava',7,'Špecialista na ESD, atesty k dodávke',
        [['ESD-001','ES-1100',8.10,10,1],['ESD-002','ES-1200',5.40,10,1],['ESD-003','ES-1310',2.30,50,1],
         ['ESD-004','ES-2050',64.00,1,1],['ESD-005','ES-3020',18.70,5,1],['OOP-002','ES-4400',31.00,5,1],
         ['SPO-003','ES-5010',3.80,10,0]]],
      ['Elektronika Servis, s.r.o.','36000003','Tomáš Spájka','objednavky@elservis.example.com','+421 41 222 3344','elservis.example.com','Žilina',10,'Spájkovacia technika, autorizovaný servis',
        [['SPA-001','EL-ST80',214.00,1,1],['SPA-002','EL-D16',7.60,5,1],['SPA-003','EL-I04',7.60,5,1],
         ['SPA-004','EL-SN500',21.30,1,1],['SPA-005','EL-WICK2',2.10,10,1],['SPA-006','EL-FLUX',5.90,5,1]]],
      ['Metrológia Servis, s.r.o.','36000004','Ing. Lucia Kalibračná','servis@metroservis.example.com','+421 32 444 5566','metroservis.example.com','Dubnica nad Váhom',14,'Kalibrácia a dodávka meradiel, akreditované laboratórium',
        [['MER-001','MS-C150',39.00,1,1],['MER-002','MS-DMM7',129.00,1,1],['NAR-005','MS-TQ2',155.00,1,0]]],
      ['Spotreba Plus, s.r.o.','36000005','Katarína Materiálová','sklad@spotrebaplus.example.com','+421 33 777 8899','spotrebaplus.example.com','Nové Mesto n. Váhom',3,'Spotrebný materiál, závoz 2× týždenne',
        [['SPO-001','SP-IPA1',6.20,6,1],['SPO-002','SP-WIPE',9.40,6,1],['SPO-003','SP-TAPE',4.10,10,1]]],
    ];
    for (const [name, ico, person, email, phone, web, addr, lead, note, lines] of dod) {
      const sid = insS.run(name, ico, person, email, phone, web, addr, lead, note).lastInsertRowid;
      for (const [icode, sku, price, moq, prim] of lines) insSI.run(sid, it[icode], sku, price, moq, prim);
    }
  });

  tx();
  return true;
}

module.exports = { seedIfEmpty };
