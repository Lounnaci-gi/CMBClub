// src/database/database.js
// Couche SQLite – Init, migrations, CRUD complet

import * as SQLite from 'expo-sqlite';
import { buildAdherentCodeBase } from '../utils/adherentCode';
import { computePaymentStatus, PAYMENT_STATUS } from '../utils/payments';

let db = null;
let dbInitPromise = null;

export async function getDatabase() {
  if (db) return db;
  if (!dbInitPromise) {
    dbInitPromise = (async () => {
      const database = await SQLite.openDatabaseAsync('cmbclub.db');
      await initDatabase(database);
      db = database;
    })();
  }
  await dbInitPromise;
  return db;
}

async function initDatabase(database) {
  await database.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS saisons (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      annee INTEGER NOT NULL,
      dateDebut TEXT NOT NULL,
      dateFin TEXT NOT NULL,
      actif INTEGER DEFAULT 0,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS adherents (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      nom TEXT NOT NULL,
      prenom TEXT NOT NULL,
      dateNaissance TEXT NOT NULL,
      lieuNaissance TEXT NOT NULL,
      telephone TEXT,
      taille TEXT,
      groupeSanguin TEXT,
      observationsMedicales TEXT,
      photo TEXT,
      discipline TEXT,
      genre TEXT DEFAULT 'M',
      dateInscription TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS adherent_saisons (
      id TEXT PRIMARY KEY,
      adherentId TEXT NOT NULL,
      saisonId TEXT NOT NULL,
      dateInscription TEXT NOT NULL,
      actif INTEGER DEFAULT 1,
      FOREIGN KEY (adherentId) REFERENCES adherents(id),
      FOREIGN KEY (saisonId) REFERENCES saisons(id)
    );

    CREATE TABLE IF NOT EXISTS paiements (
      id TEXT PRIMARY KEY,
      adherentId TEXT NOT NULL,
      saisonId TEXT NOT NULL,
      type TEXT NOT NULL,
      label TEXT NOT NULL,
      mois INTEGER,
      annee INTEGER,
      montantDu REAL NOT NULL,
      remisePct REAL DEFAULT 0,
      remiseMontant REAL DEFAULT 0,
      montantPaye REAL DEFAULT 0,
      datePaiement TEXT,
      statut TEXT NOT NULL DEFAULT 'a_payer',
      notes TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY (adherentId) REFERENCES adherents(id),
      FOREIGN KEY (saisonId) REFERENCES saisons(id)
    );

    CREATE TABLE IF NOT EXISTS remises (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      pourcentage REAL NOT NULL,
      actif INTEGER DEFAULT 1,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'adherent',
      adherentId TEXT,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS disciplines (
      id TEXT PRIMARY KEY,
      nom TEXT UNIQUE NOT NULL,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS creneaux (
      id TEXT PRIMARY KEY,
      discipline TEXT NOT NULL,
      categorie TEXT NOT NULL,
      jour TEXT NOT NULL,
      heureDebut TEXT NOT NULL,
      heureFin TEXT NOT NULL,
      lieu TEXT,
      remarque TEXT,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS presences (
      id TEXT PRIMARY KEY,
      creneauId TEXT NOT NULL,
      adherentId TEXT NOT NULL,
      saisonId TEXT NOT NULL,
      dateSeance TEXT NOT NULL,
      statut TEXT NOT NULL DEFAULT 'present',
      remarque TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY (creneauId) REFERENCES creneaux(id),
      FOREIGN KEY (adherentId) REFERENCES adherents(id),
      FOREIGN KEY (saisonId) REFERENCES saisons(id)
    );
  `);

  // Migration : ajout de dateInscription si la colonne n'existe pas encore
  try {
    await database.execAsync(`ALTER TABLE adherents ADD COLUMN dateInscription TEXT`);
  } catch (_e) {
    // La colonne existe déjà, on ignore
  }

  // Seed config defaults
  await database.runAsync(
    `INSERT OR IGNORE INTO config (key, value) VALUES ('fraisInscription', '2000')`,
  );
  await database.runAsync(
    `INSERT OR IGNORE INTO config (key, value) VALUES ('fraisMensuel', '1500')`,
  );

  // Seed single admin user
  await database.runAsync(
    `INSERT OR IGNORE INTO users (id, username, password, role, createdAt) VALUES ('admin-001', 'admin', 'admin123', 'admin', datetime('now'))`,
  );

  // Enforce single admin policy: keep only one admin user, downgrade any extra admin users to 'adherent'
  const admins = await database.getAllAsync("SELECT id FROM users WHERE role = 'admin' ORDER BY CASE WHEN id = 'admin-001' THEN 0 ELSE 1 END, id ASC");
  if (admins.length > 1) {
    const keepId = admins[0].id;
    await database.runAsync(
      "UPDATE users SET role = 'adherent' WHERE role = 'admin' AND id != ?",
      [keepId],
    );
  }

  // Seed saison courante
  const yearNow = new Date().getMonth() + 1 >= 9 ? new Date().getFullYear() : new Date().getFullYear() - 1;
  const saisonLabel = `${yearNow}-${yearNow + 1}`;
  await database.runAsync(
    `INSERT OR IGNORE INTO saisons (id, label, annee, dateDebut, dateFin, actif, createdAt)
     VALUES ('saison-${yearNow}', ?, ?, ?, ?, 1, datetime('now'))`,
    [saisonLabel, yearNow, `${yearNow}-09-01`, `${yearNow + 1}-06-30`],
  );

  // Seed remises par défaut
  await database.runAsync(
    `INSERT OR IGNORE INTO remises (id, label, pourcentage, actif, createdAt) VALUES ('remise-famille', 'Remise Famille', 10, 1, datetime('now'))`,
  );
  await database.runAsync(
    `INSERT OR IGNORE INTO remises (id, label, pourcentage, actif, createdAt) VALUES ('remise-fidelite', 'Remise Fidélité', 5, 1, datetime('now'))`,
  );

  // Disciplines par défaut
  const defaultDisciplines = ['KickBoxing', 'Natation'];
  for (const d of defaultDisciplines) {
    const slug = d.toLowerCase().replace(/[^a-z0-9]/g, '');
    try {
      await database.runAsync(
        `INSERT OR IGNORE INTO disciplines (id, nom, createdAt) VALUES (?, ?, datetime('now'))`,
        [`disc-${slug}`, d],
      );
    } catch (_e) {
      // ignore any seeding error to avoid blocking startup
    }
  }

  // Créneaux par défaut
  const defaultCreneaux = [
    { id: 'creneau-kb-cadet-1a', discipline: 'KickBoxing', categorie: 'Cadet', jour: 'Lundi', heureDebut: '09:30', heureFin: '11:00', lieu: 'Grande Salle A', remarque: 'Séance matin - Physique & Technique' },
    { id: 'creneau-kb-cadet-1b', discipline: 'KickBoxing', categorie: 'Cadet', jour: 'Lundi', heureDebut: '17:30', heureFin: '19:00', lieu: 'Grande Salle A', remarque: 'Séance soir - Sparring & Tactique' },
    { id: 'creneau-kb-cadet-2', discipline: 'KickBoxing', categorie: 'Cadet', jour: 'Mercredi', heureDebut: '17:30', heureFin: '19:00', lieu: 'Grande Salle A', remarque: 'Prévoir protège-tibias' },
    { id: 'creneau-kb-senior-1', discipline: 'KickBoxing', categorie: 'Sénior', jour: 'Mardi', heureDebut: '19:00', heureFin: '20:30', lieu: 'Grande Salle A', remarque: 'Sparring guidé' },
    { id: 'creneau-kb-senior-2', discipline: 'KickBoxing', categorie: 'Sénior', jour: 'Jeudi', heureDebut: '19:00', heureFin: '20:30', lieu: 'Grande Salle A', remarque: 'Préparation physique' },
    { id: 'creneau-nat-poussin-1', discipline: 'Natation', categorie: 'Poussin', jour: 'Samedi', heureDebut: '09:00', heureFin: '10:15', lieu: 'Piscine B', remarque: 'Groupe 1 - Bonnet obligatoire' },
    { id: 'creneau-nat-poussin-2', discipline: 'Natation', categorie: 'Poussin', jour: 'Samedi', heureDebut: '10:30', heureFin: '11:45', lieu: 'Piscine B', remarque: 'Groupe 2 - Bonnet obligatoire' },
  ];
  for (const c of defaultCreneaux) {
    try {
      await database.runAsync(
        `INSERT OR IGNORE INTO creneaux (id, discipline, categorie, jour, heureDebut, heureFin, lieu, remarque, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        [c.id, c.discipline, c.categorie, c.jour, c.heureDebut, c.heureFin, c.lieu, c.remarque],
      );
    } catch (_e) {
      // ignore seeding error
    }
  }

  // ─── Seed 70 adhérents algériens ──────────────────────────────────────────
  // Catégories : Poussin (≤7), Pupille (8-10), Minime (11-13), Cadet (14-16),
  //              Junior (17-19), Sénior (20-34), Vétéran (≥35)
  // Disciplines : KickBoxing, Natation
  // Genre : M / F
  // Toutes les dates de naissance sont relatives à 2026-08-10 (date courante du projet)
  const seedAdherents = [
    // ── Poussin (nés 2019–2026) ──────────────────────────────────────────────
    { id: 'adh-001', nom: 'BELKADI',    prenom: 'Ryane',      dn: '2021-03-14', lieu: 'Alger',     disc: 'Natation',   genre: 'M', tel: '0551234001', gs: 'A+' },
    { id: 'adh-002', nom: 'MEDDAH',     prenom: 'Nour',       dn: '2020-07-22', lieu: 'Oran',      disc: 'Natation',   genre: 'F', tel: '0551234002', gs: 'O+' },
    { id: 'adh-003', nom: 'HADJADJ',    prenom: 'Amir',       dn: '2022-01-05', lieu: 'Blida',     disc: 'Natation',   genre: 'M', tel: '0551234003', gs: 'B+' },
    { id: 'adh-004', nom: 'BENBRAHIM',  prenom: 'Lina',       dn: '2021-11-18', lieu: 'Sétif',     disc: 'Natation',   genre: 'F', tel: '0551234004', gs: 'AB+' },
    { id: 'adh-005', nom: 'ZERROUK',    prenom: 'Youcef',     dn: '2019-06-30', lieu: 'Annaba',    disc: 'Natation',   genre: 'M', tel: '0551234005', gs: 'O-' },

    // ── Pupille (nés 2016–2018) ──────────────────────────────────────────────
    { id: 'adh-006', nom: 'AMRANI',     prenom: 'Ines',       dn: '2016-04-12', lieu: 'Alger',     disc: 'KickBoxing', genre: 'F', tel: '0551234006', gs: 'A-' },
    { id: 'adh-007', nom: 'FERHAT',     prenom: 'Bilal',      dn: '2017-08-09', lieu: 'Tizi Ouzou',disc: 'KickBoxing', genre: 'M', tel: '0551234007', gs: 'B-' },
    { id: 'adh-008', nom: 'AISSAOUI',   prenom: 'Sara',       dn: '2016-12-25', lieu: 'Constantine',disc: 'Natation',  genre: 'F', tel: '0551234008', gs: 'O+' },
    { id: 'adh-009', nom: 'BOUDAOUD',   prenom: 'Ilyes',      dn: '2018-02-14', lieu: 'Béjaïa',    disc: 'KickBoxing', genre: 'M', tel: '0551234009', gs: 'A+' },
    { id: 'adh-010', nom: 'MEZIANE',    prenom: 'Amira',      dn: '2017-05-20', lieu: 'Jijel',     disc: 'Natation',   genre: 'F', tel: '0551234010', gs: 'AB-' },

    // ── Minime (nés 2013–2015) ──────────────────────────────────────────────
    { id: 'adh-011', nom: 'KHELIFI',    prenom: 'Rayane',     dn: '2013-09-03', lieu: 'Alger',     disc: 'KickBoxing', genre: 'M', tel: '0551234011', gs: 'B+' },
    { id: 'adh-012', nom: 'TEBBOUNE',   prenom: 'Hadjer',     dn: '2014-06-17', lieu: 'Mostaganem',disc: 'KickBoxing', genre: 'F', tel: '0551234012', gs: 'O+' },
    { id: 'adh-013', nom: 'BOUDIAF',    prenom: 'Zakaria',    dn: '2015-01-28', lieu: 'Chlef',     disc: 'Natation',   genre: 'M', tel: '0551234013', gs: 'A+' },
    { id: 'adh-014', nom: 'MAKHLOUFI',  prenom: 'Manel',      dn: '2013-11-11', lieu: 'Médéa',     disc: 'Natation',   genre: 'F', tel: '0551234014', gs: 'AB+' },
    { id: 'adh-015', nom: 'CHERIFI',    prenom: 'Anes',       dn: '2014-03-07', lieu: 'Batna',     disc: 'KickBoxing', genre: 'M', tel: '0551234015', gs: 'O-' },
    { id: 'adh-016', nom: 'BENALI',     prenom: 'Wissem',     dn: '2015-07-19', lieu: 'Skikda',    disc: 'KickBoxing', genre: 'M', tel: '0551234016', gs: 'B-' },
    { id: 'adh-017', nom: 'SELLAMI',    prenom: 'Rania',      dn: '2013-04-25', lieu: 'Alger',     disc: 'Natation',   genre: 'F', tel: '0551234017', gs: 'A-' },

    // ── Cadet (nés 2010–2012) ──────────────────────────────────────────────
    { id: 'adh-018', nom: 'BENAISSA',   prenom: 'Hamza',      dn: '2010-08-22', lieu: 'Alger',     disc: 'KickBoxing', genre: 'M', tel: '0551234018', gs: 'O+' },
    { id: 'adh-019', nom: 'GHOMARI',    prenom: 'Cylia',      dn: '2011-02-14', lieu: 'Oran',      disc: 'KickBoxing', genre: 'F', tel: '0551234019', gs: 'A+' },
    { id: 'adh-020', nom: 'SAADI',      prenom: 'Fares',      dn: '2012-06-05', lieu: 'Sétif',     disc: 'Natation',   genre: 'M', tel: '0551234020', gs: 'B+' },
    { id: 'adh-021', nom: 'HADJAB',     prenom: 'Asma',       dn: '2010-11-30', lieu: 'Annaba',    disc: 'Natation',   genre: 'F', tel: '0551234021', gs: 'AB+' },
    { id: 'adh-022', nom: 'LALAOUI',    prenom: 'Nassim',     dn: '2011-04-18', lieu: 'Constantine',disc: 'KickBoxing', genre: 'M', tel: '0551234022', gs: 'O-' },
    { id: 'adh-023', nom: 'BOUZIDI',    prenom: 'Yasmina',    dn: '2012-09-12', lieu: 'Béjaïa',    disc: 'KickBoxing', genre: 'F', tel: '0551234023', gs: 'A-' },
    { id: 'adh-024', nom: 'AOUAD',      prenom: 'Samy',       dn: '2010-03-27', lieu: 'Tizi Ouzou',disc: 'Natation',   genre: 'M', tel: '0551234024', gs: 'B-' },
    { id: 'adh-025', nom: 'CHIBANE',    prenom: 'Lyna',       dn: '2011-07-08', lieu: 'Blida',     disc: 'KickBoxing', genre: 'F', tel: '0551234025', gs: 'O+' },
    { id: 'adh-026', nom: 'MOKRANI',    prenom: 'Adel',       dn: '2012-01-15', lieu: 'Djelfa',    disc: 'KickBoxing', genre: 'M', tel: '0551234026', gs: 'A+' },

    // ── Junior (nés 2007–2009) ──────────────────────────────────────────────
    { id: 'adh-027', nom: 'BENADDA',    prenom: 'Ishak',      dn: '2007-05-16', lieu: 'Alger',     disc: 'KickBoxing', genre: 'M', tel: '0551234027', gs: 'O+' },
    { id: 'adh-028', nom: 'BOUAKKAZ',   prenom: 'Nawel',      dn: '2008-09-28', lieu: 'Oran',      disc: 'KickBoxing', genre: 'F', tel: '0551234028', gs: 'B+' },
    { id: 'adh-029', nom: 'HADJ SAID',  prenom: 'Karim',      dn: '2009-03-10', lieu: 'Sétif',     disc: 'Natation',   genre: 'M', tel: '0551234029', gs: 'A+' },
    { id: 'adh-030', nom: 'DJAMAI',     prenom: 'Sabrina',    dn: '2007-12-22', lieu: 'Bejaia',    disc: 'Natation',   genre: 'F', tel: '0551234030', gs: 'AB+' },
    { id: 'adh-031', nom: 'MENACER',    prenom: 'Yassine',    dn: '2008-06-04', lieu: 'Constantine',disc: 'KickBoxing', genre: 'M', tel: '0551234031', gs: 'O-' },
    { id: 'adh-032', nom: 'BOULENOUAR', prenom: 'Meriem',     dn: '2009-10-17', lieu: 'Annaba',    disc: 'KickBoxing', genre: 'F', tel: '0551234032', gs: 'A-' },
    { id: 'adh-033', nom: 'AISSANI',    prenom: 'Djawad',     dn: '2007-07-31', lieu: 'Tizi Ouzou',disc: 'Natation',   genre: 'M', tel: '0551234033', gs: 'B-' },
    { id: 'adh-034', nom: 'HAMIDOU',    prenom: 'Douaa',      dn: '2008-02-19', lieu: 'Bouira',    disc: 'Natation',   genre: 'F', tel: '0551234034', gs: 'O+' },

    // ── Sénior (nés 1992–2006) ──────────────────────────────────────────────
    { id: 'adh-035', nom: 'BENHADJ',    prenom: 'Rachid',     dn: '2001-04-05', lieu: 'Alger',     disc: 'KickBoxing', genre: 'M', tel: '0551234035', gs: 'A+' },
    { id: 'adh-036', nom: 'MEDJDOUB',   prenom: 'Soraya',     dn: '2003-09-13', lieu: 'Oran',      disc: 'KickBoxing', genre: 'F', tel: '0551234036', gs: 'O+' },
    { id: 'adh-037', nom: 'BELOUFA',    prenom: 'Mehdi',      dn: '2000-01-27', lieu: 'Sétif',     disc: 'Natation',   genre: 'M', tel: '0551234037', gs: 'B+' },
    { id: 'adh-038', nom: 'ZIANI',      prenom: 'Djamila',    dn: '1999-06-08', lieu: 'Blida',     disc: 'Natation',   genre: 'F', tel: '0551234038', gs: 'AB+' },
    { id: 'adh-039', nom: 'KADA',       prenom: 'Abdelaziz',  dn: '2002-11-20', lieu: 'Constantine',disc: 'KickBoxing', genre: 'M', tel: '0551234039', gs: 'O-' },
    { id: 'adh-040', nom: 'BOURAHLA',   prenom: 'Houria',     dn: '2004-03-15', lieu: 'Annaba',    disc: 'KickBoxing', genre: 'F', tel: '0551234040', gs: 'A-' },
    { id: 'adh-041', nom: 'SAIDANI',    prenom: 'Lotfi',      dn: '1998-08-02', lieu: 'Tizi Ouzou',disc: 'Natation',   genre: 'M', tel: '0551234041', gs: 'B-' },
    { id: 'adh-042', nom: 'HADJAJ',     prenom: 'Zineb',      dn: '2005-12-11', lieu: 'Jijel',     disc: 'Natation',   genre: 'F', tel: '0551234042', gs: 'O+' },
    { id: 'adh-043', nom: 'GHELLAL',    prenom: 'Nassim',     dn: '1997-04-24', lieu: 'Mostaganem',disc: 'KickBoxing', genre: 'M', tel: '0551234043', gs: 'A+' },
    { id: 'adh-044', nom: 'TOUMI',      prenom: 'Lydia',      dn: '2006-07-07', lieu: 'Alger',     disc: 'KickBoxing', genre: 'F', tel: '0551234044', gs: 'AB-' },
    { id: 'adh-045', nom: 'BOUCHAMA',   prenom: 'Walid',      dn: '1995-02-18', lieu: 'Batna',     disc: 'Natation',   genre: 'M', tel: '0551234045', gs: 'O+' },
    { id: 'adh-046', nom: 'BENSALEM',   prenom: 'Amina',      dn: '2000-10-30', lieu: 'Chlef',     disc: 'KickBoxing', genre: 'F', tel: '0551234046', gs: 'B+' },
    { id: 'adh-047', nom: 'REZKI',      prenom: 'Karim',      dn: '2002-05-09', lieu: 'Skikda',    disc: 'KickBoxing', genre: 'M', tel: '0551234047', gs: 'A+' },
    { id: 'adh-048', nom: 'OUALI',      prenom: 'Rima',       dn: '1996-09-21', lieu: 'Oran',      disc: 'Natation',   genre: 'F', tel: '0551234048', gs: 'O-' },
    { id: 'adh-049', nom: 'HAMACHE',    prenom: 'Tarek',      dn: '2003-01-14', lieu: 'Alger',     disc: 'Natation',   genre: 'M', tel: '0551234049', gs: 'AB+' },
    { id: 'adh-050', nom: 'ZITOUNI',    prenom: 'Chaima',     dn: '2005-04-26', lieu: 'Sétif',     disc: 'KickBoxing', genre: 'F', tel: '0551234050', gs: 'A+' },
    { id: 'adh-051', nom: 'BENNACER',   prenom: 'Adlane',     dn: '1993-07-03', lieu: 'Constantine',disc: 'KickBoxing', genre: 'M', tel: '0551234051', gs: 'B+' },
    { id: 'adh-052', nom: 'SELLOUM',    prenom: 'Selma',      dn: '2004-11-16', lieu: 'Annaba',    disc: 'Natation',   genre: 'F', tel: '0551234052', gs: 'O+' },
    { id: 'adh-053', nom: 'BOUHIRED',   prenom: 'Djamel',     dn: '1999-03-08', lieu: 'Blida',     disc: 'KickBoxing', genre: 'M', tel: '0551234053', gs: 'A-' },
    { id: 'adh-054', nom: 'OUARAB',     prenom: 'Meriem',     dn: '2001-08-19', lieu: 'Médéa',     disc: 'Natation',   genre: 'F', tel: '0551234054', gs: 'B-' },

    // ── Vétéran (nés avant 1992) ─────────────────────────────────────────────
    { id: 'adh-055', nom: 'BENHADDAD',  prenom: 'Mustapha',   dn: '1982-05-10', lieu: 'Alger',     disc: 'KickBoxing', genre: 'M', tel: '0551234055', gs: 'O+' },
    { id: 'adh-056', nom: 'CHIKHI',     prenom: 'Fatima',     dn: '1985-09-23', lieu: 'Oran',      disc: 'Natation',   genre: 'F', tel: '0551234056', gs: 'A+' },
    { id: 'adh-057', nom: 'LAOUEDJ',    prenom: 'Abdelkader', dn: '1978-03-17', lieu: 'Sétif',     disc: 'KickBoxing', genre: 'M', tel: '0551234057', gs: 'B+' },
    { id: 'adh-058', nom: 'BOUKERZAZA', prenom: 'Nacira',     dn: '1980-12-01', lieu: 'Béjaïa',    disc: 'Natation',   genre: 'F', tel: '0551234058', gs: 'AB+' },
    { id: 'adh-059', nom: 'HAMDI',      prenom: 'Said',       dn: '1975-06-14', lieu: 'Constantine',disc: 'KickBoxing', genre: 'M', tel: '0551234059', gs: 'O-' },
    { id: 'adh-060', nom: 'BENALI',     prenom: 'Zohra',      dn: '1988-02-28', lieu: 'Annaba',    disc: 'KickBoxing', genre: 'F', tel: '0551234060', gs: 'A-' },
    { id: 'adh-061', nom: 'AOUDJIT',    prenom: 'Hocine',     dn: '1970-10-05', lieu: 'Tizi Ouzou',disc: 'Natation',   genre: 'M', tel: '0551234061', gs: 'B-' },
    { id: 'adh-062', nom: 'GUENANE',    prenom: 'Nadia',      dn: '1983-07-19', lieu: 'Blida',     disc: 'Natation',   genre: 'F', tel: '0551234062', gs: 'O+' },
    { id: 'adh-063', nom: 'BOUSSAID',   prenom: 'Farid',      dn: '1976-04-11', lieu: 'Batna',     disc: 'KickBoxing', genre: 'M', tel: '0551234063', gs: 'A+' },
    { id: 'adh-064', nom: 'LAZREG',     prenom: 'Malika',     dn: '1987-01-30', lieu: 'Chlef',     disc: 'KickBoxing', genre: 'F', tel: '0551234064', gs: 'AB-' },
    { id: 'adh-065', nom: 'DJIDJIK',    prenom: 'Djillali',   dn: '1969-08-22', lieu: 'Mostaganem',disc: 'Natation',   genre: 'M', tel: '0551234065', gs: 'O+' },
    { id: 'adh-066', nom: 'MANSOURI',   prenom: 'Houda',      dn: '1991-11-07', lieu: 'Jijel',     disc: 'Natation',   genre: 'F', tel: '0551234066', gs: 'B+' },

    // ── Complément mixte pour atteindre 70 ──────────────────────────────────
    { id: 'adh-067', nom: 'BELLOULA',   prenom: 'Fayçal',     dn: '2006-02-14', lieu: 'Alger',     disc: 'KickBoxing', genre: 'M', tel: '0551234067', gs: 'A+' },
    { id: 'adh-068', nom: 'CHERCHALI',  prenom: 'Aya',        dn: '2015-10-03', lieu: 'Oran',      disc: 'Natation',   genre: 'F', tel: '0551234068', gs: 'O+' },
    { id: 'adh-069', nom: 'BENMEBAREK', prenom: 'Rami',       dn: '2011-05-27', lieu: 'Sétif',     disc: 'KickBoxing', genre: 'M', tel: '0551234069', gs: 'B+' },
    { id: 'adh-070', nom: 'DOUADI',     prenom: 'Yasmine',    dn: '1994-08-15', lieu: 'Constantine',disc: 'Natation',   genre: 'F', tel: '0551234070', gs: 'AB+' },
  ];

  const currentYear = new Date().getFullYear();
  const activeSaisonId = `saison-${currentYear >= 9 ? currentYear : currentYear - 1}`;

  for (const a of seedAdherents) {
    try {
      const code = buildAdherentCodeBase({
        nom: a.nom, prenom: a.prenom, dateNaissance: a.dn,
      });
      await database.runAsync(
        `INSERT OR IGNORE INTO adherents
           (id, code, nom, prenom, dateNaissance, lieuNaissance, telephone, taille,
            groupeSanguin, observationsMedicales, photo, discipline, genre, dateInscription, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL, NULL, ?, ?, ?, datetime('now'), datetime('now'))`,
        [a.id, code, a.nom, a.prenom, a.dn, a.lieu, a.tel, a.gs, a.disc, a.genre, a.dn.slice(0, 4) + '-09-01'],
      );

      // Inscription à la saison active
      const saisonRow = await database.getFirstAsync(`SELECT id FROM saisons WHERE actif = 1 LIMIT 1`);
      const saisonId = saisonRow?.id || activeSaisonId;
      await database.runAsync(
        `INSERT OR IGNORE INTO adherent_saisons (id, adherentId, saisonId, dateInscription, actif)
         VALUES (?, ?, ?, ?, 1)`,
        [`as-${a.id}`, a.id, saisonId, a.dn.slice(0, 4) + '-09-01'],
      );
    } catch (_e) {
      // ignore seeding errors (ex: duplicates)
    }
  }
}


// ──────────────── CONFIG ────────────────

export async function getConfig() {
  const db = await getDatabase();
  const rows = await db.getAllAsync('SELECT key, value FROM config');
  const config = {};
  rows.forEach(r => { config[r.key] = parseFloat(r.value) || r.value; });
  return config;
}

export async function setConfig(key, value) {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)`,
    [key, String(value)],
  );
}

// ──────────────── SAISONS ────────────────

export async function getSaisons() {
  const db = await getDatabase();
  return await db.getAllAsync('SELECT * FROM saisons ORDER BY annee DESC');
}

export async function getSaisonActive() {
  const db = await getDatabase();
  return await db.getFirstAsync('SELECT * FROM saisons WHERE actif = 1 LIMIT 1');
}

export async function createSaison(saison) {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO saisons (id, label, annee, dateDebut, dateFin, actif, createdAt) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
    [saison.id, saison.label, saison.annee, saison.dateDebut, saison.dateFin, saison.actif ? 1 : 0],
  );
}

export async function activateSaison(saisonId) {
  const db = await getDatabase();
  await db.runAsync('UPDATE saisons SET actif = 0');
  await db.runAsync('UPDATE saisons SET actif = 1 WHERE id = ?', [saisonId]);
}

// ──────────────── ADHÉRENTS ────────────────

export async function getAdherents() {
  const db = await getDatabase();
  return await db.getAllAsync('SELECT * FROM adherents ORDER BY nom, prenom');
}

export async function getAdherentById(id) {
  const db = await getDatabase();
  return await db.getFirstAsync('SELECT * FROM adherents WHERE id = ?', [id]);
}

export async function getAdherentByCode(code) {
  const db = await getDatabase();
  return await db.getFirstAsync('SELECT * FROM adherents WHERE code = ?', [code]);
}

export async function createAdherent(adherent) {
  const db = await getDatabase();
  const now = new Date().toISOString();
  // La date d'inscription est automatiquement la date du jour si non fournie
  const dateInscription = adherent.dateInscription || now.slice(0, 10);
  await db.runAsync(
    `INSERT INTO adherents (id, code, nom, prenom, dateNaissance, lieuNaissance, telephone, taille, groupeSanguin, observationsMedicales, photo, discipline, genre, dateInscription, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      adherent.id, adherent.code, adherent.nom, adherent.prenom,
      adherent.dateNaissance, adherent.lieuNaissance, adherent.telephone || null,
      adherent.taille || null, adherent.groupeSanguin || null,
      adherent.observationsMedicales || null, adherent.photo || null,
      adherent.discipline || null, adherent.genre || 'M', dateInscription, now, now,
    ],
  );
}

export async function updateAdherent(adherent) {
  const db = await getDatabase();
  const now = new Date().toISOString();
  // Le code et la dateInscription ne sont jamais modifiés après création
  await db.runAsync(
    `UPDATE adherents SET nom=?, prenom=?, dateNaissance=?, lieuNaissance=?, telephone=?, taille=?, groupeSanguin=?, observationsMedicales=?, photo=?, discipline=?, genre=?, updatedAt=? WHERE id=?`,
    [
      adherent.nom, adherent.prenom, adherent.dateNaissance,
      adherent.lieuNaissance, adherent.telephone || null, adherent.taille || null,
      adherent.groupeSanguin || null, adherent.observationsMedicales || null,
      adherent.photo || null, adherent.discipline || null, adherent.genre || 'M',
      now, adherent.id,
    ],
  );
}

export async function deleteAdherent(id) {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM paiements WHERE adherentId = ?', [id]);
  await db.runAsync('DELETE FROM adherent_saisons WHERE adherentId = ?', [id]);
  await db.runAsync('DELETE FROM users WHERE adherentId = ?', [id]);
  await db.runAsync('DELETE FROM adherents WHERE id = ?', [id]);
}

// ──────────────── ADHÉRENT-SAISONS ────────────────


export async function enrollAdherentInSaison(adherentId, saisonId, dateInscription) {
  const db = await getDatabase();
  const id = `as-${adherentId}-${saisonId}`;
  await db.runAsync(
    `INSERT OR IGNORE INTO adherent_saisons (id, adherentId, saisonId, dateInscription, actif) VALUES (?, ?, ?, ?, 1)`,
    [id, adherentId, saisonId, dateInscription],
  );
}


// ──────────────── PAIEMENTS ────────────────

export async function getPaiementsByAdherent(adherentId, saisonId) {
  const db = await getDatabase();
  return await db.getAllAsync(
    `SELECT * FROM paiements WHERE adherentId = ? AND saisonId = ? ORDER BY type DESC, annee, mois`,
    [adherentId, saisonId],
  );
}

export async function getAllPaiementsBySaison(saisonId) {
  const db = await getDatabase();
  return await db.getAllAsync(
    `SELECT p.*, a.nom, a.prenom, a.code, a.discipline, a.dateNaissance FROM paiements p
     JOIN adherents a ON a.id = p.adherentId
     WHERE p.saisonId = ? ORDER BY p.statut, a.nom`,
    [saisonId],
  );
}

export async function createPaiement(paiement) {
  const db = await getDatabase();
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO paiements (id, adherentId, saisonId, type, label, mois, annee, montantDu, remisePct, remiseMontant, montantPaye, datePaiement, statut, notes, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      paiement.id, paiement.adherentId, paiement.saisonId,
      paiement.type, paiement.label, paiement.mois || null, paiement.annee || null,
      paiement.montantDu, paiement.remisePct || 0, paiement.remiseMontant || 0,
      paiement.montantPaye || 0, paiement.datePaiement || null,
      paiement.statut || 'a_payer', paiement.notes || null, now, now,
    ],
  );
}

