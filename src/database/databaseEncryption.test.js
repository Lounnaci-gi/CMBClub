import { openProtectedDatabase } from './databaseEncryption';
import { ANDROID_DATABASE_PATH, isSQLCipher, open } from '@op-engineering/op-sqlite';
import * as Keychain from 'react-native-keychain';
import * as RNFS from 'react-native-fs';
import { randomBytes } from 'react-native-quick-crypto';

jest.mock('@op-engineering/op-sqlite', () => ({
  ANDROID_DATABASE_PATH: '/data/user/0/com.cmbclub.app/databases/',
  isSQLCipher: jest.fn(),
  open: jest.fn(),
}));

jest.mock('react-native-keychain', () => ({
  getGenericPassword: jest.fn(),
  setGenericPassword: jest.fn(),
}));

jest.mock('react-native-fs', () => ({
  exists: jest.fn(),
}));

jest.mock('react-native-quick-crypto', () => ({
  randomBytes: jest.fn(),
}));

const database = {
  execute: jest.fn(),
  closeAsync: jest.fn(),
};

describe('protected local database', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    isSQLCipher.mockReturnValue(true);
    open.mockReturnValue(database);
    database.execute.mockResolvedValue({ rows: [] });
    database.closeAsync.mockResolvedValue();
    Keychain.getGenericPassword.mockResolvedValue(false);
    Keychain.setGenericPassword.mockResolvedValue({ service: 'saved' });
    RNFS.exists.mockResolvedValue(false);
    randomBytes.mockReturnValue(Buffer.alloc(32, 7));
  });

  test('creates a new database with a random key protected by Keychain', async () => {
    await expect(openProtectedDatabase()).resolves.toBe(database);

    expect(RNFS.exists).toHaveBeenCalledWith(
      '/data/user/0/com.cmbclub.app/databases/SQLite/cmbclub.db',
    );
    expect(Keychain.setGenericPassword).toHaveBeenCalledWith(
      'local-database-encryption-key',
      '07'.repeat(32),
      { service: 'cmbclub.local-database-key' },
    );
    expect(open).toHaveBeenCalledWith({
      name: 'cmbclub.db',
      location: 'SQLite',
      encryptionKey: '07'.repeat(32),
    });
    expect(database.execute).toHaveBeenCalledWith('SELECT count(*) FROM sqlite_master');
  });

  test('keeps an existing plaintext database accessible without creating a key', async () => {
    RNFS.exists.mockResolvedValue(true);

    await expect(openProtectedDatabase()).resolves.toBe(database);

    expect(open).toHaveBeenCalledWith({
      name: 'cmbclub.db',
      location: 'SQLite',
      failOnCreate: true,
    });
    expect(Keychain.setGenericPassword).not.toHaveBeenCalled();
  });

  test('uses the stored key for an encrypted database', async () => {
    Keychain.getGenericPassword.mockResolvedValue({ password: 'ab'.repeat(32) });

    await expect(openProtectedDatabase()).resolves.toBe(database);

    expect(open).toHaveBeenCalledWith({
      name: 'cmbclub.db',
      location: 'SQLite',
      encryptionKey: 'ab'.repeat(32),
    });
    expect(RNFS.exists).not.toHaveBeenCalled();
  });

  test('fails closed if the native binary is not built with SQLCipher', async () => {
    isSQLCipher.mockReturnValue(false);

    await expect(openProtectedDatabase()).rejects.toThrow('SQLCipher est requis');
    expect(open).not.toHaveBeenCalled();
  });

  test('does not silently replace a database it cannot verify', async () => {
    RNFS.exists.mockResolvedValue(true);
    database.execute.mockRejectedValue(new Error('database is malformed'));

    await expect(openProtectedDatabase()).rejects.toThrow('database is malformed');
    expect(database.closeAsync).toHaveBeenCalled();
    expect(Keychain.setGenericPassword).not.toHaveBeenCalled();
  });
});
