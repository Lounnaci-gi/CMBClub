import { pbkdf2Sync } from 'node:crypto';
import {
  generateTemporaryPassword,
  hashPassword,
  sha256,
  verifyPassword,
} from './security';

jest.setTimeout(30000);

describe('password security', () => {
  test('uses salted PBKDF2 hashes that match the platform implementation', async () => {
    const firstHash = await hashPassword('correct horse battery staple');
    const secondHash = await hashPassword('correct horse battery staple');
    const [, iterations, saltHex, digest] = firstHash.split(':');

    expect(firstHash).toMatch(/^cmb_pbkdf2_v2:60000:[0-9a-f]{32}:[0-9a-f]{64}$/);
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

  test('generates non-date-derived temporary passwords', () => {
    const first = generateTemporaryPassword();
    const second = generateTemporaryPassword();
    expect(first).toHaveLength(18);
    expect(first).not.toBe(second);
  });
});
