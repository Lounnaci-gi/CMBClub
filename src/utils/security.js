// src/utils/security.js
// Fonctions de sécurité pour le chiffrement des identifiants et le hachage des mots de passe
import {
  Buffer,
  createCipheriv,
  createDecipheriv,
  pbkdf2,
  randomBytes,
} from 'react-native-quick-crypto';
import * as Keychain from 'react-native-keychain';

const LEGACY_SALT_PREFIX = 'cmb_slt_v1:';
const PASSWORD_HASH_PREFIX = 'cmb_pbkdf2_v2:';
const PASSWORD_HASH_ITERATIONS = 600000;
const PASSWORD_SALT_BYTES = 16;
const PASSWORD_HASH_BYTES = 32;
const LEGACY_USERNAME_PREFIX = 'cmb_enc_u1:';
const USERNAME_ENCRYPTION_PREFIX = 'cmb_usr_aesgcm_v1:';
const USERNAME_KEYCHAIN_SERVICE = 'cmbclub.username-encryption-key';
const LEGACY_USERNAME_KEY =
  process.env.USERNAME_CIPHER_KEY || 'CMBClub@SecureKey#2026_AuthVault';
let usernameKeyPromise;

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

export function needsPasswordHashUpgrade(storedHash) {
  if (!String(storedHash || '').startsWith(PASSWORD_HASH_PREFIX)) return true;
  const iterations = Number(String(storedHash).slice(PASSWORD_HASH_PREFIX.length).split(':')[0]);
  return !Number.isInteger(iterations) || iterations < PASSWORD_HASH_ITERATIONS;
}

async function derivePasswordHash(password, salt, iterations) {
  const passwordBytes = utf8Bytes(password);
  return new Promise((resolve, reject) => {
    pbkdf2(passwordBytes, salt, iterations, PASSWORD_HASH_BYTES, 'sha256', (error, digest) => {
      if (error) {
        reject(error);
        return;
      }
      if (!digest) {
        reject(new Error('Le calcul PBKDF2 natif n’a retourné aucun résultat.'));
        return;
      }
      resolve(bytesToHex(digest));
    });
  });
}

async function getUsernameEncryptionKey() {
  if (!usernameKeyPromise) {
    usernameKeyPromise = (async () => {
      const credentials = await Keychain.getGenericPassword({ service: USERNAME_KEYCHAIN_SERVICE });
      if (credentials) {
        if (!/^[0-9a-f]{64}$/i.test(credentials.password)) {
          throw new Error('La clé de chiffrement des identifiants stockée est invalide.');
        }
        return Buffer.from(credentials.password, 'hex');
      }

      const key = randomBytes(32);
      const saved = await Keychain.setGenericPassword(
        'username-encryption-key',
        key.toString('hex'),
        { service: USERNAME_KEYCHAIN_SERVICE },
      );
      if (!saved) throw new Error('Impossible de protéger la clé de chiffrement dans le trousseau sécurisé.');
      return key;
    })().catch(error => {
      usernameKeyPromise = null;
      throw error;
    });
  }
  return usernameKeyPromise;
}

function decryptLegacyUsername(cipherUsername) {
  const hex = cipherUsername.slice(LEGACY_USERNAME_PREFIX.length);
  if (!/^(?:[0-9a-f]{2})+$/i.test(hex)) {
    throw new Error('Le nom d’utilisateur chiffré hérité est invalide.');
  }
  let decoded = '';
  for (let i = 0; i < hex.length; i += 2) {
    const encryptedByte = parseInt(hex.slice(i, i + 2), 16);
    const keyByte = LEGACY_USERNAME_KEY.charCodeAt((i / 2) % LEGACY_USERNAME_KEY.length);
    decoded += String.fromCharCode(encryptedByte ^ keyByte);
  }
  try {
    return decodeURIComponent(escape(decoded));
  } catch {
    return decoded;
  }
}

export async function encryptUsername(plainUsername) {
  if (!plainUsername) return '';
  const text = await decryptUsername(plainUsername);
  const key = await getUsernameEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${USERNAME_ENCRYPTION_PREFIX}${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext.toString('hex')}`;
}

export async function decryptUsername(cipherUsername) {
  if (!cipherUsername) return '';
  const str = String(cipherUsername).trim();
  if (str.startsWith(LEGACY_USERNAME_PREFIX)) return decryptLegacyUsername(str);
  if (!str.startsWith(USERNAME_ENCRYPTION_PREFIX)) return str;

  const [ivHex, tagHex, ciphertextHex] = str.slice(USERNAME_ENCRYPTION_PREFIX.length).split(':');
  if (
    !/^[0-9a-f]{24}$/i.test(ivHex || '') ||
    !/^[0-9a-f]{32}$/i.test(tagHex || '') ||
    !/^(?:[0-9a-f]{2})*$/i.test(ciphertextHex || '')
  ) {
    throw new Error('Le nom d’utilisateur chiffré est invalide.');
  }
  const decipher = createDecipheriv(
    'aes-256-gcm',
    await getUsernameEncryptionKey(),
    Buffer.from(ivHex, 'hex'),
  );
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextHex, 'hex')),
    decipher.final(),
  ]).toString('utf8');
}

export async function matchesUsername(inputUsername, storedUsername) {
  if (!inputUsername || !storedUsername) return false;
  const cleanInput = String(inputUsername).trim().toLowerCase();
  const decrypted = (await decryptUsername(storedUsername)).toLowerCase();
  return cleanInput === decrypted || cleanInput === String(storedUsername).trim().toLowerCase();
}

export function needsUsernameEncryptionUpgrade(storedUsername) {
  return Boolean(storedUsername) && !String(storedUsername).startsWith(USERNAME_ENCRYPTION_PREFIX);
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
