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

  // Seed config defaults
  await database.runAsync(
    `INSERT OR IGNORE INTO config (key, value) VALUES ('fraisInscription', '2000')`,
  );
  await database.runAsync(
    `INSERT OR IGNORE INTO config (key, value) VALUES ('fraisMensuel', '1500')`,
  );

  // Seed admin user
  await database.runAsync(
    `INSERT OR IGNORE INTO users (id, username, password, role, createdAt) VALUES ('admin-001', 'admin', 'admin123', 'admin', datetime('now'))`,
  );

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
  await db.runAsync(
    `INSERT INTO adherents (id, code, nom, prenom, dateNaissance, lieuNaissance, telephone, taille, groupeSanguin, observationsMedicales, photo, discipline, genre, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      adherent.id, adherent.code, adherent.nom, adherent.prenom,
      adherent.dateNaissance, adherent.lieuNaissance, adherent.telephone || null,
      adherent.taille || null, adherent.groupeSanguin || null,
      adherent.observationsMedicales || null, adherent.photo || null,
      adherent.discipline || null, adherent.genre || 'M', now, now,
    ],
  );
}

export async function updateAdherent(adherent) {
  const db = await getDatabase();
  const now = new Date().toISOString();
  // Le code n'est jamais modifié après création
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

export async function createUser(user) {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO users (id, username, password, role, adherentId, createdAt) VALUES (?, ?, ?, ?, ?, datetime('now'))`,
    [user.id, user.username, user.password, user.role || 'adherent', user.adherentId || null],
  );
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
  const base = buildAdherentCodeBase(data);
  let code = base;
  let suffix = 2;
  while (await getAdherentByCode(code)) {
    code = `${base}${suffix}`;
    suffix += 1;
  }
  return code;
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
  if (!creneau) return [];

  // Adhérents inscrits pour la saison
  const rows = await db.getAllAsync(
    `SELECT a.* FROM adherents a
     JOIN adherent_saisons as_rec ON as_rec.adherentId = a.id
     WHERE as_rec.saisonId = ? AND as_rec.actif = 1
     ORDER BY a.nom, a.prenom`,
    [saisonId],
  );

  const { getCategoryByAge } = require('../utils/categories');

  // Filtrer par discipline & catégorie
  return rows.filter(a => {
    const matchDisc = !a.discipline || a.discipline.toLowerCase() === creneau.discipline.toLowerCase();
    const cat = getCategoryByAge(a.dateNaissance);
    const matchCat = creneau.categorie === 'Toutes' || (cat && cat.label.toLowerCase() === creneau.categorie.toLowerCase());
    return matchDisc && matchCat;
  });
}

export async function savePresencesSeance(creneauId, dateSeance, saisonId, presencesList) {
  const db = await getDatabase();
  const now = new Date().toISOString();

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
        [id, creneauId, item.adherentId, saisonId, dateSeance, item.statut, item.remarque || null, now, now],
      );
    }
  }
}

export async function getPresencesByAdherent(adherentId, saisonId) {
  const db = await getDatabase();
  const query = saisonId
    ? `SELECT p.*, c.discipline, c.categorie, c.jour, c.heureDebut, c.heureFin, c.lieu
       FROM presences p
       JOIN creneaux c ON c.id = p.creneauId
       WHERE p.adherentId = ? AND p.saisonId = ?
       ORDER BY p.dateSeance DESC, c.heureDebut DESC`
    : `SELECT p.*, c.discipline, c.categorie, c.jour, c.heureDebut, c.heureFin, c.lieu
       FROM presences p
       JOIN creneaux c ON c.id = p.creneauId
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


