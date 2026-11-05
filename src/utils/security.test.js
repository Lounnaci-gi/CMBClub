import { pbkdf2Sync } from 'node:crypto';
import {
  generateTemporaryPassword,
  hashPassword,
  needsPasswordHashUpgrade,
  sha256,
  verifyPassword,
} from './security';

jest.mock('react-native-quick-crypto', () => {
  const { pbkdf2Sync } = require('node:crypto');
  return {
    pbkdf2(password, salt, iterations, keylen, digest, callback) {
      setImmediate(() => {
        try {
          callback(null, pbkdf2Sync(password, salt, iterations, keylen, digest));
        } catch (error) {
          callback(error);
        }
      });
    },
  };
});

jest.setTimeout(30000);

describe('password security', () => {
  test('uses salted PBKDF2 hashes that match the platform implementation', async () => {
    const firstHash = await hashPassword('correct horse battery staple');
    const secondHash = await hashPassword('correct horse battery staple');
    const [, iterations, saltHex, digest] = firstHash.split(':');

    expect(firstHash).toMatch(/^cmb_pbkdf2_v2:600000:[0-9a-f]{32}:[0-9a-f]{64}$/);
    expect(firstHash).not.toBe(secondHash);
    expect(digest).toBe(
      pbkdf2Sync('correct horse battery staple', Buffer.from(saltHex, 'hex'), Number(iterations), 32, 'sha256')
        .toString('hex'),
    );
    await expect(verifyPassword('correct horse battery staple', firstHash)).resolves.toBe(true);
    await expect(verifyPassword('incorrect password', firstHash)).resolves.toBe(false);
  });

  test('verifies legacy formats so they can be migrated after successful login', async () => {
    const plainPassword = 'legacy-password';
    const legacySaltedHash = `cmb_slt_v1:${sha256(`cmb_${plainPassword}_club_secure`)}`;

    await expect(verifyPassword(plainPassword, legacySaltedHash)).resolves.toBe(true);
    await expect(verifyPassword(plainPassword, sha256(plainPassword))).resolves.toBe(true);
    await expect(verifyPassword(plainPassword, plainPassword)).resolves.toBe(true);
  });

  test('verifies and marks weaker PBKDF2 hashes for upgrade', async () => {
    const password = 'existing-pbkdf2-password';
    const salt = Buffer.alloc(16, 7);
    const digest = pbkdf2Sync(password, salt, 60000, 32, 'sha256').toString('hex');
    const oldHash = `cmb_pbkdf2_v2:60000:${salt.toString('hex')}:${digest}`;

    await expect(verifyPassword(password, oldHash)).resolves.toBe(true);
    expect(needsPasswordHashUpgrade(oldHash)).toBe(true);
    expect(needsPasswordHashUpgrade(await hashPassword(password))).toBe(false);
  });

  test('generates non-date-derived temporary passwords', () => {
    const first = generateTemporaryPassword();
    const second = generateTemporaryPassword();
    expect(first).toHaveLength(18);
    expect(first).not.toBe(second);
  });
});
