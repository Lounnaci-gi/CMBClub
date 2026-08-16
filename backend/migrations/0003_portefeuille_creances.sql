-- Portefeuille : créances, versements, imputations, tarifs & paliers multi-mois

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

INSERT OR IGNORE INTO config (key, value) VALUES ('fraisAssurance', '500');
