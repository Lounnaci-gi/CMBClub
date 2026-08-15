-- Ajoute l'état d'ouverture/fermeture aux saisons existantes.
ALTER TABLE saisons ADD COLUMN statut TEXT NOT NULL DEFAULT 'ouvert';
