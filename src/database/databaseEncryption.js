import { ANDROID_DATABASE_PATH, isSQLCipher, open } from '@op-engineering/op-sqlite';
import * as Keychain from 'react-native-keychain';
import * as RNFS from 'react-native-fs';
import { randomBytes } from 'react-native-quick-crypto';

const DATABASE_NAME = 'cmbclub.db';
const DATABASE_LOCATION = 'SQLite';
const DATABASE_KEY_SERVICE = 'cmbclub.local-database-key';
const DATABASE_KEY_USERNAME = 'local-database-encryption-key';
const DATABASE_KEY_BYTES = 32;

function databaseOptions(extraOptions = {}) {
  return {
    name: DATABASE_NAME,
    location: DATABASE_LOCATION,
    ...extraOptions,
  };
}

async function openAndVerifyDatabase(options) {
  const database = open(databaseOptions(options));
  try {
    await database.execute('SELECT count(*) FROM sqlite_master');
    return database;
  } catch (error) {
    await database.closeAsync();
    throw error;
  }
}

async function getStoredEncryptionKey() {
  const credentials = await Keychain.getGenericPassword({ service: DATABASE_KEY_SERVICE });
  if (!credentials) return null;
  if (!new RegExp(`^[0-9a-f]{${DATABASE_KEY_BYTES * 2}}$`, 'i').test(credentials.password || '')) {
    throw new Error('La clé de chiffrement de la base locale stockée est invalide.');
  }
  return credentials.password;
}

async function storeNewEncryptionKey() {
  const key = randomBytes(DATABASE_KEY_BYTES).toString('hex');
  const saved = await Keychain.setGenericPassword(
    DATABASE_KEY_USERNAME,
    key,
    { service: DATABASE_KEY_SERVICE },
  );
  if (!saved) throw new Error('Impossible de protéger la clé de la base locale dans le trousseau sécurisé.');
  return key;
}

async function hasExistingDatabase() {
  const basePath = String(ANDROID_DATABASE_PATH || '').replace(/[\\/]+$/, '');
  if (!basePath) throw new Error('Le chemin sécurisé de la base Android est indisponible.');
  return RNFS.exists(`${basePath}/${DATABASE_LOCATION}/${DATABASE_NAME}`);
}

export async function openProtectedDatabase() {
  if (!isSQLCipher()) {
    throw new Error('SQLCipher est requis pour ouvrir la base locale protégée. Reconstruisez l’application Android.');
  }

  const storedKey = await getStoredEncryptionKey();
  if (storedKey) {
    return openAndVerifyDatabase({ encryptionKey: storedKey });
  }

  if (await hasExistingDatabase()) {
    // Preserve existing installations; they remain plaintext until an explicit migration.
    return openAndVerifyDatabase({ failOnCreate: true });
  }

  const encryptionKey = await storeNewEncryptionKey();
  return openAndVerifyDatabase({ encryptionKey });
}