export async function updatePaiement(paiement) {
  const db = await getDatabase();
  const now = new Date().toISOString();
  await db.runAsync(
    `UPDATE paiements SET montantPaye=?, remisePct=?, remiseMontant=?, datePaiement=?, statut=?, notes=?, updatedAt=? WHERE id=?`,
    [
      paiement.montantPaye, paiement.remisePct || 0, paiement.remiseMontant || 0,
      paiement.datePaiement || null, paiement.statut,
      paiement.notes || null, now, paiement.id,
    ],
  );
}

export async function getStatsBySaison(saisonId) {
  const db = await getDatabase();
  const nbAdherents = await db.getFirstAsync(
    'SELECT COUNT(*) as count FROM adherent_saisons WHERE saisonId = ? AND actif = 1',
    [saisonId],
  );
  const paiements = await db.getAllAsync(
    'SELECT statut, SUM(montantPaye) as total FROM paiements WHERE saisonId = ? GROUP BY statut',
    [saisonId],
  );
  const retards = await db.getFirstAsync(
    "SELECT COUNT(DISTINCT adherentId) as count FROM paiements WHERE saisonId = ? AND statut = 'en_retard'",
    [saisonId],
  );
  const collected = paiements.reduce((sum, p) => sum + (p.total || 0), 0);
  return {
    nbAdherents: nbAdherents?.count || 0,
    collected,
    retards: retards?.count || 0,
  };
}

