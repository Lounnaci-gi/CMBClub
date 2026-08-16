// src/database/database.js
// Couche SQLite – Init, migrations, CRUD complet

import * as SQLite from 'expo-sqlite';
import { v4 as uuidv4 } from 'uuid';
import { buildAdherentCodeBase, findAdherentDuplicate } from '../utils/adherentCode';
import { computePaymentStatus, generatePaymentSchedule, PAYMENT_STATUS, PAYMENT_TYPES } from '../utils/payments';
import { isCloudflareEnabled, CloudflareAPI } from '../services/api';
import { hashPassword, verifyPassword, encryptUsername, decryptUsername, matchesUsername } from '../utils/security';
import {
  genererCreancesMois,
  imputerVersement,
  getResumePortefeuille,
  getDetailMensuel,
  resolveTarifMensuel,
  calculerPaiementGroupe,
  computeCreanceStatus,
} from '../services/portefeuilleService';

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
    PRAGMA synchronous = NORMAL;
    PRAGMA temp_store = MEMORY;
    PRAGMA cache_size = -64000;

    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS saisons (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      annee INTEGER NOT NULL,
      dateDebut TEXT NOT NULL,
      dateFin TEXT,
      actif INTEGER DEFAULT 0,
      statut TEXT DEFAULT 'ouvert',
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
      assure INTEGER DEFAULT 0,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS adherent_saisons (
      id TEXT PRIMARY KEY,
      adherentId TEXT NOT NULL,
      saisonId TEXT NOT NULL,
      dateInscription TEXT NOT NULL,
      assure INTEGER DEFAULT 0,
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

    -- Portefeuille : créances, versements, imputations, tarifs & paliers
    CREATE TABLE IF NOT EXISTS creances (
      id TEXT PRIMARY KEY,
      adherentId TEXT NOT NULL,
      saisonId TEXT NOT NULL,
      type TEXT NOT NULL,
      label TEXT NOT NULL,
      mois INTEGER,
      annee INTEGER,
      montantDu REAL NOT NULL,
      montantPaye REAL DEFAULT 0,
      statut TEXT NOT NULL DEFAULT 'non_paye',
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY (adherentId) REFERENCES adherents(id),
      FOREIGN KEY (saisonId) REFERENCES saisons(id)
    );

    CREATE TABLE IF NOT EXISTS versements (
      id TEXT PRIMARY KEY,
      adherentId TEXT NOT NULL,
      saisonId TEXT NOT NULL,
      montant REAL NOT NULL,
      dateVersement TEXT NOT NULL,
      notes TEXT,
      createdAt TEXT NOT NULL,
      FOREIGN KEY (adherentId) REFERENCES adherents(id),
      FOREIGN KEY (saisonId) REFERENCES saisons(id)
    );

    CREATE TABLE IF NOT EXISTS imputation_versements (
      id TEXT PRIMARY KEY,
      versementId TEXT NOT NULL,
      creanceId TEXT NOT NULL,
      montant REAL NOT NULL,
      createdAt TEXT NOT NULL,
      FOREIGN KEY (versementId) REFERENCES versements(id),
      FOREIGN KEY (creanceId) REFERENCES creances(id)
    );

    CREATE TABLE IF NOT EXISTS tarifs_personnalises (
      id TEXT PRIMARY KEY,
      adherentId TEXT NOT NULL,
      saisonId TEXT NOT NULL,
      montantMensuel REAL NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      UNIQUE(adherentId, saisonId),
      FOREIGN KEY (adherentId) REFERENCES adherents(id),
      FOREIGN KEY (saisonId) REFERENCES saisons(id)
    );

    CREATE TABLE IF NOT EXISTS paliers_reduction (
      id TEXT PRIMARY KEY,
      label TEXT,
      nbMoisMin INTEGER NOT NULL,
      reductionPct REAL NOT NULL,
      actif INTEGER DEFAULT 1,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS reductions_adherent (
      id TEXT PRIMARY KEY,
      adherentId TEXT NOT NULL,
      saisonId TEXT NOT NULL,
      nbMoisMin INTEGER DEFAULT 1,
      reductionPct REAL NOT NULL,
      actif INTEGER DEFAULT 1,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      UNIQUE(adherentId, saisonId),
      FOREIGN KEY (adherentId) REFERENCES adherents(id),
      FOREIGN KEY (saisonId) REFERENCES saisons(id)
    );

    CREATE INDEX IF NOT EXISTS idx_creances_adherent_saison ON creances(adherentId, saisonId);
    CREATE INDEX IF NOT EXISTS idx_creances_type_mois ON creances(type, annee, mois);
    CREATE INDEX IF NOT EXISTS idx_versements_adherent_saison ON versements(adherentId, saisonId);
    CREATE INDEX IF NOT EXISTS idx_imputation_versement ON imputation_versements(versementId);
    CREATE INDEX IF NOT EXISTS idx_imputation_creance ON imputation_versements(creanceId);

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

    -- Index de performance critiques
    CREATE INDEX IF NOT EXISTS idx_paiements_saison_adherent ON paiements(saisonId, adherentId);
    CREATE INDEX IF NOT EXISTS idx_paiements_saison_statut ON paiements(saisonId, statut);
    CREATE INDEX IF NOT EXISTS idx_paiements_adherent_type ON paiements(adherentId, type);
    CREATE INDEX IF NOT EXISTS idx_adherent_saisons_saison_actif ON adherent_saisons(saisonId, actif, adherentId);
    CREATE INDEX IF NOT EXISTS idx_adherent_saisons_adherent ON adherent_saisons(adherentId, saisonId);
    CREATE INDEX IF NOT EXISTS idx_presences_creneau_date ON presences(creneauId, dateSeance);
    CREATE INDEX IF NOT EXISTS idx_presences_adherent_saison ON presences(adherentId, saisonId);
    CREATE INDEX IF NOT EXISTS idx_adherents_nom_prenom ON adherents(nom, prenom);
    CREATE INDEX IF NOT EXISTS idx_creneaux_jour ON creneaux(jour, discipline, categorie);
    CREATE INDEX IF NOT EXISTS idx_users_role_adherent ON users(role, adherentId);
  `);

  // Migration : état d'ouverture de la saison pour les bases SQLite créées avant cette colonne
  const saisonColumns = await database.getAllAsync('PRAGMA table_info(saisons)');
  if (!saisonColumns.some(column => column.name === 'statut')) {
    await database.execAsync(`ALTER TABLE saisons ADD COLUMN statut TEXT NOT NULL DEFAULT 'ouvert'`);
  }

  // Migration : ajout de dateInscription si la colonne n'existe pas encore
  try {
    await database.execAsync(`ALTER TABLE adherents ADD COLUMN dateInscription TEXT`);
  } catch (_e) {
    // La colonne existe déjà, on ignore
  }

  // Migration : ajout de la colonne assure (0 = non assuré, 1 = assuré)
  try {
    await database.execAsync(`ALTER TABLE adherents ADD COLUMN assure INTEGER DEFAULT 0`);
  } catch (_e) {
    // La colonne existe déjà, on ignore
  }

  // Migration : ajout de la colonne assure à adherent_saisons (0 = non assuré, 1 = assuré par saison)
  try {
    await database.execAsync(`ALTER TABLE adherent_saisons ADD COLUMN assure INTEGER DEFAULT 0`);
  } catch (_e) {
    // La colonne existe déjà, on ignore
  }

  // Migration : catégorie forcée manuellement par l'admin (override de la catégorie calculée par l'âge)
  try {
    await database.execAsync(`ALTER TABLE adherents ADD COLUMN categorieOverride TEXT DEFAULT NULL`);
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
  await database.runAsync(
    `INSERT OR IGNORE INTO config (key, value) VALUES ('fraisAssurance', '500')`,
  );
  await database.runAsync(
    `INSERT OR IGNORE INTO config (key, value) VALUES ('cloudflareApiUrl', 'https://cmbclub-api.ahmedlounnaci.workers.dev')`,
  );

  // Seed single admin user (identifiant chiffré & mot de passe haché)
  const defaultAdminUser = encryptUsername('admin');
  const defaultAdminHash = hashPassword('admin123');
  await database.runAsync(
    `INSERT OR IGNORE INTO users (id, username, password, role, createdAt) VALUES ('admin-001', ?, ?, 'admin', datetime('now'))`,
    [defaultAdminUser, defaultAdminHash],
  );

  // Migration de sécurité : chiffrer les identifiants et hacher les mots de passe stockés en clair
  try {
    const legacyUsers = await database.getAllAsync("SELECT id, username, password FROM users");
    for (const u of legacyUsers || []) {
      const needsUserEnc = u.username && !u.username.startsWith('cmb_enc_u1:');
      const needsPassHash = u.password && !u.password.startsWith('cmb_slt_v1:');
      if (needsUserEnc || needsPassHash) {
        const nextUser = needsUserEnc ? encryptUsername(u.username) : u.username;
        const nextPass = needsPassHash ? hashPassword(u.password) : u.password;
        await database.runAsync("UPDATE users SET username = ?, password = ? WHERE id = ?", [
          nextUser,
          nextPass,
          u.id,
        ]);
      }
    }
  } catch (_e) {
    // ignore
  }

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
  const yearNow = new Date().getFullYear();
  const saisonLabel = String(yearNow);
  await database.runAsync(
    `INSERT OR IGNORE INTO saisons (id, label, annee, dateDebut, dateFin, actif, createdAt)
     VALUES ('saison-${yearNow}', ?, ?, ?, ?, 1, datetime('now'))`,
    [saisonLabel, yearNow, `${yearNow}-01-01`, `${yearNow}-12-31`],
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
  // ─── (Les adhérents de test ont été supprimés – la BDD démarre vide) ────────
  // Pour réinitialiser les données depuis l'app : ConfigScreen → "Réinitialiser la BDD"

  if (false) { // bloc désactivé – conservé pour référence
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

  for (let idx = 0; idx < seedAdherents.length; idx++) {
    const a = seedAdherents[idx];
    const isAssure = idx % 2 === 0 ? 1 : 0; // Alterner assuré/non assuré pour la démo
    try {
      const code = buildAdherentCodeBase({
        nom: a.nom, prenom: a.prenom, dateNaissance: a.dn,
      });
      await database.runAsync(
        `INSERT OR IGNORE INTO adherents
           (id, code, nom, prenom, dateNaissance, lieuNaissance, telephone, taille,
            groupeSanguin, observationsMedicales, photo, discipline, genre, dateInscription, assure, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL, NULL, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
        [a.id, code, a.nom, a.prenom, a.dn, a.lieu, a.tel, a.gs, a.disc, a.genre, a.dn.slice(0, 4) + '-09-01', isAssure],
      );

      // Inscription à la saison active
      const saisonRow = await database.getFirstAsync(`SELECT id FROM saisons WHERE actif = 1 LIMIT 1`);
      const saisonId = saisonRow?.id || activeSaisonId;
      await database.runAsync(
        `INSERT OR IGNORE INTO adherent_saisons (id, adherentId, saisonId, dateInscription, assure, actif)
         VALUES (?, ?, ?, ?, ?, 1)`,
        [`as-${a.id}`, a.id, saisonId, a.dn.slice(0, 4) + '-09-01', isAssure],
      );
    } catch (_e) {
      // ignore seeding errors (ex: duplicates)
    }
  }
  } // fin bloc désactivé
}


