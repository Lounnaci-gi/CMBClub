// src/store/useStore.js
// Zustand global store

import { create } from 'zustand';
import {
  getConfig, setConfig,
  getSaisons, getSaisonActive, createSaison, activateSaison,
  getAdherents, createAdherent, updateAdherent, deleteAdherent,
  enrollAdherentInSaison,
  getPaiementsByAdherent,
  createPaiement, updatePaiement,
  getRemises, createRemise, updateRemise, deleteRemise,
  getDisciplines, createDiscipline, updateDiscipline, deleteDiscipline,
  getStatsBySaison,
  refreshPaymentStatuses,
  ensureAdherentAccount,
} from '../database/database';

const useStore = create((set, get) => ({
  // ── Auth ──
  user: null,
  setUser: (user) => set({ user }),
  logout: () => set({ user: null }),

  // ── Config ──
  config: { fraisInscription: 2000, fraisMensuel: 1500 },
  loadConfig: async () => {
    const config = await getConfig();
    set({ config });
  },
  updateConfig: async (key, value) => {
    await setConfig(key, value);
    set(state => ({ config: { ...state.config, [key]: parseFloat(value) || value } }));
  },

  // ── Saisons ──
  saisons: [],
  saisonActive: null,
  loadSaisons: async () => {
    const saisons = await getSaisons();
    const saisonActive = await getSaisonActive();
    set({ saisons, saisonActive });
  },
  createSaison: async (saison) => {
    await createSaison(saison);
    await get().loadSaisons();
  },
  activateSaison: async (saisonId) => {
    await activateSaison(saisonId);
    await get().loadSaisons();
  },

  // ── Adhérents ──
  adherents: [],
  loadAdherents: async () => {
    const adherents = await getAdherents();
    set({ adherents });
  },
  createAdherent: async (adherent) => {
    await createAdherent(adherent);
    await ensureAdherentAccount(adherent);
    await get().loadAdherents();
  },
  updateAdherent: async (adherent) => {
    await updateAdherent(adherent);
    await get().loadAdherents();
  },
  deleteAdherent: async (id) => {
    await deleteAdherent(id);
    await get().loadAdherents();
  },
  enrollAdherent: async (adherentId, saisonId, dateInscription) => {
    await enrollAdherentInSaison(adherentId, saisonId, dateInscription);
  },

  // ── Paiements ──
  paiements: [],
  loadPaiements: async (adherentId, saisonId) => {
    if (saisonId) await refreshPaymentStatuses(saisonId);
    const paiements = await getPaiementsByAdherent(adherentId, saisonId);
    set({ paiements });
    return paiements;
  },
  createPaiement: async (paiement) => {
    await createPaiement(paiement);
  },
  updatePaiement: async (paiement) => {
    await updatePaiement(paiement);
  },

  // ── Remises ──
  remises: [],
  loadRemises: async () => {
    const remises = await getRemises();
    set({ remises });
  },
  createRemise: async (remise) => {
    await createRemise(remise);
    await get().loadRemises();
  },
  updateRemise: async (remise) => {
    await updateRemise(remise);
    await get().loadRemises();
  },
  deleteRemise: async (id) => {
    await deleteRemise(id);
    await get().loadRemises();
  },

  // ── Disciplines ──
  disciplines: [],
  loadDisciplines: async () => {
    const disciplines = await getDisciplines();
    set({ disciplines });
  },
  createDiscipline: async (discipline) => {
    await createDiscipline(discipline);
    await get().loadDisciplines();
  },
  updateDiscipline: async (discipline, oldNom) => {
    await updateDiscipline(discipline, oldNom);
    await get().loadDisciplines();
    await get().loadAdherents();
  },
  deleteDiscipline: async (id) => {
    await deleteDiscipline(id);
    await get().loadDisciplines();
  },

  // ── Stats ──
  stats: { nbAdherents: 0, collected: 0, retards: 0 },
  loadStats: async (saisonId) => {
    if (!saisonId) return;
    await refreshPaymentStatuses(saisonId);
    const stats = await getStatsBySaison(saisonId);
    set({ stats });
  },
}));

export default useStore;