// ──────────────── REMISES ────────────────

export async function getRemises() {
  const db = await getDatabase();
  return await db.getAllAsync('SELECT * FROM remises WHERE actif = 1 ORDER BY label');
}

export async function createRemise(remise) {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO remises (id, label, pourcentage, actif, createdAt) VALUES (?, ?, ?, 1, datetime('now'))`,
    [remise.id, remise.label, remise.pourcentage],
  );
}

export async function updateRemise(remise) {
  const db = await getDatabase();
  await db.runAsync(
    'UPDATE remises SET label=?, pourcentage=?, actif=? WHERE id=?',
    [remise.label, remise.pourcentage, remise.actif ? 1 : 0, remise.id],
  );
}

export async function deleteRemise(id) {
  const db = await getDatabase();
  await db.runAsync('UPDATE remises SET actif = 0 WHERE id = ?', [id]);
}

// ──────────────── USERS ────────────────

export async function getUserByCredentials(username, password) {
  const db = await getDatabase();
  return await db.getFirstAsync(
    'SELECT * FROM users WHERE LOWER(username) = LOWER(?) AND password = ?',
    [username, password],
  );
}

export async function getUserByAdherentId(adherentId) {
  const db = await getDatabase();
  return await db.getFirstAsync('SELECT * FROM users WHERE adherentId = ?', [adherentId]);
}

export async function getAdminUser() {
  const db = await getDatabase();
  return await db.getFirstAsync("SELECT * FROM users WHERE role = 'admin' LIMIT 1");
}

export async function getAdminCount() {
  const db = await getDatabase();
  const row = await db.getFirstAsync("SELECT COUNT(*) as count FROM users WHERE role = 'admin'");
  return row?.count || 0;
}

export async function createUser(user) {
  const db = await getDatabase();
  let requestedRole = user.role || 'adherent';

  // Single admin policy: only 1 user in the system can have role = 'admin'
  if (requestedRole === 'admin') {
    const existingAdmin = await db.getFirstAsync("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
    if (existingAdmin && existingAdmin.id !== user.id) {
      requestedRole = 'adherent';
    }
  }

  await db.runAsync(
    `INSERT INTO users (id, username, password, role, adherentId, createdAt) VALUES (?, ?, ?, ?, ?, datetime('now'))`,
    [user.id, user.username, user.password, requestedRole, user.adherentId || null],
  );
}

export async function updateAdminCredentials(newUsername, newPassword) {
  const db = await getDatabase();
  const admin = await getAdminUser();
  if (!admin) {
    throw new Error("Compte administrateur introuvable.");
  }
  const cleanUsername = newUsername.trim();
  const cleanPassword = newPassword.trim();
  if (!cleanUsername || !cleanPassword) {
    throw new Error("L'identifiant et le mot de passe sont obligatoires.");
  }

  const existingUser = await db.getFirstAsync(
    "SELECT id FROM users WHERE LOWER(username) = LOWER(?) AND id != ?",
    [cleanUsername, admin.id],
  );
  if (existingUser) {
    throw new Error("Cet identifiant est déjà utilisé par un autre utilisateur.");
  }

  await db.runAsync(
    "UPDATE users SET username = ?, password = ? WHERE id = ?",
    [cleanUsername, cleanPassword, admin.id],
  );
  return await getAdminUser();
}

export async function updateUserPassword(userId, password) {
  const db = await getDatabase();
  await db.runAsync('UPDATE users SET password = ? WHERE id = ?', [password, userId]);
}

/**
 * Crée un compte adhérent (username = code, mot de passe = date AAMMJJ)
 */
export async function ensureAdherentAccount(adherent) {
  const existing = await getUserByAdherentId(adherent.id);
  if (existing) return { user: existing, created: false, password: null };

  const password = (adherent.dateNaissance || '').replace(/-/g, '').slice(2) || '000000';
  const user = {
    id: `user-${adherent.id}`,
    username: adherent.code,
    password,
    role: 'adherent',
    adherentId: adherent.id,
  };
  await createUser(user);
  return { user, created: true, password };
}

/**
 * Recalcule et met à jour les statuts (retards) des paiements d'une saison
 */
export async function refreshPaymentStatuses(saisonId) {
  const db = await getDatabase();
  const paiements = saisonId
    ? await db.getAllAsync('SELECT * FROM paiements WHERE saisonId = ?', [saisonId])
    : await db.getAllAsync('SELECT * FROM paiements');

  for (const p of paiements) {
    if (p.statut === PAYMENT_STATUS.PAYE) continue;
    const next = computePaymentStatus(p);
    if (next !== p.statut) {
      await db.runAsync(
        'UPDATE paiements SET statut = ?, updatedAt = ? WHERE id = ?',
        [next, new Date().toISOString(), p.id],
      );
    }
  }
}

/**
 * Statut de paiement agrégé par adhérent pour une saison
 */
export async function getPaymentStatusByAdherent(saisonId) {
  const db = await getDatabase();
  if (!saisonId) return {};
  await refreshPaymentStatuses(saisonId);
  const rows = await db.getAllAsync(
    'SELECT adherentId, statut FROM paiements WHERE saisonId = ?',
    [saisonId],
  );
  const byAdherent = {};
  for (const r of rows) {
    if (!byAdherent[r.adherentId]) byAdherent[r.adherentId] = [];
    byAdherent[r.adherentId].push(r.statut);
  }
  const result = {};
  for (const [id, statuses] of Object.entries(byAdherent)) {
    if (statuses.includes(PAYMENT_STATUS.EN_RETARD)) result[id] = PAYMENT_STATUS.EN_RETARD;
    else if (statuses.every(s => s === PAYMENT_STATUS.PAYE)) result[id] = PAYMENT_STATUS.PAYE;
    else result[id] = PAYMENT_STATUS.A_PAYER;
  }
  return result;
}

/**
 * Vérifie si un adhérent est inscrit à une saison
 */
export async function isAdherentEnrolled(adherentId, saisonId) {
  const db = await getDatabase();
  const row = await db.getFirstAsync(
    'SELECT id FROM adherent_saisons WHERE adherentId = ? AND saisonId = ? AND actif = 1',
    [adherentId, saisonId],
  );
  return !!row;
}

/**
 * Génère un code unique à partir des infos d'identité.
 * En cas de collision, ajoute un suffixe numérique.
 */
export async function generateUniqueAdherentCode(data) {
  const base = buildAdherentCodeBase(data); // 9 caractères
  // Tentative sans suffixe
  if (!(await getAdherentByCode(base))) return base;

  // En cas de collision, on ajoute un suffixe 1 caractère : A-Z puis 0-9
  // Code final = 9 + 1 = 10 caractères max
  const suffixes = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  for (const s of suffixes) {
    const code = `${base}${s}`;
    if (!(await getAdherentByCode(code))) return code;
  }
  // Cas extrême : tous les suffixes sont pris (très improbable), on tronque la base à 8 et on réessaie
  const shortBase = base.slice(0, 8);
  for (const s of suffixes) {
    for (const s2 of suffixes) {
      const code = `${shortBase}${s}${s2}`;
      if (!(await getAdherentByCode(code))) return code;
    }
  }
  throw new Error('Impossible de générer un code unique pour cet adhérent.');
}

// ──────────────── DISCIPLINES ────────────────

export async function getDisciplines() {
  const db = await getDatabase();
  return await db.getAllAsync('SELECT * FROM disciplines ORDER BY nom ASC');
}

export async function createDiscipline(discipline) {
  const db = await getDatabase();
  const createdAt = discipline.createdAt || new Date().toISOString();
  try {
    await db.runAsync(
      `INSERT INTO disciplines (id, nom, createdAt) VALUES (?, ?, ?)`,
      [discipline.id, discipline.nom.trim(), createdAt],
    );
  } catch (e) {
    if (String(e.message).includes('UNIQUE constraint failed: disciplines.nom')) {
      throw new Error(`La discipline "${discipline.nom.trim()}" existe déjà.`);
    }
    throw e;
  }
}

export async function updateDiscipline(discipline, oldNom) {
  const db = await getDatabase();
  try {
    await db.runAsync(
      `UPDATE disciplines SET nom = ? WHERE id = ?`,
      [discipline.nom.trim(), discipline.id],
    );
  } catch (e) {
    if (String(e.message).includes('UNIQUE constraint failed: disciplines.nom')) {
      throw new Error(`La discipline "${discipline.nom.trim()}" existe déjà.`);
    }
    throw e;
  }
  const trimmedNom = discipline.nom.trim();
  if (oldNom && oldNom !== trimmedNom) {
    await db.runAsync(
      `UPDATE adherents SET discipline = ? WHERE discipline = ?`,
      [trimmedNom, oldNom],
    );
  }
}

export async function deleteDiscipline(id) {
  const db = await getDatabase();
  const disc = await db.getFirstAsync('SELECT nom FROM disciplines WHERE id = ?', [id]);
  if (disc) {
    const row = await db.getFirstAsync(
      'SELECT COUNT(*) as count FROM adherents WHERE discipline = ?',
      [disc.nom],
    );
    if (row && row.count > 0) {
      throw new Error(`Impossible de supprimer "${disc.nom}" car ${row.count} adhérent(s) y sont inscrit(s).`);
    }
  }
  await db.runAsync(`DELETE FROM disciplines WHERE id = ?`, [id]);
}

// ──────────────── CRÉNEAUX ────────────────

export async function getCreneaux() {
  const db = await getDatabase();
  return await db.getAllAsync('SELECT * FROM creneaux ORDER BY CASE jour WHEN "Lundi" THEN 1 WHEN "Mardi" THEN 2 WHEN "Mercredi" THEN 3 WHEN "Jeudi" THEN 4 WHEN "Vendredi" THEN 5 WHEN "Samedi" THEN 6 WHEN "Dimanche" THEN 7 END, heureDebut ASC');
}

export async function createCreneau(creneau) {
  const db = await getDatabase();
  const createdAt = creneau.createdAt || new Date().toISOString();
  await db.runAsync(
    `INSERT INTO creneaux (id, discipline, categorie, jour, heureDebut, heureFin, lieu, remarque, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      creneau.id,
      creneau.discipline,
      creneau.categorie,
      creneau.jour,
      creneau.heureDebut,
      creneau.heureFin,
      creneau.lieu || null,
      creneau.remarque || null,
      createdAt,
    ],
  );
}