// ──────────────── RESET BDD ────────────────
// Efface toutes les données sauf l'utilisateur admin

export async function resetDatabase() {
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    // Supprimer les données transactionnelles
    await db.runAsync('DELETE FROM imputation_versements');
    await db.runAsync('DELETE FROM versements');
    await db.runAsync('DELETE FROM creances');
    await db.runAsync('DELETE FROM tarifs_personnalises');
    await db.runAsync('DELETE FROM reductions_adherent');
    await db.runAsync('DELETE FROM presences');
    await db.runAsync('DELETE FROM paiements');
    await db.runAsync('DELETE FROM adherent_saisons');
    await db.runAsync('DELETE FROM adherents');
    // Conserver : users (admin), config, saisons, remises, paliers_reduction, disciplines, creneaux
  });
}


// ──────────────── CONFIG ────────────────

export async function getConfig() {
  if (isCloudflareEnabled()) {
    try {
      const cfg = await CloudflareAPI.getConfig();
      if (cfg && Object.keys(cfg).length > 0) return cfg;
    } catch (e) {
      console.warn('Cloudflare getConfig fallback:', e.message);
    }
  }
  const db = await getDatabase();
  const rows = await db.getAllAsync('SELECT key, value FROM config');
  const config = {};
  rows.forEach(r => { config[r.key] = parseFloat(r.value) || r.value; });
  return config;
}

export async function setConfig(key, value) {
  if (isCloudflareEnabled()) {
    try {
      await CloudflareAPI.setConfig(key, value);
    } catch (e) {
      console.warn('Cloudflare setConfig fallback:', e.message);
    }
  }
  const db = await getDatabase();
  await db.runAsync(
    `INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)`,
    [key, String(value)],
  );
}

// ──────────────── SAISONS ────────────────

export async function getSaisons() {
  if (isCloudflareEnabled()) {
    try {
      return await CloudflareAPI.getSaisons();
    } catch (e) {
      console.warn('Cloudflare getSaisons fallback:', e.message);
    }
  }
  const db = await getDatabase();
  return await db.getAllAsync('SELECT * FROM saisons ORDER BY annee DESC');
}

export async function getSaisonActive() {
  if (isCloudflareEnabled()) {
    try {
      const saison = await CloudflareAPI.getSaisonActive();
      return saison?.statut === 'ouvert' ? saison : null;
    } catch (e) {
      console.warn('Cloudflare getSaisonActive fallback:', e.message);
    }
  }
  const db = await getDatabase();
  return await db.getFirstAsync(
    "SELECT * FROM saisons WHERE actif = 1 AND COALESCE(statut, 'ouvert') = 'ouvert' LIMIT 1"
  );
}

const OPEN_SEASON_REQUIRED_MESSAGE = 'Aucune saison ouverte. Créez ou rouvrez une saison avant de continuer.';

export async function requireOpenActiveSeason(database, saisonId) {
  let saison = await database.getFirstAsync(
    "SELECT id FROM saisons WHERE actif = 1 AND COALESCE(statut, 'ouvert') = 'ouvert' LIMIT 1"
  );

  // Répare les données locales héritées où une unique saison rouverte n'a pas
  // été réactivée. En présence de plusieurs saisons ouvertes, seul l'admin
  // peut décider laquelle doit devenir la saison courante.
  if (!saison) {
    const openSaisons = await database.getAllAsync(
      "SELECT id FROM saisons WHERE COALESCE(statut, 'ouvert') = 'ouvert' ORDER BY annee DESC, createdAt DESC LIMIT 2"
    );
    if (openSaisons.length === 1) {
      saison = openSaisons[0];
      await database.withTransactionAsync(async () => {
        await database.runAsync('UPDATE saisons SET actif = 0');
        await database.runAsync('UPDATE saisons SET actif = 1 WHERE id = ?', [saison.id]);
      });
    }
  }

  if (!saison) throw new Error(OPEN_SEASON_REQUIRED_MESSAGE);
  if (saisonId && saison.id !== saisonId) {
    throw new Error('La saison concernée n’est pas la saison ouverte active.');
  }
  return saison;
}

function rethrowOpenSeasonError(error) {
  if (error?.message?.includes('saison ouverte') || error?.message?.includes('saison fermée')) {
    throw error;
  }
}

