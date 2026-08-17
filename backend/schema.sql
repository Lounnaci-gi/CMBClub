-- ==========================================================
-- Schéma Cloudflare D1 pour CMBClub
-- ==========================================================

-- 1. Configuration globale
CREATE TABLE IF NOT EXISTS config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- 2. Saisons
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

-- 3. Adhérents
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
  categorieOverride TEXT DEFAULT NULL,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

-- 4. Adhérents par saison
CREATE TABLE IF NOT EXISTS adherent_saisons (
  id TEXT PRIMARY KEY,
  adherentId TEXT NOT NULL,
  saisonId TEXT NOT NULL,
  dateInscription TEXT NOT NULL,
  assure INTEGER DEFAULT 0,
  actif INTEGER DEFAULT 1,
  FOREIGN KEY (adherentId) REFERENCES adherents(id) ON DELETE CASCADE,
  FOREIGN KEY (saisonId) REFERENCES saisons(id) ON DELETE CASCADE
);

-- 5. Paiements & Cotisations
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
  FOREIGN KEY (adherentId) REFERENCES adherents(id) ON DELETE CASCADE,
  FOREIGN KEY (saisonId) REFERENCES saisons(id) ON DELETE CASCADE
);

-- 6. Users (Authentification)

-- 6b. Portefeuille & créances
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
  FOREIGN KEY (adherentId) REFERENCES adherents(id) ON DELETE CASCADE,
  FOREIGN KEY (saisonId) REFERENCES saisons(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS versements (
  id TEXT PRIMARY KEY,
  adherentId TEXT NOT NULL,
  saisonId TEXT NOT NULL,
  montant REAL NOT NULL,
  dateVersement TEXT NOT NULL,
  notes TEXT,
  createdAt TEXT NOT NULL,
  FOREIGN KEY (adherentId) REFERENCES adherents(id) ON DELETE CASCADE,
  FOREIGN KEY (saisonId) REFERENCES saisons(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS imputation_versements (
  id TEXT PRIMARY KEY,
  versementId TEXT NOT NULL,
  creanceId TEXT NOT NULL,
  montant REAL NOT NULL,
  createdAt TEXT NOT NULL,
  FOREIGN KEY (versementId) REFERENCES versements(id) ON DELETE CASCADE,
  FOREIGN KEY (creanceId) REFERENCES creances(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tarifs_personnalises (
  id TEXT PRIMARY KEY,
  adherentId TEXT NOT NULL,
  saisonId TEXT NOT NULL,
  montantMensuel REAL NOT NULL,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  UNIQUE(adherentId, saisonId),
  FOREIGN KEY (adherentId) REFERENCES adherents(id) ON DELETE CASCADE,
  FOREIGN KEY (saisonId) REFERENCES saisons(id) ON DELETE CASCADE
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
  FOREIGN KEY (adherentId) REFERENCES adherents(id) ON DELETE CASCADE,
  FOREIGN KEY (saisonId) REFERENCES saisons(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_creances_adherent_saison ON creances(adherentId, saisonId);
CREATE INDEX IF NOT EXISTS idx_versements_adherent_saison ON versements(adherentId, saisonId);
CREATE INDEX IF NOT EXISTS idx_imputation_versement ON imputation_versements(versementId);

-- 7. Utilisateurs
-- La table users existe déjà dans D1 et n'est volontairement ni créée ni alimentée ici.
-- Ses mots de passe hachés sont uniquement vérifiés par l'API.

-- 7b. Sessions persistantes (refresh tokens hachés et révocables)
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  tokenHash TEXT NOT NULL UNIQUE,
  expiresAt TEXT NOT NULL,
  revokedAt TEXT,
  replacedByTokenId TEXT,
  createdAt TEXT NOT NULL,
  FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (replacedByTokenId) REFERENCES refresh_tokens(id)
);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_userId ON refresh_tokens(userId);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expiresAt ON refresh_tokens(expiresAt);

-- 8. Disciplines
CREATE TABLE IF NOT EXISTS disciplines (
  id TEXT PRIMARY KEY,
  nom TEXT UNIQUE NOT NULL,
  createdAt TEXT NOT NULL
);

-- 9. Créneaux d'entraînement
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

-- 10. Présences
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
  FOREIGN KEY (creneauId) REFERENCES creneaux(id) ON DELETE CASCADE,
  FOREIGN KEY (adherentId) REFERENCES adherents(id) ON DELETE CASCADE,
  FOREIGN KEY (saisonId) REFERENCES saisons(id) ON DELETE CASCADE
);

-- ==========================================================
-- Données initiales (Seeds)
-- ==========================================================

-- Configuration par défaut
INSERT OR IGNORE INTO config (key, value) VALUES ('fraisInscription', '2000');
INSERT OR IGNORE INTO config (key, value) VALUES ('fraisMensuel', '1500');
INSERT OR IGNORE INTO config (key, value) VALUES ('fraisAssurance', '500');

-- Disciplines par défaut
INSERT OR IGNORE INTO disciplines (id, nom, createdAt) 
VALUES ('disc-kickboxing', 'KickBoxing', datetime('now'));

INSERT OR IGNORE INTO disciplines (id, nom, createdAt) 
VALUES ('disc-natation', 'Natation', datetime('now'));

-- Créneaux par défaut
INSERT OR IGNORE INTO creneaux (id, discipline, categorie, jour, heureDebut, heureFin, lieu, remarque, createdAt)
VALUES 
  ('creneau-kb-cadet-1a', 'KickBoxing', 'Cadet', 'Lundi', '09:30', '11:00', 'Grande Salle A', 'Séance matin - Physique & Technique', datetime('now')),
  ('creneau-kb-cadet-1b', 'KickBoxing', 'Cadet', 'Lundi', '17:30', '19:00', 'Grande Salle A', 'Séance soir - Sparring & Tactique', datetime('now')),
  ('creneau-kb-cadet-2', 'KickBoxing', 'Cadet', 'Mercredi', '17:30', '19:00', 'Grande Salle A', 'Prévoir protège-tibias', datetime('now')),
  ('creneau-kb-senior-1', 'KickBoxing', 'Sénior', 'Mardi', '19:00', '20:30', 'Grande Salle A', 'Sparring guidé', datetime('now')),
  ('creneau-kb-senior-2', 'KickBoxing', 'Sénior', 'Jeudi', '19:00', '20:30', 'Grande Salle A', 'Préparation physique', datetime('now')),
  ('creneau-nat-poussin-1', 'Natation', 'Poussin', 'Samedi', '09:00', '10:15', 'Piscine B', 'Groupe 1 - Bonnet obligatoire', datetime('now')),
  ('creneau-nat-poussin-2', 'Natation', 'Poussin', 'Samedi', '10:30', '11:45', 'Piscine B', 'Groupe 2 - Bonnet obligatoire', datetime('now'));