export async function updateCreneau(creneau) {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE creneaux SET discipline = ?, categorie = ?, jour = ?, heureDebut = ?, heureFin = ?, lieu = ?, remarque = ? WHERE id = ?`,
    [
      creneau.discipline,
      creneau.categorie,
      creneau.jour,
      creneau.heureDebut,
      creneau.heureFin,
      creneau.lieu || null,
      creneau.remarque || null,
      creneau.id,
    ],
  );
}

export async function deleteCreneau(id) {
  const db = await getDatabase();
  await db.runAsync(`DELETE FROM presences WHERE creneauId = ?`, [id]);
  await db.runAsync(`DELETE FROM creneaux WHERE id = ?`, [id]);
}

// ──────────────── PRÉSENCES & ABSENCES ────────────────

export async function getPresencesBySeance(creneauId, dateSeance) {
  const db = await getDatabase();
  return await db.getAllAsync(
    `SELECT p.*, a.nom, a.prenom, a.code, a.dateNaissance, a.photo
     FROM presences p
     JOIN adherents a ON a.id = p.adherentId
     WHERE p.creneauId = ? AND p.dateSeance = ?
     ORDER BY a.nom, a.prenom`,
    [creneauId, dateSeance],
  );
}

export async function getEligibleAdherentsForCreneau(creneauId, saisonId) {
  const db = await getDatabase();
  const creneau = await db.getFirstAsync('SELECT * FROM creneaux WHERE id = ?', [creneauId]);
  const allAdherents = await db.getAllAsync('SELECT * FROM adherents ORDER BY nom, prenom');

  if (!allAdherents || allAdherents.length === 0) return [];
  if (!creneau) return allAdherents;

  const { getCategoryByAge } = require('../utils/categories');

  const creneauDiscip = (creneau.discipline || '').trim().toLowerCase();
  const creneauCat = (creneau.categorie || '').trim().toLowerCase();

  const scored = allAdherents.map(a => {
    const adhDiscip = (a.discipline || '').trim().toLowerCase();
    const matchDisc = !adhDiscip ||
      !creneauDiscip ||
      creneauDiscip.includes('tout') ||
      adhDiscip.includes(creneauDiscip) ||
      creneauDiscip.includes(adhDiscip);

    const catObj = getCategoryByAge(a.dateNaissance);
    const catLabel = (catObj?.label || '').trim().toLowerCase();
    const matchCat = !creneauCat ||
      creneauCat.includes('tout') ||
      catLabel === creneauCat;

    let score = 0;
    if (matchDisc && matchCat) score = 2;
    else if (matchDisc || matchCat) score = 1;

    return { adherent: a, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.map(s => s.adherent);
}

export async function savePresencesSeance(creneauId, dateSeance, saisonId, presencesList) {
  const db = await getDatabase();
  const d = new Date();
  const todayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  if (dateSeance > todayStr) {
    throw new Error("L'enregistrement des présences est interdit pour les dates futures.");
  }

  const now = new Date().toISOString();

  let effectiveSaisonId = saisonId;
  if (!effectiveSaisonId) {
    const active = await getSaisonActive();
    effectiveSaisonId = active?.id || 'saison-default';
  }

  for (const item of presencesList) {
    const existing = await db.getFirstAsync(
      `SELECT id FROM presences WHERE creneauId = ? AND adherentId = ? AND dateSeance = ?`,
      [creneauId, item.adherentId, dateSeance],
    );

    if (existing) {
      await db.runAsync(
        `UPDATE presences SET statut = ?, remarque = ?, updatedAt = ? WHERE id = ?`,
        [item.statut, item.remarque || null, now, existing.id],
      );
    } else {
      const id = `pres-${creneauId}-${item.adherentId}-${dateSeance}`;
      await db.runAsync(
        `INSERT INTO presences (id, creneauId, adherentId, saisonId, dateSeance, statut, remarque, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, creneauId, item.adherentId, effectiveSaisonId, dateSeance, item.statut, item.remarque || null, now, now],
      );
    }
  }
}