export async function createSaison(saison) {
  // Keep local SQLite and the remote D1 database aligned. Older D1 schemas
  // require dateFin to be non-null, even for a newly opened season.
  const dateFin = saison.dateFin || `${saison.annee}-12-31`;
  const saisonToCreate = { ...saison, dateFin };

  if (isCloudflareEnabled()) {
    try {
      await CloudflareAPI.createSaison(saisonToCreate);
    } catch (e) {
      console.warn('Cloudflare createSaison fallback:', e.message);
    }
  }
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    if (saisonToCreate.actif) {
      await db.runAsync('UPDATE saisons SET actif = 0');
    }
    await db.runAsync(
      `INSERT INTO saisons (id, label, annee, dateDebut, dateFin, actif, createdAt) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
      [saisonToCreate.id, saisonToCreate.label, saisonToCreate.annee, saisonToCreate.dateDebut, saisonToCreate.dateFin, saisonToCreate.actif ? 1 : 0],
    );
  });
}

export async function activateSaison(saisonId) {
  if (isCloudflareEnabled()) {
    try {
      await CloudflareAPI.activateSaison(saisonId);
    } catch (e) {
      rethrowOpenSeasonError(e);
      console.warn('Cloudflare activateSaison fallback:', e.message);
    }
  }
  const db = await getDatabase();
  const saison = await db.getFirstAsync(
    "SELECT COALESCE(statut, 'ouvert') AS statut FROM saisons WHERE id = ?",
    [saisonId],
  );
  if (!saison || saison.statut !== 'ouvert') {
    throw new Error('Impossible d’activer une saison fermée. Rouvrez-la d’abord.');
  }
  await db.runAsync('UPDATE saisons SET actif = 0');
  await db.runAsync('UPDATE saisons SET actif = 1 WHERE id = ?', [saisonId]);
}

export async function updateSaison(saisonId, { dateDebut, dateFin }) {
  if (isCloudflareEnabled()) {
    try {
      await CloudflareAPI.updateSaison(saisonId, { dateDebut, dateFin });
    } catch (e) {
      console.warn('Cloudflare updateSaison fallback:', e.message);
    }
  }
  const db = await getDatabase();
  await db.runAsync(
    'UPDATE saisons SET dateDebut = ?, dateFin = ? WHERE id = ?',
    [dateDebut, dateFin, saisonId]
  );
}

export async function deleteSaison(saisonId) {
  if (isCloudflareEnabled()) {
    try {
      await CloudflareAPI.deleteSaison(saisonId);
    } catch (e) {
      console.warn('Cloudflare deleteSaison fallback:', e.message);
    }
  }
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM imputation_versements WHERE creanceId IN (SELECT id FROM creances WHERE saisonId = ?)', [saisonId]);
    await db.runAsync('DELETE FROM versements WHERE saisonId = ?', [saisonId]);
    await db.runAsync('DELETE FROM creances WHERE saisonId = ?', [saisonId]);
    await db.runAsync('DELETE FROM tarifs_personnalises WHERE saisonId = ?', [saisonId]);
    await db.runAsync('DELETE FROM reductions_adherent WHERE saisonId = ?', [saisonId]);
    await db.runAsync('DELETE FROM presences WHERE saisonId = ?', [saisonId]);
    await db.runAsync('DELETE FROM paiements WHERE saisonId = ?', [saisonId]);
    await db.runAsync('DELETE FROM adherent_saisons WHERE saisonId = ?', [saisonId]);
    await db.runAsync('DELETE FROM saisons WHERE id = ?', [saisonId]);
  });
}

export async function closeSaison(saisonId, credentials = {}) {
  const db = await getDatabase();
  const saison = await db.getFirstAsync('SELECT statut FROM saisons WHERE id = ?', [saisonId]);
  if (saison) {
    const cleanUsername = String(credentials.username || '').trim();
    const cleanPassword = String(credentials.password || '').trim();
    const admin = await db.getFirstAsync(
      "SELECT username, password FROM users WHERE role = 'admin' LIMIT 1"
    );
    const authorized = Boolean(
      admin &&
      cleanUsername &&
      cleanPassword &&
      matchesUsername(cleanUsername, admin.username) &&
      verifyPassword(cleanPassword, admin.password)
    );

    if (!authorized) {
      throw new Error('Identifiants administrateur invalides.');
    }
  }

  if (isCloudflareEnabled()) {
    try {
      await CloudflareAPI.closeSaison(saisonId, credentials);
    } catch (e) {
      if (e.message === 'Identifiants administrateur invalides.') {
        throw e;
      }
      console.warn('Cloudflare closeSaison fallback:', e.message);
    }
  }
  const newStatut = saison?.statut === 'ouvert' ? 'fermé' : 'ouvert';
  const dateClose = newStatut === 'fermé' ? new Date().toISOString() : null;
  const openActiveSeason = await db.getFirstAsync(
    "SELECT id FROM saisons WHERE actif = 1 AND COALESCE(statut, 'ouvert') = 'ouvert' LIMIT 1"
  );
  const shouldActivateReopenedSeason = newStatut === 'ouvert' && !openActiveSeason;

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'UPDATE saisons SET statut = ?, dateFin = CASE WHEN ? THEN ? ELSE \'\' END WHERE id = ?',
      [newStatut, newStatut === 'fermé' ? 1 : 0, dateClose, saisonId]
    );
    if (shouldActivateReopenedSeason) {
      await db.runAsync('UPDATE saisons SET actif = 0');
      await db.runAsync('UPDATE saisons SET actif = 1 WHERE id = ?', [saisonId]);
    }
  });
}

// ──────────────── ADHÉRENTS ────────────────

export async function getAdherents(saisonId) {
  if (isCloudflareEnabled()) {
    try {
      return await CloudflareAPI.getAdherents(saisonId);
    } catch (e) {
      console.warn('Cloudflare getAdherents fallback:', e.message);
    }
  }
  const db = await getDatabase();
  let targetSaisonId = saisonId;
  if (!targetSaisonId) {
    const active = await db.getFirstAsync('SELECT id FROM saisons WHERE actif = 1 LIMIT 1');
    targetSaisonId = active?.id;
  }
  if (targetSaisonId) {
    return await db.getAllAsync(`
      SELECT a.*, 
        COALESCE(s.assure, 0) as assure,
        CASE WHEN s.id IS NOT NULL THEN 1 ELSE 0 END as isEnrolled,
        s.dateInscription as dateInscriptionSaison
      FROM adherents a
      LEFT JOIN adherent_saisons s ON s.adherentId = a.id AND s.saisonId = ? AND s.actif = 1
      ORDER BY a.nom, a.prenom
    `, [targetSaisonId]);
  }
  return await db.getAllAsync('SELECT * FROM adherents ORDER BY nom, prenom');
}

export async function getAdherentById(id, saisonId) {
  if (isCloudflareEnabled()) {
    try {
      return await CloudflareAPI.getAdherentById(id);
    } catch (e) {
      console.warn('Cloudflare getAdherentById fallback:', e.message);
    }
  }
  const db = await getDatabase();
  let targetSaisonId = saisonId;
  if (!targetSaisonId) {
    const active = await db.getFirstAsync('SELECT id FROM saisons WHERE actif = 1 LIMIT 1');
    targetSaisonId = active?.id;
  }
  if (targetSaisonId) {
    const res = await db.getFirstAsync(`
      SELECT a.*, 
        COALESCE(s.assure, 0) as assure,
        CASE WHEN s.id IS NOT NULL THEN 1 ELSE 0 END as isEnrolled,
        s.dateInscription as dateInscriptionSaison
      FROM adherents a
      LEFT JOIN adherent_saisons s ON s.adherentId = a.id AND s.saisonId = ? AND s.actif = 1
      WHERE a.id = ?
    `, [targetSaisonId, id]);
    if (res) return res;
  }
  return await db.getFirstAsync('SELECT * FROM adherents WHERE id = ?', [id]);
}

export async function getAdherentByCode(code) {
  const db = await getDatabase();
  return await db.getFirstAsync('SELECT * FROM adherents WHERE code = ?', [code]);
}

export async function checkAdherentDuplicate({ nom, prenom, dateNaissance, excludeId = null }) {
  if (!nom || !prenom || !dateNaissance) return null;
  const db = await getDatabase();
  const targetDate = String(dateNaissance).trim();
  const candidates = await db.getAllAsync(
    'SELECT id, code, nom, prenom, dateNaissance FROM adherents WHERE dateNaissance = ?',
    [targetDate],
  );
  return findAdherentDuplicate(candidates, { nom, prenom, dateNaissance }, excludeId);
}

export async function createAdherent(adherent) {
  if (isCloudflareEnabled()) {
    try {
      await CloudflareAPI.createAdherent(adherent);
    } catch (e) {
      rethrowOpenSeasonError(e);
      if (e.message && e.message.includes('existe déjà')) {
        throw e;
      }
      console.warn('Cloudflare createAdherent fallback:', e.message);
    }
  }
  const db = await getDatabase();
  await requireOpenActiveSeason(db);

  // Vérification stricte anti-doublon (nom, prénom, dateNaissance)
  const existingDup = await checkAdherentDuplicate({
    nom: adherent.nom,
    prenom: adherent.prenom,
    dateNaissance: adherent.dateNaissance,
    excludeId: adherent.id,
  });
  if (existingDup) {
    throw new Error(`Un adhérent avec le même nom, prénom et date de naissance existe déjà (${existingDup.nom} ${existingDup.prenom} - Code : ${existingDup.code || 'N/A'}).`);
  }

  const now = new Date().toISOString();
  // La date d'inscription est automatiquement la date du jour si non fournie
  const dateInscription = adherent.dateInscription || now.slice(0, 10);
  const assureVal = adherent.assure ? 1 : 0;
  await db.runAsync(
    `INSERT INTO adherents (id, code, nom, prenom, dateNaissance, lieuNaissance, telephone, taille, groupeSanguin, observationsMedicales, photo, discipline, genre, dateInscription, assure, categorieOverride, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      adherent.id, adherent.code, adherent.nom, adherent.prenom,
      adherent.dateNaissance, adherent.lieuNaissance, adherent.telephone || null,
      adherent.taille || null, adherent.groupeSanguin || null,
      adherent.observationsMedicales || null, adherent.photo || null,
      adherent.discipline || null, adherent.genre || 'M', dateInscription, assureVal,
      adherent.categorieOverride || null, now, now,
    ],
  );
}

