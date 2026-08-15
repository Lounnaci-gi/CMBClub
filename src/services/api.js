// src/services/api.js
// Client API HTTP pour le backend Cloudflare Worker / Cloudflare D1

let currentApiUrl = '';

export function setApiUrl(url) {
  if (!url) {
    currentApiUrl = '';
    return;
  }
  // Supprime le slash final si présent
  currentApiUrl = url.trim().replace(/\/+$/, '');
}

export function getApiUrl() {
  return currentApiUrl;
}

export function isCloudflareEnabled() {
  return Boolean(currentApiUrl && currentApiUrl.startsWith('http'));
}

async function request(endpoint, options = {}) {
  if (!currentApiUrl) {
    throw new Error('URL Cloudflare non configurée');
  }

  const url = `${currentApiUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
  const defaultHeaders = {
    'Content-Type': 'application/json',
  };

  const response = await fetch(url, {
    ...options,
    headers: {
      ...defaultHeaders,
      ...options.headers,
    },
  });

  const rawText = await response.text();
  let json = null;
  try {
    json = JSON.parse(rawText);
  } catch (_e) {
    if (!response.ok) {
      throw new Error(`Erreur HTTP ${response.status}: ${rawText.slice(0, 100) || response.statusText}`);
    }
    return rawText;
  }

  if (!response.ok || json?.success === false) {
    throw new Error(json?.error || `Erreur HTTP ${response.status}`);
  }

  return json?.data !== undefined ? json.data : json;
}

export const CloudflareAPI = {
  // ── Health ──
  checkHealth: async (baseUrl) => {
    const url = (baseUrl || currentApiUrl).trim().replace(/\/+$/, '');
    try {
      const res = await fetch(`${url}/api/health`);
      const rawText = await res.text();
      const json = JSON.parse(rawText);
      return json.success ? json.data : null;
    } catch {
      return null;
    }
  },

  // ── Auth ──
  login: (username, password) =>
    request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),

  getAdminUser: () => request('/api/auth/admin'),

  updateAdminCredentials: (username, password) =>
    request('/api/auth/admin-credentials', {
      method: 'PUT',
      body: JSON.stringify({ username, password }),
    }),

  // ── Config ──
  getConfig: () => request('/api/config'),
  setConfig: (key, value) =>
    request('/api/config', {
      method: 'PUT',
      body: JSON.stringify({ key, value }),
    }),

  // ── Saisons ──
  getSaisons: () => request('/api/saisons'),
  getSaisonActive: () => request('/api/saisons/active'),
  createSaison: (saison) =>
    request('/api/saisons', {
      method: 'POST',
      body: JSON.stringify(saison),
    }),
  activateSaison: (saisonId) =>
    request(`/api/saisons/${encodeURIComponent(saisonId)}/activate`, {
      method: 'PUT',
    }),
  updateSaison: (saisonId, { dateDebut, dateFin }) =>
    request(`/api/saisons/${encodeURIComponent(saisonId)}`, {
      method: 'PUT',
      body: JSON.stringify({ dateDebut, dateFin }),
    }),
  closeSaison: (saisonId, credentials = {}) =>
    request(`/api/saisons/${encodeURIComponent(saisonId)}/close`, {
      method: 'PUT',
      body: JSON.stringify(credentials),
    }),
  deleteSaison: (saisonId) =>
    request(`/api/saisons/${encodeURIComponent(saisonId)}`, {
      method: 'DELETE',
    }),

  // ── Adhérents ──
  getAdherents: (saisonId) =>
    request(`/api/adherents${saisonId ? `?saisonId=${encodeURIComponent(saisonId)}` : ''}`),
  getAdherentById: (id) => request(`/api/adherents/${encodeURIComponent(id)}`),
  createAdherent: (adherent) =>
    request('/api/adherents', {
      method: 'POST',
      body: JSON.stringify(adherent),
    }),
  updateAdherent: (adherent) =>
    request(`/api/adherents/${encodeURIComponent(adherent.id)}`, {
      method: 'PUT',
      body: JSON.stringify(adherent),
    }),
  deleteAdherent: (id) =>
    request(`/api/adherents/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),
  setAdherentAssure: (id, assure, saisonId) =>
    request(`/api/adherents/${encodeURIComponent(id)}/assure`, {
      method: 'PUT',
      body: JSON.stringify({ assure, saisonId }),
    }),
  enrollAdherent: (adherentId, saisonId, dateInscription, assure) =>
    request(`/api/adherents/${encodeURIComponent(adherentId)}/enroll`, {
      method: 'POST',
      body: JSON.stringify({ saisonId, dateInscription, assure }),
    }),

  // ── Paiements ──
  getPaiements: (adherentId, saisonId) => {
    const params = new URLSearchParams();
    if (adherentId) params.append('adherentId', adherentId);
    if (saisonId) params.append('saisonId', saisonId);
    return request(`/api/paiements?${params.toString()}`);
  },
  createPaiement: (paiement) =>
    request('/api/paiements', {
      method: 'POST',
      body: JSON.stringify(paiement),
    }),
  updatePaiement: (paiement) =>
    request(`/api/paiements/${encodeURIComponent(paiement.id)}`, {
      method: 'PUT',
      body: JSON.stringify(paiement),
    }),

  // ── Remises ──
  getRemises: () => request('/api/remises'),
  createRemise: (remise) =>
    request('/api/remises', {
      method: 'POST',
      body: JSON.stringify(remise),
    }),
  deleteRemise: (id) =>
    request(`/api/remises/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),

  // ── Disciplines ──
  getDisciplines: () => request('/api/disciplines'),
  createDiscipline: (discipline) =>
    request('/api/disciplines', {
      method: 'POST',
      body: JSON.stringify(discipline),
    }),
  deleteDiscipline: (id) =>
    request(`/api/disciplines/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),

  // ── Créneaux ──
  getCreneaux: () => request('/api/creneaux'),
  createCreneau: (creneau) =>
    request('/api/creneaux', {
      method: 'POST',
      body: JSON.stringify(creneau),
    }),
  updateCreneau: (creneau) =>
    request(`/api/creneaux/${encodeURIComponent(creneau.id)}`, {
      method: 'PUT',
      body: JSON.stringify(creneau),
    }),
  deleteCreneau: (id) =>
    request(`/api/creneaux/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),

  // ── Présences ──
  getPresencesBySeance: (creneauId, dateSeance) =>
    request(`/api/presences/seance?creneauId=${encodeURIComponent(creneauId)}&dateSeance=${encodeURIComponent(dateSeance)}`),
  savePresencesSeance: (creneauId, dateSeance, saisonId, presencesList) =>
    request('/api/presences/seance', {
      method: 'POST',
      body: JSON.stringify({ creneauId, dateSeance, saisonId, presencesList }),
    }),
  getPresencesByAdherent: (adherentId, saisonId) =>
    request(`/api/presences/adherent/${adherentId}${saisonId ? `?saisonId=${encodeURIComponent(saisonId)}` : ''}`),

  // ── Stats ──
  getStats: (saisonId) =>
    request(`/api/stats?saisonId=${encodeURIComponent(saisonId)}`),
};
