/**
 * Re-exporte les fonctions de persistance portefeuille depuis database.js
 * pour éviter toute dépendance circulaire (require cycle).
 */

export {
  getCreancesByAdherent,
  getVersementsByAdherent,
  getTarifPersonnalise,
  setTarifPersonnalise,
  getPaliersReduction,
  createPalierReduction,
  updatePalierReduction,
  deletePalierReduction,
  getReductionAdherent,
  setReductionAdherent,
  ensureCreancesAdherent,
  enregistrerVersement,
  fetchResumePortefeuille,
  fetchDetailMensuel,
  fetchPortefeuilleComplet,
  estimerPaiementGroupe,
} from './database';