export async function updateAdherent(adherent) {
  if (isCloudflareEnabled()) {
    try {
      await CloudflareAPI.updateAdherent(adherent);
    } catch (e) {
      if (e.message && e.message.includes('existe déjà')) {
        throw e;
      }
      console.warn('Cloudflare updateAdherent fallback:', e.message);
    }
  }
  const db = await getDatabase();

  // Vérification anti-doublon
  const existingDup = await checkAdherentDuplicate({
    nom: adherent.nom,
    prenom: adherent.prenom,
    dateNaissance: adherent.dateNaissance,
    excludeId: adherent.id,
  });
  if (existingDup) {
    throw new Error(`Un autre adhérent avec le même nom, prénom et date de naissance existe déjà (${existingDup.nom} ${existingDup.prenom} - Code : ${existingDup.code || 'N/A'}).`);
  }

  const now = new Date().toISOString();
  const assureVal = adherent.assure ? 1 : 0;
  // Le code et la dateInscription ne sont jamais modifiés après création
  await db.runAsync(
    `UPDATE adherents SET nom=?, prenom=?, dateNaissance=?, lieuNaissance=?, telephone=?, taille=?, groupeSanguin=?, observationsMedicales=?, photo=?, discipline=?, genre=?, assure=?, categorieOverride=?, updatedAt=? WHERE id=?`,
    [
      adherent.nom, adherent.prenom, adherent.dateNaissance,
      adherent.lieuNaissance, adherent.telephone || null, adherent.taille || null,
      adherent.groupeSanguin || null, adherent.observationsMedicales || null,
      adherent.photo || null, adherent.discipline || null, adherent.genre || 'M',
      assureVal, adherent.categorieOverride || null, now, adherent.id,
    ],
  );
}

export async function setAdherentAssure(id, assure, saisonId) {
  if (isCloudflareEnabled()) {
    try {
      await CloudflareAPI.setAdherentAssure(id, assure, saisonId);
    } catch (e) {
      console.warn('Cloudflare setAdherentAssure fallback:', e.message);
    }
  }
  const db = await getDatabase();
  const now = new Date().toISOString();
  let targetSaisonId = saisonId;
  if (!targetSaisonId) {
    const active = await db.getFirstAsync('SELECT id FROM saisons WHERE actif = 1 LIMIT 1');
    targetSaisonId = active?.id;
  }
  const val = assure ? 1 : 0;
  if (targetSaisonId) {
    const existing = await db.getFirstAsync(
      'SELECT id FROM adherent_saisons WHERE adherentId = ? AND saisonId = ?',
      [id, targetSaisonId]
    );
    if (existing) {
      await db.runAsync(
        'UPDATE adherent_saisons SET assure = ? WHERE adherentId = ? AND saisonId = ?',
        [val, id, targetSaisonId]
      );
    } else {
      const idSaison = `as-${id}-${targetSaisonId}`;
      await db.runAsync(
        'INSERT INTO adherent_saisons (id, adherentId, saisonId, dateInscription, assure, actif) VALUES (?, ?, ?, ?, ?, 1)',
        [idSaison, id, targetSaisonId, now.slice(0, 10), val]
      );
    }
  }
  await db.runAsync(
    `UPDATE adherents SET assure = ?, updatedAt = ? WHERE id = ?`,
    [val, now, id],
  );
  if (val === 1 && targetSaisonId) {
    await ensureCreancesAdherent(id, targetSaisonId);
  }
}

export async function deleteAdherent(id) {
  if (isCloudflareEnabled()) {
    try {
      await CloudflareAPI.deleteAdherent(id);
    } catch (e) {
      console.warn('Cloudflare deleteAdherent fallback:', e.message);
    }
  }
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'DELETE FROM imputation_versements WHERE creanceId IN (SELECT id FROM creances WHERE adherentId = ?) OR versementId IN (SELECT id FROM versements WHERE adherentId = ?)',
      [id, id],
    );
    await db.runAsync('DELETE FROM versements WHERE adherentId = ?', [id]);
    await db.runAsync('DELETE FROM creances WHERE adherentId = ?', [id]);
    await db.runAsync('DELETE FROM tarifs_personnalises WHERE adherentId = ?', [id]);
    await db.runAsync('DELETE FROM reductions_adherent WHERE adherentId = ?', [id]);
    await db.runAsync('DELETE FROM paiements WHERE adherentId = ?', [id]);
    await db.runAsync('DELETE FROM adherent_saisons WHERE adherentId = ?', [id]);
    await db.runAsync('DELETE FROM users WHERE adherentId = ?', [id]);
    await db.runAsync('DELETE FROM adherents WHERE id = ?', [id]);
  });
}

// ──────────────── ADHÉRENT-SAISONS ────────────────

export async function enrollAdherentInSaison(adherentId, saisonId, dateInscription, assure = 0) {
  if (isCloudflareEnabled()) {
    try {
      await CloudflareAPI.enrollAdherent(adherentId, saisonId, dateInscription, assure);
    } catch (e) {
      console.warn('Cloudflare enrollAdherent fallback:', e.message);
    }
  }
  const db = await getDatabase();
  const id = `as-${adherentId}-${saisonId}`;
  await db.runAsync(
    `INSERT OR REPLACE INTO adherent_saisons (id, adherentId, saisonId, dateInscription, assure, actif) VALUES (?, ?, ?, ?, ?, 1)`,
    [id, adherentId, saisonId, dateInscription, assure ? 1 : 0],
  );
  // Créances dues au moment de l'inscription (acte admin ≠ paiement)
  await ensureCreancesAdherent(adherentId, saisonId);
}


// ──────────────── PAIEMENTS ────────────────

export async function cleanDuplicatePaiements(saisonId) {
  try {
    const db = await getDatabase();
    const saisonFilter = saisonId ? 'AND saisonId = ?' : '';
    const params = saisonId ? [saisonId] : [];

    // 1. Nettoyer les doublons de frais d'inscription
    const duplicatesInsc = await db.getAllAsync(
      `SELECT id, adherentId, saisonId, montantPaye, createdAt 
       FROM paiements 
       WHERE type = 'inscription' ${saisonFilter}
       ORDER BY montantPaye DESC, createdAt ASC`,
      params
    );

    const seenInsc = new Set();
    for (const p of duplicatesInsc) {
      const key = `${p.adherentId}_${p.saisonId}`;
      if (seenInsc.has(key)) {
        await db.runAsync(`DELETE FROM paiements WHERE id = ?`, [p.id]);
      } else {
        seenInsc.add(key);
      }
    }

    // 2. Nettoyer les doublons de mensualités (par mois)
    const duplicatesMois = await db.getAllAsync(
      `SELECT id, adherentId, saisonId, mois, montantPaye, createdAt 
       FROM paiements 
       WHERE type = 'mensualite' AND mois IS NOT NULL ${saisonFilter}
       ORDER BY montantPaye DESC, createdAt ASC`,
      params
    );

    const seenMois = new Set();
    for (const p of duplicatesMois) {
      const key = `${p.adherentId}_${p.saisonId}_${p.mois}`;
      if (seenMois.has(key)) {
        await db.runAsync(`DELETE FROM paiements WHERE id = ?`, [p.id]);
      } else {
        seenMois.add(key);
      }
    }
  } catch (e) {
    console.error('Erreur lors du nettoyage des doublons:', e);
  }
}