export async function getPresencesByAdherent(adherentId, saisonId) {
  const db = await getDatabase();
  const query = saisonId
    ? `SELECT p.*, c.discipline, c.categorie, c.jour, c.heureDebut, c.heureFin, c.lieu
       FROM presences p
       LEFT JOIN creneaux c ON c.id = p.creneauId
       WHERE p.adherentId = ? AND p.saisonId = ?
       ORDER BY p.dateSeance DESC, c.heureDebut DESC`
    : `SELECT p.*, c.discipline, c.categorie, c.jour, c.heureDebut, c.heureFin, c.lieu
       FROM presences p
       LEFT JOIN creneaux c ON c.id = p.creneauId
       WHERE p.adherentId = ?
       ORDER BY p.dateSeance DESC, c.heureDebut DESC`;

  const list = await db.getAllAsync(query, saisonId ? [adherentId, saisonId] : [adherentId]);

  const total = list.length;
  const nbPresents = list.filter(p => p.statut === 'present').length;
  const nbAbsents = list.filter(p => p.statut === 'absent').length;
  const nbRetards = list.filter(p => p.statut === 'retard').length;
  const nbExcuses = list.filter(p => p.statut === 'excuse').length;

  const tauxPresence = total > 0 ? Math.round(((nbPresents + nbRetards) / total) * 100) : 100;

  return {
    list,
    total,
    nbPresents,
    nbAbsents,
    nbRetards,
    nbExcuses,
    tauxPresence,
  };
}


