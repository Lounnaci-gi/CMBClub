// src/store/useStore.js
// Zustand global store

import { create } from 'zustand';
import { THEME_IDS } from '../theme/themes';
import {
  getConfig, setConfig,
  getSaisons, getSaisonActive, createSaison, activateSaison, updateSaison, deleteSaison, closeSaison,
  getAdherents, createAdherent, updateAdherent, deleteAdherent, setAdherentAssure,
  enrollAdherentInSaison,
  getPaiementsByAdherent,
  createPaiement, updatePaiement,
  getRemises, createRemise, updateRemise, deleteRemise,
  getDisciplines, createDiscipline, updateDiscipline, deleteDiscipline,
  getCreneaux, createCreneau, updateCreneau, deleteCreneau,
  getPresencesBySeance, getEligibleAdherentsForCreneau, savePresencesSeance, getPresencesByAdherent,
  getStatsBySaison,
  refreshPaymentStatuses,
  ensureAdherentAccount,
  getAdminUser,
  getAdminCount,
  updateAdminCredentials,
} from '../database/database';

import { CloudflareAPI, setApiUrl, isCloudflareEnabled } from '../services/api';

const useStore = create((set, get) => ({
  // ── Auth & Admin ──
  user: null,
  adminUser: null,
  isCloudflare: false,
  setUser: (user) => set({ user }),
  restoreSession: async () => {
    const user = await CloudflareAPI.restoreSession();
    if (user) set({ user });
    return user;
  },
  logout: async () => {
    try {
      await CloudflareAPI.logout();
    } finally {
      set({ user: null });
    }
  },
  loadAdminUser: async () => {
    const adminUser = await getAdminUser();
    set({ adminUser });
    return adminUser;
  },
  updateAdminCredentials: async (newUsername, newPassword) => {
    const updatedAdmin = await updateAdminCredentials(newUsername, newPassword);
    set(state => ({
      adminUser: updatedAdmin,
      user: state.user?.role === 'admin' ? updatedAdmin : state.user,
    }));
    return updatedAdmin;
  },

  // ── Config ──
  config: { fraisInscription: 2000, fraisMensuel: 1500, cloudflareApiUrl: 'https://cmbclub-api.ahmedlounnaci.workers.dev' },
  themeId: THEME_IDS.DARK,
  loadConfig: async () => {
    const config = await getConfig();
    if (config.cloudflareApiUrl) {
      setApiUrl(config.cloudflareApiUrl);
    }
    const themeId = config.theme && Object.values(THEME_IDS).includes(config.theme)
      ? config.theme
      : THEME_IDS.DARK;
    set({ config, themeId, isCloudflare: isCloudflareEnabled() });
  },
  updateConfig: async (key, value) => {
    await setConfig(key, value);
    if (key === 'cloudflareApiUrl') {
      setApiUrl(value);
      set(state => ({
        config: { ...state.config, [key]: value },
        isCloudflare: isCloudflareEnabled(),
      }));
    } else {
      set(state => ({ config: { ...state.config, [key]: parseFloat(value) || value } }));
    }
  },
  setCloudflareUrl: async (url) => {
    setApiUrl(url);
    await setConfig('cloudflareApiUrl', url || '');
    set(state => ({
      config: { ...state.config, cloudflareApiUrl: url || '' },
      isCloudflare: isCloudflareEnabled(),
    }));
  },
  setTheme: async (themeId) => {
    await setConfig('theme', themeId);
    set({ themeId });
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
    await get().loadAdherents(saisonId);
  },
  updateSaison: async (saisonId, updates) => {
    await updateSaison(saisonId, updates);
    await get().loadSaisons();
  },
  deleteSaison: async (saisonId) => {
    await deleteSaison(saisonId);
    await get().loadSaisons();
  },
  closeSaison: async (saisonId, credentials) => {
    await closeSaison(saisonId, credentials);
    await get().loadSaisons();
  },

  // ── Adhérents ──
  adherents: [],
  loadAdherents: async (saisonId) => {
    const targetSaisonId = saisonId || get().saisonActive?.id;
    const adherents = await getAdherents(targetSaisonId);
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
  toggleAdherentAssure: async (id, currentAssure, saisonId) => {
    const targetSaisonId = saisonId || get().saisonActive?.id;
    const nextAssure = !currentAssure;
    await setAdherentAssure(id, nextAssure, targetSaisonId);
    await get().loadAdherents(targetSaisonId);
  },
  enrollAdherent: async (adherentId, saisonId, dateInscription, assure = 0) => {
    const targetSaisonId = saisonId || get().saisonActive?.id;
    await enrollAdherentInSaison(adherentId, targetSaisonId, dateInscription, assure);
    await get().loadAdherents(targetSaisonId);
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

  // ── Créneaux ──
  creneaux: [],
  loadCreneaux: async () => {
    const creneaux = await getCreneaux();
    set({ creneaux });
  },
  createCreneau: async (creneau) => {
    await createCreneau(creneau);
    await get().loadCreneaux();
  },
  updateCreneau: async (creneau) => {
    await updateCreneau(creneau);
    await get().loadCreneaux();
  },
  deleteCreneau: async (id) => {
    await deleteCreneau(id);
    await get().loadCreneaux();
  },

  // ── Présences ──
  getPresencesSeance: async (creneauId, dateSeance) => {
    return await getPresencesBySeance(creneauId, dateSeance);
  },
  getEligibleAdherents: async (creneauId, saisonId) => {
    return await getEligibleAdherentsForCreneau(creneauId, saisonId);
  },
  savePresencesSeance: async (creneauId, dateSeance, saisonId, presencesList) => {
    await savePresencesSeance(creneauId, dateSeance, saisonId, presencesList);
  },
  getPresencesAdherent: async (adherentId, saisonId) => {
    return await getPresencesByAdherent(adherentId, saisonId);
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
