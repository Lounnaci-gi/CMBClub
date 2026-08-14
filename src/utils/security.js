// src/utils/security.js
// Fonctions de sécurité pour le chiffrement des identifiants et le hachage des mots de passe

const SALT_PREFIX = 'cmb_slt_v1:';
const ENC_PREFIX = 'cmb_enc_u1:';
const SECRET_KEY = 'CMBClub@SecureKey#2026_AuthVault';

/**
 * Calcul d'empreinte SHA-256 standard en pur JS compatible React Native, Web, Node et Workers
 */
export function sha256(text) {
  function rightRotate(value, amount) {
    return (value >>> amount) | (value << (32 - amount));
  }
  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  const words = [];
  const utf8 = unescape(encodeURIComponent(String(text || '')));
  const asciiBitLength = utf8.length * 8;
  const hash = [];
  const k = [];
  let primeCounter = 0;
  const isComposite = {};
  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (let i = 0; i < 313; i += candidate) {
        isComposite[i] = candidate;
      }
      hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
      k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
    }
  }
  let s = utf8 + '\x80';
  while (s.length % 64 !== 56) s += '\x00';
  for (let i = 0; i < s.length; i++) {
    const j = s.charCodeAt(i);
    words[i >> 2] |= j << ((3 - (i % 4)) * 8);
  }
  words[words.length] = (asciiBitLength / maxWord) | 0;
  words[words.length] = asciiBitLength | 0;

  for (let j = 0; j < words.length;) {
    const w = words.slice(j, (j += 16));
    const oldHash = hash.slice(0, 8);
    for (let i = 0; i < 64; i++) {
      const i2 = i + j;
      const w15 = w[i - 15], w2 = w[i - 2];
      const a = hash[0], e = hash[4];
      const temp1 =
        hash[7] +
        (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)) +
        ((e & hash[5]) ^ (~e & hash[6])) +
        k[i] +
        (w[i] =
          i < 16
            ? w[i]
            : (w[i - 16] +
                (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3)) +
                w[i - 7] +
                (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))) |
              0);
      const temp2 =
        (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)) +
        ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
      hash.pop();
      hash.unshift((temp1 + temp2) | 0);
      hash[4] = (hash[4] + temp1) | 0;
    }
    for (let i = 0; i < 8; i++) {
      hash[i] = (hash[i] + oldHash[i]) | 0;
    }
  }
  let result = '';
  for (let i = 0; i < 8; i++) {
    for (let j = 3; j >= 0; j--) {
      const b = (hash[i] >>> (j * 8)) & 255;
      result += (b < 16 ? '0' : '') + b.toString(16);
    }
  }
  return result;
}

/**
 * Chiffre le nom d'utilisateur avant enregistrement en base de données
 */
export function encryptUsername(plainUsername) {
  if (!plainUsername) return '';
  const text = String(plainUsername).trim();
  if (text.startsWith(ENC_PREFIX)) return text;
  const utf8 = unescape(encodeURIComponent(text));
  let result = '';
  for (let i = 0; i < utf8.length; i++) {
    const charCode = utf8.charCodeAt(i);
    const keyChar = SECRET_KEY.charCodeAt(i % SECRET_KEY.length);
    const enc = charCode ^ keyChar;
    result += enc.toString(16).padStart(2, '0');
  }
  return `${ENC_PREFIX}${result}`;
}

/**
 * Déchiffre le nom d'utilisateur pour l'affichage dans l'application
 */
export function decryptUsername(cipherUsername) {
  if (!cipherUsername) return '';
  const str = String(cipherUsername).trim();
  if (!str.startsWith(ENC_PREFIX)) return str;
  const hex = str.slice(ENC_PREFIX.length);
  let utf8 = '';
  for (let i = 0; i < hex.length; i += 2) {
    const enc = parseInt(hex.substr(i, 2), 16);
    const keyChar = SECRET_KEY.charCodeAt((i / 2) % SECRET_KEY.length);
    utf8 += String.fromCharCode(enc ^ keyChar);
  }
  try {
    return decodeURIComponent(escape(utf8));
  } catch {
    return utf8;
  }
}

/**
 * Compare un identifiant saisi avec un identifiant stocké (chiffré ou en clair)
 */
export function matchesUsername(inputUsername, storedUsername) {
  if (!inputUsername || !storedUsername) return false;
  const cleanInput = String(inputUsername).trim().toLowerCase();
  const decrypted = decryptUsername(storedUsername).toLowerCase();
  if (cleanInput === decrypted) return true;
  if (cleanInput === String(storedUsername).trim().toLowerCase()) return true;
  return false;
}

/**
 * Hache un mot de passe avant enregistrement en base de données
 */
export function hashPassword(plainPassword) {
  if (!plainPassword) return '';
  const clean = String(plainPassword).trim();
  return `${SALT_PREFIX}${sha256(`cmb_${clean}_club_secure`)}`;
}

/**
 * Vérifie un mot de passe saisi par rapport au mot de passe stocké (haché ou legacy)
 */
export function verifyPassword(inputPassword, storedHash) {
  if (!inputPassword || !storedHash) return false;
  const cleanInput = String(inputPassword).trim();
  const cleanStored = String(storedHash).trim();

  // Format sécurisé haché
  const computedHash = hashPassword(cleanInput);
  if (cleanStored === computedHash) {
    return true;
  }

  // Compatibilité avec le SHA-256 direct (sans préfixe salt)
  if (cleanStored === sha256(cleanInput)) {
    return true;
  }

  // Rétrocompatibilité avec les anciens mots de passe en clair (pour migration transparente)
  if (cleanStored === cleanInput) {
    return true;
  }

  return false;
}
