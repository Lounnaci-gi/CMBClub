// src/utils/validation.js
// Sanitisation et validation des entrées utilisateur (Anti-XSS, Anti-injection)

/**
 * Supprime les caractères dangereux d'une chaîne (balises HTML, caractères de contrôle, scripts)
 */
export function sanitizeText(str, maxLength = 255) {
  if (str === null || str === undefined) return '';
  let s = String(str)
    .replace(/[<>]/g, '')                    // balises HTML
    .replace(/javascript:/gi, '')            // protocole JS
    .replace(/on\w+\s*=/gi, '')              // handlers JS inline (onclick=, onerror=, etc.)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // caractères de contrôle
    .trim();
  return s.slice(0, maxLength);
}

/**
 * Sanitise uniquement les champs sensibles comme username et password
 */
export function sanitizeCredential(str, maxLength = 128) {
  if (!str) return '';
  return String(str)
    .replace(/[\x00-\x1F\x7F]/g, '')  // caractères de contrôle uniquement
    .trim()
    .slice(0, maxLength);
}

/**
 * Valide les identifiants de connexion avant envoi
 * Retourne { valid: true } ou { valid: false, error: '...' }
 */
export function validateLoginInput(username, password) {
  const u = sanitizeCredential(username);
  const p = sanitizeCredential(password);

  if (!u || !p) {
    return { valid: false, error: 'Veuillez remplir tous les champs.' };
  }
  if (u.length < 2) {
    return { valid: false, error: "L'identifiant doit contenir au moins 2 caractères." };
  }
  if (u.length > 64) {
    return { valid: false, error: "L'identifiant est trop long (max 64 caractères)." };
  }
  if (p.length < 4) {
    return { valid: false, error: 'Le mot de passe doit contenir au moins 4 caractères.' };
  }
  if (p.length > 128) {
    return { valid: false, error: 'Le mot de passe est trop long (max 128 caractères).' };
  }
  return { valid: true, username: u, password: p };
}

/**
 * Valide les données d'un adhérent avant enregistrement
 */
export function validateAdherentData(data) {
  const errors = [];

  if (!data.nom || sanitizeText(data.nom).length < 2) {
    errors.push('Le nom doit contenir au moins 2 caractères.');
  }
  if (!data.prenom || sanitizeText(data.prenom).length < 2) {
    errors.push('Le prénom doit contenir au moins 2 caractères.');
  }
  if (data.telephone && !/^[0-9\s+\-().]{7,20}$/.test(data.telephone)) {
    errors.push('Le numéro de téléphone est invalide.');
  }
  if (data.dateNaissance) {
    const d = new Date(data.dateNaissance);
    const now = new Date();
    if (isNaN(d.getTime())) {
      errors.push('La date de naissance est invalide.');
    } else if (d > now) {
      errors.push('La date de naissance ne peut pas être dans le futur.');
    } else if (now.getFullYear() - d.getFullYear() > 120) {
      errors.push('La date de naissance est trop ancienne.');
    }
  }
  if (data.taille && (isNaN(Number(data.taille)) || Number(data.taille) < 50 || Number(data.taille) > 250)) {
    errors.push('La taille doit être comprise entre 50 et 250 cm.');
  }

  return errors.length === 0
    ? { valid: true }
    : { valid: false, errors };
}

/**
 * Sanitise les champs texte d'un objet adhérent
 */
export function sanitizeAdherentData(data) {
  return {
    ...data,
    nom: sanitizeText(data.nom || '', 100),
    prenom: sanitizeText(data.prenom || '', 100),
    lieuNaissance: sanitizeText(data.lieuNaissance || '', 150),
    telephone: sanitizeText(data.telephone || '', 20),
    groupeSanguin: sanitizeText(data.groupeSanguin || '', 10),
    observationsMedicales: sanitizeText(data.observationsMedicales || '', 1000),
    discipline: sanitizeText(data.discipline || '', 100),
    taille: data.taille ? String(Number(data.taille) || '') : '',
  };
}

// ── Brute Force côté client ──
const LOCKOUT_DURATION_MS = 5 * 60 * 1000; // 5 minutes
const MAX_ATTEMPTS = 5;

const loginState = {
  attempts: 0,
  lockedUntil: null,
};

/**
 * Vérifie si la connexion est verrouillée côté client
 */
export function isLoginLocked() {
  if (!loginState.lockedUntil) return false;
  if (Date.now() >= loginState.lockedUntil) {
    loginState.lockedUntil = null;
    loginState.attempts = 0;
    return false;
  }
  return true;
}

/**
 * Retourne le nombre de secondes restantes avant déverrouillage
 */
export function getLockoutRemainingSeconds() {
  if (!loginState.lockedUntil) return 0;
  return Math.max(0, Math.ceil((loginState.lockedUntil - Date.now()) / 1000));
}

/**
 * Enregistre une tentative de connexion échouée côté client
 */
export function recordFailedLoginAttempt() {
  loginState.attempts += 1;
  if (loginState.attempts >= MAX_ATTEMPTS) {
    loginState.lockedUntil = Date.now() + LOCKOUT_DURATION_MS;
  }
}

/**
 * Réinitialise le compteur de tentatives après une connexion réussie
 */
export function resetLoginAttempts() {
  loginState.attempts = 0;
  loginState.lockedUntil = null;
}

/**
 * Retourne le nombre de tentatives restantes
 */
export function getRemainingAttempts() {
  return Math.max(0, MAX_ATTEMPTS - loginState.attempts);
}