export async function ensureAdherentPaymentSchedule(adherentId, saisonId) {
  if (!adherentId || !saisonId) return;
  try {
    const db = await getDatabase();

    // Vérifier si l'adhérent est bien inscrit dans cette saison
    const isEnrolled = await db.getFirstAsync(
      `SELECT id FROM adherent_saisons WHERE adherentId = ? AND saisonId = ? AND actif = 1`,
      [adherentId, saisonId]
    );
    if (!isEnrolled) return;

    await cleanDuplicatePaiements(saisonId);

    const existing = await db.getAllAsync(
      `SELECT * FROM paiements WHERE adherentId = ? AND saisonId = ?`,
      [adherentId, saisonId]
    );

    const saison = await db.getFirstAsync(`SELECT * FROM saisons WHERE id = ?`, [saisonId]);
    if (!saison) return;

    const configRows = await db.getAllAsync(`SELECT * FROM config`);
    const configMap = {};
    configRows.forEach(c => { configMap[c.key] = c.value; });
    const config = {
      fraisInscription: parseFloat(configMap.fraisInscription) || 2000,
      fraisMensuel: parseFloat(configMap.fraisMensuel) || 1500,
    };

    const adherent = await db.getFirstAsync(`SELECT * FROM adherents WHERE id = ?`, [adherentId]);
    const dateInsc = adherent?.dateInscription || new Date().toISOString();

    const schedule = generatePaymentSchedule(saison.annee, config, dateInsc);
    const nowIso = new Date().toISOString();

    for (const s of schedule) {
      if (s.type === 'inscription') {
        const hasInscription = existing.some(p => p.type === 'inscription');
        if (hasInscription) continue;
      } else if (s.type === 'mensualite') {
        const hasMonth = existing.some(p => p.type === 'mensualite' && Number(p.mois) === Number(s.month));
        if (hasMonth) continue;
      }

      await db.runAsync(
        `INSERT INTO paiements (id, adherentId, saisonId, type, label, mois, annee, montantDu, remisePct, remiseMontant, montantPaye, datePaiement, statut, notes, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, NULL, 'a_payer', NULL, ?, ?)`,
        [
          uuidv4(), adherentId, saisonId,
          s.type, s.label, s.month || null, s.year || null,
          s.montantDu, nowIso, nowIso,
        ]
      );
    }
  } catch (e) {
    console.error('Erreur lors de la génération du planning de paiement:', e);
  }
}

export async function getPaiementsByAdherent(adherentId, saisonId) {
  if (isCloudflareEnabled()) {
    try {
      return await CloudflareAPI.getPaiements(adherentId, saisonId);
    } catch (e) {
      console.warn('Cloudflare getPaiements fallback:', e.message);
    }
  }
  if (!adherentId || !saisonId) return [];
  await ensureAdherentPaymentSchedule(adherentId, saisonId);
  const db = await getDatabase();
  return await db.getAllAsync(
    `SELECT * FROM paiements WHERE adherentId = ? AND saisonId = ? ORDER BY type DESC, annee, mois`,
    [adherentId, saisonId],
  );
}

export async function getAllPaiementsBySaison(saisonId) {
  if (isCloudflareEnabled()) {
    try {
      return await CloudflareAPI.getPaiements(null, saisonId);
    } catch (e) {
      console.warn('Cloudflare getAllPaiementsBySaison fallback:', e.message);
    }
  }
  const db = await getDatabase();
  return await db.getAllAsync(
    `SELECT p.*, a.nom, a.prenom, a.code, a.discipline, a.dateNaissance FROM paiements p
     JOIN adherents a ON a.id = p.adherentId
     WHERE p.saisonId = ? ORDER BY p.statut, a.nom`,
    [saisonId],
  );
}

export async function createPaiement(paiement) {
  if (isCloudflareEnabled()) {
    try {
      await CloudflareAPI.createPaiement(paiement);
    } catch (e) {
      rethrowOpenSeasonError(e);
      console.warn('Cloudflare createPaiement fallback:', e.message);
    }
  }
  const db = await getDatabase();
  await requireOpenActiveSeason(db, paiement.saisonId);
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
  if (isCloudflareEnabled()) {
    try {
      await CloudflareAPI.updatePaiement(paiement);
    } catch (e) {
      rethrowOpenSeasonError(e);
      console.warn('Cloudflare updatePaiement fallback:', e.message);
    }
  }
  const db = await getDatabase();
  const existing = await db.getFirstAsync('SELECT saisonId FROM paiements WHERE id = ?', [paiement.id]);
  await requireOpenActiveSeason(db, existing?.saisonId || paiement.saisonId);
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
  if (isCloudflareEnabled()) {
    try {
      return await CloudflareAPI.getStats(saisonId);
    } catch (e) {
      console.warn('Cloudflare getStats fallback:', e.message);
    }
  }
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
  if (isCloudflareEnabled()) {
    try {
      return await CloudflareAPI.getRemises();
    } catch (e) {
      console.warn('Cloudflare getRemises fallback:', e.message);
    }
  }
  const db = await getDatabase();
  return await db.getAllAsync('SELECT * FROM remises WHERE actif = 1 ORDER BY label');
}

export async function createRemise(remise) {
  if (isCloudflareEnabled()) {
    try {
      await CloudflareAPI.createRemise(remise);
    } catch (e) {
      console.warn('Cloudflare createRemise fallback:', e.message);
    }
  }
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
  if (isCloudflareEnabled()) {
    try {
      await CloudflareAPI.deleteRemise(id);
    } catch (e) {
      console.warn('Cloudflare deleteRemise fallback:', e.message);
    }
  }
  const db = await getDatabase();
  await db.runAsync('UPDATE remises SET actif = 0 WHERE id = ?', [id]);
}

// ──────────────── USERS ────────────────

export async function getUserByCredentials(username, password) {
  if (isCloudflareEnabled()) {
    try {
      const res = await CloudflareAPI.login(username, password);
      if (res?.user) return res.user;
    } catch (e) {
      console.warn('Cloudflare login fallback to local DB:', e.message);
    }
  }
  const db = await getDatabase();
  const cleanUser = String(username || '').trim();
  const cleanPass = String(password || '').trim();
  const encUser = encryptUsername(cleanUser);

  // 1. Recherche par nom d'utilisateur chiffré ou en clair
  let user = await db.getFirstAsync(
    'SELECT * FROM users WHERE username = ? OR LOWER(username) = LOWER(?)',
    [encUser, cleanUser],
  );

  if (!user) {
    const allUsers = await db.getAllAsync('SELECT * FROM users');
    user = allUsers.find(u => matchesUsername(cleanUser, u.username));
  }

  // 2. Recherche alternative pour les adhérents (par code d'adhérent ou nom)
  if (!user) {
    const adherent = await db.getFirstAsync(
      'SELECT id, code, nom FROM adherents WHERE LOWER(code) = LOWER(?) OR LOWER(nom) = LOWER(?)',
      [cleanUser, cleanUser],
    );
    if (adherent) {
      user = await db.getFirstAsync(
        'SELECT * FROM users WHERE adherentId = ?',
        [adherent.id],
      );
    }
  }

  if (user && verifyPassword(cleanPass, user.password)) {
    // Migration silencieuse si nécessaire
    const nextUser = user.username?.startsWith('cmb_enc_u1:') ? user.username : encryptUsername(cleanUser);
    const nextPass = user.password?.startsWith('cmb_slt_v1:') ? user.password : hashPassword(cleanPass);
    if (nextUser !== user.username || nextPass !== user.password) {
      await db.runAsync('UPDATE users SET username = ?, password = ? WHERE id = ?', [
        nextUser,
        nextPass,
        user.id,
      ]);
    }
    const { password: _, ...safeUser } = user;
    return {
      ...safeUser,
      username: decryptUsername(safeUser.username),
    };
  }

  return null;
}

export async function getUserByAdherentId(adherentId) {
  const db = await getDatabase();
  const user = await db.getFirstAsync('SELECT * FROM users WHERE adherentId = ?', [adherentId]);
  if (!user) return null;
  return {
    ...user,
    username: decryptUsername(user.username),
  };
}

export async function getAdminUser() {
  if (isCloudflareEnabled()) {
    try {
      const admin = await CloudflareAPI.getAdminUser();
      if (admin) return { ...admin, username: decryptUsername(admin.username) };
    } catch (e) {
      console.warn('Cloudflare getAdminUser fallback:', e.message);
    }
  }
  const db = await getDatabase();
  const admin = await db.getFirstAsync("SELECT id, username, role, createdAt FROM users WHERE role = 'admin' LIMIT 1");
  if (!admin) return null;
  return {
    ...admin,
    username: decryptUsername(admin.username),
  };
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

  const encryptedUsername = user.username?.startsWith('cmb_enc_u1:')
    ? user.username
    : encryptUsername(user.username || '');

  const hashedPassword = user.password?.startsWith('cmb_slt_v1:')
    ? user.password
    : hashPassword(user.password || '');

  await db.runAsync(
    `INSERT INTO users (id, username, password, role, adherentId, createdAt) VALUES (?, ?, ?, ?, ?, datetime('now'))`,
    [user.id, encryptedUsername, hashedPassword, requestedRole, user.adherentId || null],
  );
}

