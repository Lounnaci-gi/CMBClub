// src/utils/security.js
// Fonctions de sécurité pour le chiffrement des identifiants et le hachage des mots de passe

const LEGACY_SALT_PREFIX = 'cmb_slt_v1:';
const PASSWORD_HASH_PREFIX = 'cmb_pbkdf2_v2:';
const PASSWORD_HASH_ITERATIONS = 60000;
const PASSWORD_SALT_BYTES = 16;
const ENC_PREFIX = 'cmb_enc_u1:';
// Clé lue depuis .env (USERNAME_CIPHER_KEY).
// Le fallback conserve la rétrocompatibilité avec les noms d'utilisateur
// déjà chiffrés en base SQLite locale si la variable n'est pas définie.
const SECRET_KEY =
  process.env.USERNAME_CIPHER_KEY || 'CMBClub@SecureKey#2026_AuthVault';

const SHA256_CONSTANTS = (() => {
  const initialHash = [];
  const roundConstants = [];
  const isComposite = {};
  const maxWord = Math.pow(2, 32);
  let primeCounter = 0;
  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (let i = 0; i < 313; i += candidate) isComposite[i] = candidate;
      initialHash[primeCounter] = (Math.pow(candidate, 0.5) * maxWord) | 0;
      roundConstants[primeCounter++] = (Math.pow(candidate, 1 / 3) * maxWord) | 0;
    }
  }
  return { initialHash, roundConstants };
})();

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
  const input = text instanceof Uint8Array
    ? text
    : Uint8Array.from(unescape(encodeURIComponent(String(text || ''))), char => char.charCodeAt(0));
  const bitLength = input.length * 8;
  const hash = SHA256_CONSTANTS.initialHash.slice();
  const paddedLength = Math.ceil((input.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(input);
  padded[input.length] = 0x80;
  const highBitLength = Math.floor(bitLength / maxWord) | 0;
  const lowBitLength = bitLength | 0;
  for (let i = 0; i < 4; i++) {
    padded[paddedLength - 8 + i] = (highBitLength >>> ((3 - i) * 8)) & 255;
    padded[paddedLength - 4 + i] = (lowBitLength >>> ((3 - i) * 8)) & 255;
  }
  for (let i = 0; i < padded.length; i++) {
    words[i >> 2] |= padded[i] << ((3 - (i % 4)) * 8);
  }

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
        SHA256_CONSTANTS.roundConstants[i] +
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

function utf8Bytes(text) {
  return Uint8Array.from(unescape(encodeURIComponent(String(text))), char => char.charCodeAt(0));
}

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes) {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

function hmacSha256(key, message) {
  let normalizedKey = key;
  if (normalizedKey.length > 64) normalizedKey = hexToBytes(sha256(normalizedKey));
  const inner = new Uint8Array(64 + message.length);
  const outer = new Uint8Array(96);
  for (let i = 0; i < 64; i++) {
    const byte = normalizedKey[i] || 0;
    inner[i] = byte ^ 0x36;
    outer[i] = byte ^ 0x5c;
  }
  inner.set(message, 64);
  outer.set(hexToBytes(sha256(inner)), 64);
  return hexToBytes(sha256(outer));
}

async function derivePasswordHash(password, salt, iterations) {
  const passwordBytes = utf8Bytes(password);
  if (globalThis.crypto?.subtle?.deriveBits) {
    const keyMaterial = await globalThis.crypto.subtle.importKey(
      'raw',
      passwordBytes,
      'PBKDF2',
      false,
      ['deriveBits'],
    );
    const bits = await globalThis.crypto.subtle.deriveBits(
      { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
      keyMaterial,
      256,
    );
    return bytesToHex(new Uint8Array(bits));
  }

  const firstBlock = new Uint8Array(salt.length + 4);
  firstBlock.set(salt);
  firstBlock[firstBlock.length - 1] = 1;

  let current = hmacSha256(passwordBytes, firstBlock);
  const derived = current.slice();
  for (let round = 1; round < iterations; round++) {
    current = hmacSha256(passwordBytes, current);
    for (let i = 0; i < derived.length; i++) derived[i] ^= current[i];
    if (round % 2048 === 0) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }
  return bytesToHex(derived);
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
export async function hashPassword(plainPassword) {
  if (!plainPassword) return '';
  const clean = String(plainPassword).trim();
  const salt = new Uint8Array(PASSWORD_SALT_BYTES);
  if (!globalThis.crypto?.getRandomValues) {
    throw new Error('Un générateur aléatoire sécurisé est requis pour hacher les mots de passe.');
  }
  globalThis.crypto.getRandomValues(salt);
  const digest = await derivePasswordHash(clean, salt, PASSWORD_HASH_ITERATIONS);
  return `${PASSWORD_HASH_PREFIX}${PASSWORD_HASH_ITERATIONS}:${bytesToHex(salt)}:${digest}`;
}

export function generateTemporaryPassword(length = 18) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*';
  const randomBytes = new Uint8Array(length);
  if (!globalThis.crypto?.getRandomValues) {
    throw new Error('Un générateur aléatoire sécurisé est requis pour créer un mot de passe temporaire.');
  }
  globalThis.crypto.getRandomValues(randomBytes);
  return Array.from(randomBytes, byte => alphabet[byte % alphabet.length]).join('');
}

/**
 * Vérifie un mot de passe saisi par rapport au mot de passe stocké (haché ou legacy)
 */
export async function verifyPassword(inputPassword, storedHash) {
  if (!inputPassword || !storedHash) return false;
  const cleanInput = String(inputPassword).trim();
  const cleanStored = String(storedHash).trim();

  if (cleanStored.startsWith(PASSWORD_HASH_PREFIX)) {
    const [iterationsText, saltHex, expectedHash] = cleanStored.slice(PASSWORD_HASH_PREFIX.length).split(':');
    const iterations = Number(iterationsText);
    if (
      !Number.isInteger(iterations) ||
      iterations < 60000 ||
      iterations > 1000000 ||
      !/^[0-9a-f]{32}$/i.test(saltHex || '') ||
      !/^[0-9a-f]{64}$/i.test(expectedHash || '')
    ) return false;
    const actualHash = await derivePasswordHash(cleanInput, hexToBytes(saltHex), iterations);
    let difference = 0;
    for (let i = 0; i < expectedHash.length; i++) {
      difference |= expectedHash.charCodeAt(i) ^ actualHash.charCodeAt(i);
    }
    return difference === 0;
  }

  if (cleanStored.startsWith(LEGACY_SALT_PREFIX)) {
    return cleanStored === `${LEGACY_SALT_PREFIX}${sha256(`cmb_${cleanInput}_club_secure`)}`;
  }

  return cleanStored === sha256(cleanInput) || cleanStored === cleanInput;
}