export async function updateAdminCredentials(newUsername, newPassword) {
  if (isCloudflareEnabled()) {
    try {
      return await CloudflareAPI.updateAdminCredentials(newUsername, newPassword);
    } catch (e) {
      console.warn('Cloudflare updateAdminCredentials fallback:', e.message);
    }
  }
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

  const allUsers = await db.getAllAsync("SELECT id, username FROM users WHERE id != ?", [admin.id]);
  const duplicate = allUsers.some(u => matchesUsername(cleanUsername, u.username));
  if (duplicate) {
    throw new Error("Cet identifiant est déjà utilisé par un autre utilisateur.");
  }

  const encryptedUsername = encryptUsername(cleanUsername);
  const hashedPassword = hashPassword(cleanPassword);
  await db.runAsync(
    "UPDATE users SET username = ?, password = ? WHERE id = ?",
    [encryptedUsername, hashedPassword, admin.id],
  );
  return await getAdminUser();
}

export async function updateUserPassword(userId, password) {
  const db = await getDatabase();
  const hashedPassword = hashPassword(password);
  await db.runAsync('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, userId]);
}

/**
 * Crée un compte adhérent (username = code, mot de passe = date AAMMJJ) avec identifiant chiffré & mot de passe haché
 */
export async function ensureAdherentAccount(adherent) {
  const existing = await getUserByAdherentId(adherent.id);
  if (existing) {
    return {
      user: { ...existing, username: decryptUsername(existing.username) },
      created: false,
      password: null,
    };
  }

  const plainPassword = (adherent.dateNaissance || '').replace(/-/g, '').slice(2) || '000000';
  const user = {
    id: `user-${adherent.id}`,
    username: encryptUsername(adherent.code),
    password: hashPassword(plainPassword),
    role: 'adherent',
    adherentId: adherent.id,
  };
  await createUser(user);
  return {
    user: { ...user, username: adherent.code },
    created: true,
    password: plainPassword,
  };
}

/**
 * Recalcule et met à jour les statuts (retards) des paiements d'une saison de façon optimisée
 */
export async function refreshPaymentStatuses(saisonId) {
  const db = await getDatabase();
  const paiements = saisonId
    ? await db.getAllAsync(
        'SELECT id, montantDu, remiseMontant, montantPaye, datePaiement, statut, mois, annee, type FROM paiements WHERE saisonId = ? AND statut != ?',
        [saisonId, PAYMENT_STATUS.PAYE],
      )
    : await db.getAllAsync(
        'SELECT id, montantDu, remiseMontant, montantPaye, datePaiement, statut, mois, annee, type FROM paiements WHERE statut != ?',
        [PAYMENT_STATUS.PAYE],
      );

  const updates = [];
  const now = new Date().toISOString();
  for (const p of paiements) {
    const next = computePaymentStatus(p);
    if (next !== p.statut) {
      updates.push({ id: p.id, next });
    }
  }

  if (updates.length > 0) {
    await db.withTransactionAsync(async () => {
      for (const u of updates) {
        await db.runAsync(
          'UPDATE paiements SET statut = ?, updatedAt = ? WHERE id = ?',
          [u.next, now, u.id],
        );
      }
    });
  }
}

/**
 * Statut de paiement agrégé par adhérent pour le mois courant d'une saison
 */
export async function getPaymentStatusByAdherent(saisonId) {
  const db = await getDatabase();
  if (!saisonId) return {};
  await refreshPaymentStatuses(saisonId);

  const now = new Date();
  const currentMonth = now.getMonth() + 1;

  const rows = await db.getAllAsync(
    'SELECT id, adherentId, type, mois, annee, montantDu, remiseMontant, montantPaye, statut FROM paiements WHERE saisonId = ?',
    [saisonId],
  );

  const byAdherent = {};
  for (const r of rows) {
    if (!byAdherent[r.adherentId]) byAdherent[r.adherentId] = [];
    byAdherent[r.adherentId].push(r);
  }

  const result = {};
  for (const [id, paiementsList] of Object.entries(byAdherent)) {
    // Chercher la mensualité du mois courant
    const currentMonthPayment = paiementsList.find(
      p => p.type === PAYMENT_TYPES.MENSUALITE && Number(p.mois) === currentMonth
    );

    if (currentMonthPayment) {
      result[id] = currentMonthPayment.statut || computePaymentStatus(currentMonthPayment);
    } else {
      // Si aucune mensualité pour le mois courant, fallback sur les frais d'inscription ou statut global
      const inscription = paiementsList.find(p => p.type === PAYMENT_TYPES.INSCRIPTION);
      if (inscription) {
        result[id] = inscription.statut || computePaymentStatus(inscription);
      } else if (paiementsList.length > 0) {
        result[id] = paiementsList[0].statut || computePaymentStatus(paiementsList[0]);
      } else {
        result[id] = PAYMENT_STATUS.A_PAYER;
      }
    }
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
  if (isCloudflareEnabled()) {
    try {
      return await CloudflareAPI.getDisciplines();
    } catch (e) {
      console.warn('Cloudflare getDisciplines fallback:', e.message);
    }
  }
  const db = await getDatabase();
  return await db.getAllAsync('SELECT * FROM disciplines ORDER BY nom ASC');
}

export async function createDiscipline(discipline) {
  if (isCloudflareEnabled()) {
    try {
      await CloudflareAPI.createDiscipline(discipline);
    } catch (e) {
      console.warn('Cloudflare createDiscipline fallback:', e.message);
    }
  }
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
  if (isCloudflareEnabled()) {
    try {
      await CloudflareAPI.deleteDiscipline(id);
    } catch (e) {
      console.warn('Cloudflare deleteDiscipline fallback:', e.message);
    }
  }
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
  if (isCloudflareEnabled()) {
    try {
      return await CloudflareAPI.getCreneaux();
    } catch (e) {
      console.warn('Cloudflare getCreneaux fallback:', e.message);
    }
  }
  const db = await getDatabase();
  return await db.getAllAsync('SELECT * FROM creneaux ORDER BY CASE jour WHEN "Lundi" THEN 1 WHEN "Mardi" THEN 2 WHEN "Mercredi" THEN 3 WHEN "Jeudi" THEN 4 WHEN "Vendredi" THEN 5 WHEN "Samedi" THEN 6 WHEN "Dimanche" THEN 7 END, heureDebut ASC');
}

function parseCreneauMinutes(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return NaN;
  const parts = timeStr.trim().split(':');
  if (parts.length !== 2) return NaN;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (isNaN(h) || isNaN(m)) return NaN;
  return h * 60 + m;
}

async function checkCreneauOverlap(db, creneau) {
  const existing = await db.getAllAsync(
    'SELECT * FROM creneaux WHERE jour = ? AND LOWER(discipline) = LOWER(?) AND LOWER(categorie) = LOWER(?) AND id != ?',
    [creneau.jour, creneau.discipline, creneau.categorie, creneau.id || '']
  );

  const newStart = parseCreneauMinutes(creneau.heureDebut);
  const newEnd = parseCreneauMinutes(creneau.heureFin);

  for (const item of existing) {
    const itemStart = parseCreneauMinutes(item.heureDebut);
    const itemEnd = parseCreneauMinutes(item.heureFin);
    if (!isNaN(newStart) && !isNaN(newEnd) && !isNaN(itemStart) && !isNaN(itemEnd)) {
      if (newStart < itemEnd && itemStart < newEnd) {
        throw new Error(`Chevauchement interdit avec le créneau existant ${item.heureDebut} - ${item.heureFin}`);
      }
    }
  }
}

export async function createCreneau(creneau) {
  if (isCloudflareEnabled()) {
    try {
      await CloudflareAPI.createCreneau(creneau);
    } catch (e) {
      rethrowOpenSeasonError(e);
      console.warn('Cloudflare createCreneau fallback:', e.message);
    }
  }
  const db = await getDatabase();
  await requireOpenActiveSeason(db);
  await checkCreneauOverlap(db, creneau);

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
  if (isCloudflareEnabled()) {
    try {
      await CloudflareAPI.updateCreneau(creneau);
    } catch (e) {
      console.warn('Cloudflare updateCreneau fallback:', e.message);
    }
  }
  const db = await getDatabase();
  await checkCreneauOverlap(db, creneau);

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
  if (isCloudflareEnabled()) {
    try {
      await CloudflareAPI.deleteCreneau(id);
    } catch (e) {
      console.warn('Cloudflare deleteCreneau fallback:', e.message);
    }
  }
  const db = await getDatabase();
  await db.runAsync(`DELETE FROM presences WHERE creneauId = ?`, [id]);
  await db.runAsync(`DELETE FROM creneaux WHERE id = ?`, [id]);
}

// ──────────────── PRÉSENCES & ABSENCES ────────────────

export async function getPresencesBySeance(creneauId, dateSeance) {
  if (isCloudflareEnabled()) {
    try {
      return await CloudflareAPI.getPresencesBySeance(creneauId, dateSeance);
    } catch (e) {
      console.warn('Cloudflare getPresencesBySeance fallback:', e.message);
    }
  }
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

  const { CATEGORIES } = require('../utils/categories');

  const scored = allAdherents.map(a => {
    const adhDiscip = (a.discipline || '').trim().toLowerCase();
    const matchDisc = !adhDiscip ||
      !creneauDiscip ||
      creneauDiscip.includes('tout') ||
      adhDiscip.includes(creneauDiscip) ||
      creneauDiscip.includes(adhDiscip);

    // Respecter la catégorie forcée par l'admin (categorieOverride)
    const catObj = a.categorieOverride
      ? (CATEGORIES.find(c => c.label === a.categorieOverride) || getCategoryByAge(a.dateNaissance))
      : getCategoryByAge(a.dateNaissance);
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
  if (isCloudflareEnabled()) {
    try {
      await CloudflareAPI.savePresencesSeance(creneauId, dateSeance, saisonId, presencesList);
    } catch (e) {
      rethrowOpenSeasonError(e);
      console.warn('Cloudflare savePresencesSeance fallback:', e.message);
    }
  }
  const db = await getDatabase();
  const d = new Date();
  const todayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  if (dateSeance > todayStr) {
    throw new Error("L'enregistrement des présences est interdit pour les dates futures.");
  }

  const now = new Date().toISOString();

  let effectiveSaisonId = saisonId;
  if (!effectiveSaisonId) {
    const active = await requireOpenActiveSeason(db);
    effectiveSaisonId = active.id;
  }
  await requireOpenActiveSeason(db, effectiveSaisonId);

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
  if (isCloudflareEnabled()) {
    try {
      const res = await CloudflareAPI.getPresencesByAdherent(adherentId, saisonId);
      if (res && res.length !== undefined) {
        const total = res.length;
        const nbPresents = res.filter(p => p.statut === 'present').length;
        const nbAbsents = res.filter(p => p.statut === 'absent').length;
        const nbRetards = res.filter(p => p.statut === 'retard').length;
        const nbExcuses = res.filter(p => p.statut === 'excuse').length;
        const tauxPresence = total > 0 ? Math.round(((nbPresents + nbRetards) / total) * 100) : 100;
        return { list: res, total, nbPresents, nbAbsents, nbRetards, nbExcuses, tauxPresence };
      }
    } catch (e) {
      console.warn('Cloudflare getPresencesByAdherent fallback:', e.message);
    }
  }
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

// ──────────────── PORTEFEUILLE & CRÉANCES ────────────────

async function loadPortefeuilleConfigMap(database) {
  const rows = await database.getAllAsync('SELECT * FROM config');
  const map = {};
  rows.forEach((r) => { map[r.key] = r.value; });
  return {
    fraisInscription: parseFloat(map.fraisInscription) || 2000,
    fraisMensuel: parseFloat(map.fraisMensuel) || 1500,
    fraisAssurance: parseFloat(map.fraisAssurance) || 500,
  };
}

export async function getCreancesByAdherent(adherentId, saisonId) {
  const database = await getDatabase();
  return database.getAllAsync(
    `SELECT * FROM creances WHERE adherentId = ? AND saisonId = ?
     ORDER BY CASE type WHEN 'inscription' THEN 0 WHEN 'assurance' THEN 1 ELSE 2 END, annee, mois`,
    [adherentId, saisonId],
  );
}

export async function getVersementsByAdherent(adherentId, saisonId) {
  const database = await getDatabase();
  return database.getAllAsync(
    `SELECT * FROM versements WHERE adherentId = ? AND saisonId = ? ORDER BY dateVersement DESC, createdAt DESC`,
    [adherentId, saisonId],
  );
}

export async function getTarifPersonnalise(adherentId, saisonId) {
  const database = await getDatabase();
  return database.getFirstAsync(
    `SELECT * FROM tarifs_personnalises WHERE adherentId = ? AND saisonId = ?`,
    [adherentId, saisonId],
  );
}

export async function setTarifPersonnalise(adherentId, saisonId, montantMensuel) {
  const database = await getDatabase();
  await requireOpenActiveSeason(database, saisonId);
  const now = new Date().toISOString();
  const existing = await getTarifPersonnalise(adherentId, saisonId);
  if (montantMensuel == null || montantMensuel === '' || Number.isNaN(Number(montantMensuel))) {
    if (existing) {
      await database.runAsync(`DELETE FROM tarifs_personnalises WHERE id = ?`, [existing.id]);
    }
    return null;
  }
  const montant = Number(montantMensuel);
  if (existing) {
    await database.runAsync(
      `UPDATE tarifs_personnalises SET montantMensuel = ?, updatedAt = ? WHERE id = ?`,
      [montant, now, existing.id],
    );
    return { ...existing, montantMensuel: montant, updatedAt: now };
  }
  const row = {
    id: uuidv4(),
    adherentId,
    saisonId,
    montantMensuel: montant,
    createdAt: now,
    updatedAt: now,
  };
  await database.runAsync(
    `INSERT INTO tarifs_personnalises (id, adherentId, saisonId, montantMensuel, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [row.id, row.adherentId, row.saisonId, row.montantMensuel, row.createdAt, row.updatedAt],
  );
  return row;
}

export async function getPaliersReduction() {
  const database = await getDatabase();
  return database.getAllAsync(
    `SELECT * FROM paliers_reduction WHERE actif = 1 ORDER BY nbMoisMin ASC`,
  );
}

export async function createPalierReduction(palier) {
  const database = await getDatabase();
  const now = new Date().toISOString();
  const id = palier.id || uuidv4();
  await database.runAsync(
    `INSERT INTO paliers_reduction (id, label, nbMoisMin, reductionPct, actif, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, 1, ?, ?)`,
    [id, palier.label || `${palier.nbMoisMin}+ mois`, palier.nbMoisMin, palier.reductionPct, now, now],
  );
  return { id, ...palier, actif: 1, createdAt: now, updatedAt: now };
}

export async function updatePalierReduction(palier) {
  const database = await getDatabase();
  const now = new Date().toISOString();
  await database.runAsync(
    `UPDATE paliers_reduction SET label = ?, nbMoisMin = ?, reductionPct = ?, actif = ?, updatedAt = ? WHERE id = ?`,
    [
      palier.label,
      palier.nbMoisMin,
      palier.reductionPct,
      palier.actif === 0 ? 0 : 1,
      now,
      palier.id,
    ],
  );
}

export async function deletePalierReduction(id) {
  const database = await getDatabase();
  await database.runAsync(`UPDATE paliers_reduction SET actif = 0, updatedAt = ? WHERE id = ?`, [
    new Date().toISOString(),
    id,
  ]);
}

export async function getReductionAdherent(adherentId, saisonId) {
  const database = await getDatabase();
  return database.getFirstAsync(
    `SELECT * FROM reductions_adherent WHERE adherentId = ? AND saisonId = ? AND actif = 1`,
    [adherentId, saisonId],
  );
}

export async function setReductionAdherent(adherentId, saisonId, { nbMoisMin = 1, reductionPct } = {}) {
  const database = await getDatabase();
  await requireOpenActiveSeason(database, saisonId);
  const now = new Date().toISOString();
  const existing = await database.getFirstAsync(
    `SELECT * FROM reductions_adherent WHERE adherentId = ? AND saisonId = ?`,
    [adherentId, saisonId],
  );

  if (reductionPct == null || reductionPct === '' || Number.isNaN(Number(reductionPct))) {
    if (existing) {
      await database.runAsync(`UPDATE reductions_adherent SET actif = 0, updatedAt = ? WHERE id = ?`, [
        now,
        existing.id,
      ]);
    }
    return null;
  }

  const pct = Number(reductionPct);
  const min = Number(nbMoisMin) || 1;

  if (existing) {
    await database.runAsync(
      `UPDATE reductions_adherent SET nbMoisMin = ?, reductionPct = ?, actif = 1, updatedAt = ? WHERE id = ?`,
      [min, pct, now, existing.id],
    );
    return { ...existing, nbMoisMin: min, reductionPct: pct, actif: 1, updatedAt: now };
  }

  const row = {
    id: uuidv4(),
    adherentId,
    saisonId,
    nbMoisMin: min,
    reductionPct: pct,
    actif: 1,
    createdAt: now,
    updatedAt: now,
  };
  await database.runAsync(
    `INSERT INTO reductions_adherent (id, adherentId, saisonId, nbMoisMin, reductionPct, actif, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
    [row.id, row.adherentId, row.saisonId, row.nbMoisMin, row.reductionPct, row.createdAt, row.updatedAt],
  );
  return row;
}

export async function ensureCreancesAdherent(adherentId, saisonId, asOfDate = new Date()) {
  if (!adherentId || !saisonId) return [];
  const database = await getDatabase();

  const enrollment = await database.getFirstAsync(
    `SELECT * FROM adherent_saisons WHERE adherentId = ? AND saisonId = ? AND actif = 1`,
    [adherentId, saisonId],
  );
  if (!enrollment) return [];

  const saison = await database.getFirstAsync(`SELECT * FROM saisons WHERE id = ?`, [saisonId]);
  if (!saison) return [];

  const config = await loadPortefeuilleConfigMap(database);
  const tarifPerso = await getTarifPersonnalise(adherentId, saisonId);
  const tarifMensuel = resolveTarifMensuel(config.fraisMensuel, tarifPerso?.montantMensuel);
  const existing = await getCreancesByAdherent(adherentId, saisonId);

  const nouvelles = genererCreancesMois({
    adherentId,
    saisonId,
    saisonAnnee: saison.annee,
    dateInscription: enrollment.dateInscription,
    asOfDate,
    fraisInscription: config.fraisInscription,
    fraisAssurance: config.fraisAssurance,
    tarifMensuel,
    assure: Boolean(enrollment.assure),
    existingCreances: existing,
  });

  const now = new Date().toISOString();
  for (const c of nouvelles) {
    const id = uuidv4();
    await database.runAsync(
      `INSERT INTO creances (id, adherentId, saisonId, type, label, mois, annee, montantDu, montantPaye, statut, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
      [
        id,
        c.adherentId,
        c.saisonId,
        c.type,
        c.label,
        c.mois ?? null,
        c.annee ?? null,
        c.montantDu,
        c.statut,
        now,
        now,
      ],
    );
  }

  return getCreancesByAdherent(adherentId, saisonId);
}

export async function enregistrerVersement({
  adherentId,
  saisonId,
  montant,
  notes = null,
  dateVersement = null,
  asOfDate = new Date(),
}) {
  const database = await getDatabase();
  await requireOpenActiveSeason(database, saisonId);

  const amount = Number(montant);
  if (!amount || amount <= 0) throw new Error('Montant de versement invalide');

  await ensureCreancesAdherent(adherentId, saisonId, asOfDate);

  const saison = await database.getFirstAsync(`SELECT * FROM saisons WHERE id = ?`, [saisonId]);
  const config = await loadPortefeuilleConfigMap(database);
  const tarifPerso = await getTarifPersonnalise(adherentId, saisonId);
  const tarifMensuel = resolveTarifMensuel(config.fraisMensuel, tarifPerso?.montantMensuel);
  const creances = await getCreancesByAdherent(adherentId, saisonId);

  const result = imputerVersement({
    montant: amount,
    creances,
    asOfDate,
    adherentId,
    saisonId,
    saisonAnnee: saison.annee,
    tarifMensuel,
  });

  const now = new Date().toISOString();
  const versementId = uuidv4();
  const dateV = dateVersement || now.slice(0, 10);

  await database.withTransactionAsync(async () => {
    await database.runAsync(
      `INSERT INTO versements (id, adherentId, saisonId, montant, dateVersement, notes, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [versementId, adherentId, saisonId, amount, dateV, notes, now],
    );

    const tempIdToReal = {};
    for (const c of result.nouvellesCreances) {
      const id = uuidv4();
      tempIdToReal[c._tempId] = id;
      await database.runAsync(
        `INSERT INTO creances (id, adherentId, saisonId, type, label, mois, annee, montantDu, montantPaye, statut, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          c.adherentId,
          c.saisonId,
          c.type,
          c.label,
          c.mois,
          c.annee,
          c.montantDu,
          c.montantPaye,
          computeCreanceStatus(c, asOfDate),
          now,
          now,
        ],
      );
    }

    for (const c of result.creances) {
      if (c._tempId && tempIdToReal[c._tempId]) continue;
      if (!c.id) continue;
      await database.runAsync(
        `UPDATE creances SET montantPaye = ?, statut = ?, updatedAt = ? WHERE id = ?`,
        [c.montantPaye, computeCreanceStatus(c, asOfDate), now, c.id],
      );
    }

    for (const imp of result.imputations) {
      const creanceId = tempIdToReal[imp.creanceId] || imp.creanceId;
      await database.runAsync(
        `INSERT INTO imputation_versements (id, versementId, creanceId, montant, createdAt)
         VALUES (?, ?, ?, ?, ?)`,
        [uuidv4(), versementId, creanceId, imp.montant, now],
      );
    }
  });

  return {
    versementId,
    ...result,
    resume: await fetchResumePortefeuille(adherentId, saisonId, asOfDate),
  };
}

export async function fetchResumePortefeuille(adherentId, saisonId, asOfDate = new Date()) {
  await ensureCreancesAdherent(adherentId, saisonId, asOfDate);
  const creances = await getCreancesByAdherent(adherentId, saisonId);
  const versements = await getVersementsByAdherent(adherentId, saisonId);
  return getResumePortefeuille({ creances, versements, asOfDate });
}

export async function fetchDetailMensuel(adherentId, saisonId, asOfDate = new Date()) {
  const database = await getDatabase();
  await ensureCreancesAdherent(adherentId, saisonId, asOfDate);
  const saison = await database.getFirstAsync(`SELECT * FROM saisons WHERE id = ?`, [saisonId]);
  const enrollment = await database.getFirstAsync(
    `SELECT dateInscription FROM adherent_saisons WHERE adherentId = ? AND saisonId = ? AND actif = 1`,
    [adherentId, saisonId],
  );
  const creances = await getCreancesByAdherent(adherentId, saisonId);
  return getDetailMensuel({
    creances,
    dateInscription: enrollment?.dateInscription,
    saisonAnnee: saison?.annee,
    asOfDate,
  });
}

export async function fetchPortefeuilleComplet(adherentId, saisonId, asOfDate = new Date()) {
  await ensureCreancesAdherent(adherentId, saisonId, asOfDate);
  const [creances, versements, resume, detailMensuel, tarifPerso, reductionAdherent] = await Promise.all([
    getCreancesByAdherent(adherentId, saisonId),
    getVersementsByAdherent(adherentId, saisonId),
    fetchResumePortefeuille(adherentId, saisonId, asOfDate),
    fetchDetailMensuel(adherentId, saisonId, asOfDate),
    getTarifPersonnalise(adherentId, saisonId),
    getReductionAdherent(adherentId, saisonId),
  ]);
  return { creances, versements, resume, detailMensuel, tarifPerso, reductionAdherent };
}

export async function estimerPaiementGroupe(adherentId, saisonId, nbMois) {
  const database = await getDatabase();
  const config = await loadPortefeuilleConfigMap(database);
  const tarifPerso = await getTarifPersonnalise(adherentId, saisonId);
  const tarifBase = resolveTarifMensuel(config.fraisMensuel, tarifPerso?.montantMensuel);
  const paliersGeneraux = await getPaliersReduction();
  const reductionAdherent = await getReductionAdherent(adherentId, saisonId);
  return calculerPaiementGroupe({
    nbMois,
    tarifBase,
    paliersGeneraux,
    reductionAdherent,
  });
}



