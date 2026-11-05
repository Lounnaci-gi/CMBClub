import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac, pbkdf2Sync } from 'node:crypto';
import app from '../src/index.js';

const JWT_SECRET = 'test-secret-with-at-least-thirty-two-characters';
const adherent = {
  id: 'adherent-1',
  code: 'A001',
  nom: 'Test',
  prenom: 'Membre',
  dateNaissance: '2012-01-01',
  discipline: 'Natation',
  genre: 'F',
  assure: 1,
  observationsMedicales: 'donnée médicale',
  groupeSanguin: 'O+',
  photo: 'private-photo',
};

function toBase64Url(value) {
  return Buffer.from(value).toString('base64url');
}

async function createToken({
  role = 'adherent',
  adherentId = 'adherent-1',
  exp,
  secret = JWT_SECRET,
} = {}) {
  const now = Math.floor(Date.now() / 1000);
  const header = toBase64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = toBase64Url(JSON.stringify({
    iss: 'cmbclub-api',
    aud: 'cmbclub-mobile',
    sub: role === 'admin' ? 'admin-1' : 'user-1',
    role,
    adherentId: role === 'admin' ? null : adherentId,
    iat: now,
    exp: exp ?? now + 600,
    jti: `token-${role}-${adherentId || 'none'}`,
  }));
  const signature = createHmac('sha256', secret).update(`${header}.${payload}`).digest();
  return `${header}.${payload}.${toBase64Url(signature)}`;
}

class TestD1 {
  constructor(users = []) {
    this.users = users;
    this.attempts = new Map();
    this.revokedTokens = new Set();
    this.queries = [];
  }

  prepare(sql) {
    const db = this;
    let values = [];
    const statement = {
      bind(...bindings) {
        values = bindings;
        return statement;
      },
      async first() {
        db.queries.push({ sql, values });
        if (sql.includes('FROM revoked_access_tokens')) {
          return db.revokedTokens.has(values[0]) ? { jti: values[0] } : null;
        }
        if (sql.includes('FROM auth_login_attempts')) {
          return db.attempts.get(values[0]) || null;
        }
        if (sql.includes('FROM users WHERE id = ?')) {
          const user = db.users.find(row => row.id === values[0]);
          return user ? { id: user.id, role: user.role, adherentId: user.adherentId || null } : null;
        }
        if (sql.includes('FROM adherents WHERE id = ?')) return adherent;
        if (sql.includes('COUNT(DISTINCT a.id)')) return { total: 1 };
        if (sql.includes('SUM(montantPaye)')) return { total: 1500 };
        if (sql.includes('COUNT(DISTINCT adherentId)')) return { total: 0 };
        if (sql.includes('SELECT 1 as ping')) return { ping: 1 };
        return null;
      },
      async all() {
        db.queries.push({ sql, values });
        if (sql.includes('FROM users') && sql.includes('adherentId FROM users')) {
          return { results: db.users };
        }
        if (sql.includes('FROM config')) return { results: [{ key: 'fraisMensuel', value: '1500' }] };
        if (sql.includes('FROM paiements')) return { results: [{ id: 'payment-1', adherentId: 'adherent-1' }] };
        return { results: [] };
      },
      async run() {
        db.queries.push({ sql, values });
        if (sql.includes('INSERT INTO auth_login_attempts')) {
          const [key, now] = values;
          const current = db.attempts.get(key);
          const failures = current && current.updatedAt > now - 15 * 60 * 1000
            ? current.failures + 1
            : 1;
          const delay = failures >= 8 ? 15 * 60 * 1000 : failures >= 5 ? 5 * 60 * 1000 : failures >= 3 ? 30 * 1000 : 0;
          db.attempts.set(key, {
            failures,
            blockedUntil: delay ? now + delay : null,
            updatedAt: now,
          });
        } else if (sql.includes('DELETE FROM auth_login_attempts')) {
          db.attempts.delete(values[0]);
        } else if (sql.includes('INSERT OR IGNORE INTO revoked_access_tokens')) {
          db.revokedTokens.add(values[0]);
        } else if (sql.includes('UPDATE users SET password = ?')) {
          const user = db.users.find(row => row.id === values[1]);
          if (user && user.password === values[2]) user.password = values[0];
        }
        return { meta: { changes: 1 } };
      },
    };
    return statement;
  }

  async batch() {
    return [];
  }
}

async function request(path, {
  user,
  method = 'GET',
  body,
  headers = {},
  db = new TestD1([
    { id: 'user-1', role: 'adherent', adherentId: 'adherent-1' },
    { id: 'admin-1', role: 'admin', adherentId: null },
  ]),
} = {}) {
  const requestHeaders = new Headers(headers);
  if (user) requestHeaders.set('Authorization', `Bearer ${user}`);
  if (body !== undefined) requestHeaders.set('Content-Type', 'application/json');
  const response = await app.request(
    path,
    { method, headers: requestHeaders, body: body === undefined ? undefined : JSON.stringify(body) },
    { DB: db, JWT_SECRET, CORS_ORIGINS: 'https://app.example' },
  );
  return { response, db, body: await response.json() };
}

test('private APIs reject requests without a token', async () => {
  const { response } = await request('/api/stats?saisonId=saison-1');
  assert.equal(response.status, 401);
});

test('an adherent can read a limited version of their own profile', async () => {
  const token = await createToken();
  const own = await request('/api/adherents/adherent-1', { user: token });
  assert.equal(own.response.status, 200);
  assert.equal(own.body.data.id, 'adherent-1');
  assert.equal('observationsMedicales' in own.body.data, false);
  assert.equal(own.body.data.photo, 'private-photo');
  assert.equal(own.body.data.groupeSanguin, 'O+');

  const other = await request('/api/adherents/adherent-2', { user: token });
  assert.equal(other.response.status, 403);

  const slots = await request('/api/creneaux', { user: token });
  assert.equal(slots.response.status, 200);
});

test('an adherent can read their own payments but cannot read or modify another account', async () => {
  const token = await createToken();
  const own = await request('/api/paiements?adherentId=adherent-1', { user: token });
  assert.equal(own.response.status, 200);

  const other = await request('/api/paiements?adherentId=adherent-2', { user: token });
  assert.equal(other.response.status, 403);

  const update = await request('/api/paiements/payment-1', {
    user: token,
    method: 'PUT',
    body: { montantPaye: 0 },
  });
  assert.equal(update.response.status, 403);
});

test('an adherent cannot access global administrative statistics', async () => {
  const { response } = await request('/api/stats?saisonId=saison-1', {
    user: await createToken(),
  });
  assert.equal(response.status, 403);
});

test('an administrator retains authorized API access', async () => {
  const token = await createToken({ role: 'admin' });
  const config = await request('/api/config', { user: token });
  assert.equal(config.response.status, 200);
  const stats = await request('/api/stats?saisonId=saison-1', { user: token });
  assert.equal(stats.response.status, 200);
});

test('expired and invalid access tokens are rejected', async () => {
  const expired = await createToken({ exp: Math.floor(Date.now() / 1000) - 10 });
  const expiredResponse = await request('/api/stats?saisonId=saison-1', { user: expired });
  assert.equal(expiredResponse.response.status, 401);

  const invalidResponse = await request('/api/stats?saisonId=saison-1', { user: 'not.a.jwt' });
  assert.equal(invalidResponse.response.status, 401);

  const invalidSignature = await createToken({ secret: 'different-secret-with-at-least-32-characters' });
  const signatureResponse = await request('/api/stats?saisonId=saison-1', { user: invalidSignature });
  assert.equal(signatureResponse.response.status, 401);
});

test('SQL-looking member identifiers are denied and never interpolated into SQL', async () => {
  const token = await createToken();
  const attack = "' OR 1=1 --";
  const { response, db } = await request(
    `/api/paiements?adherentId=${encodeURIComponent(attack)}`,
    { user: token },
  );
  assert.equal(response.status, 403);
  assert.equal(db.queries.some(query => query.sql.includes(attack)), false);
});

test('administrator SQL filters bind user-provided identifiers', async () => {
  const attack = "' OR 1=1 --";
  const { response, db } = await request(
    `/api/paiements?adherentId=${encodeURIComponent(attack)}`,
    { user: await createToken({ role: 'admin' }) },
  );
  assert.equal(response.status, 200);
  const paymentQuery = db.queries.find(query => query.sql.includes('FROM paiements'));
  assert.ok(paymentQuery);
  assert.equal(paymentQuery.sql.includes(attack), false);
  assert.ok(paymentQuery.values.includes(attack));
});

test('CORS accepts only an exact configured origin', async () => {
  const denied = await request('/api/health', { headers: { Origin: 'https://app.example.attacker.test' } });
  assert.equal(denied.response.headers.get('access-control-allow-origin'), null);

  const allowed = await request('/api/health', { headers: { Origin: 'https://app.example' } });
  assert.equal(allowed.response.headers.get('access-control-allow-origin'), 'https://app.example');
});

test('repeated login failures are limited across requests', async () => {
  const db = new TestD1();
  const results = [];
  for (let attempt = 0; attempt < 3; attempt++) {
    results.push(await request('/api/auth/login', {
      method: 'POST',
      body: { username: 'unknown-user', password: 'wrong-password' },
      headers: { 'cf-connecting-ip': '192.0.2.10' },
      db,
    }));
  }
  assert.equal(results[0].response.status, 401);
  assert.equal(results[1].response.status, 401);
  assert.equal(results[2].response.status, 429);
  assert.equal(results[1].body.error, results[2].body.error);
});

test('successful legacy login upgrades the stored password hash to 600000 iterations', async () => {
  const plainPassword = 'legacy-password';
  const legacyHash = `cmb_slt_v1:${createHash('sha256')
    .update(`cmb_${plainPassword}_club_secure`)
    .digest('hex')}`;
  const user = {
    id: 'admin-1',
    username: 'admin',
    password: legacyHash,
    role: 'admin',
    adherentId: null,
  };
  const db = new TestD1([user]);
  const result = await request('/api/auth/login', {
    method: 'POST',
    body: { username: 'admin', password: plainPassword },
    headers: { 'cf-connecting-ip': '192.0.2.90' },
    db,
  });

  assert.equal(result.response.status, 200);
  const [, iterations, saltHex, digest] = user.password.split(':');
  assert.equal(iterations, '600000');
  assert.equal(digest, pbkdf2Sync(plainPassword, Buffer.from(saltHex, 'hex'), 600000, 32, 'sha256').toString('hex'));
});

test('successful login upgrades an existing 120000-iteration hash', async () => {
  const plainPassword = 'existing-pbkdf2-password';
  const salt = Buffer.alloc(16, 7);
  const digest = pbkdf2Sync(plainPassword, salt, 120000, 32, 'sha256').toString('hex');
  const user = {
    id: 'admin-1',
    username: 'admin',
    password: `cmb_pbkdf2_v2:120000:${salt.toString('hex')}:${digest}`,
    role: 'admin',
    adherentId: null,
  };
  const db = new TestD1([user]);
  const result = await request('/api/auth/login', {
    method: 'POST',
    body: { username: 'admin', password: plainPassword },
    headers: { 'cf-connecting-ip': '192.0.2.90' },
    db,
  });

  assert.equal(result.response.status, 200);
  const [, iterations] = user.password.split(':');
  assert.equal(iterations, '600000');
});

test('login errors do not reveal whether the account exists', async () => {
  const known = await request('/api/auth/login', {
    method: 'POST',
    body: { username: 'existing-account', password: 'wrong-password' },
    headers: { 'cf-connecting-ip': '192.0.2.91' },
    db: new TestD1([
      { id: 'user-1', username: 'existing-account', password: 'stored-hash', role: 'adherent', adherentId: 'adherent-1' },
    ]),
  });
  const unknown = await request('/api/auth/login', {
    method: 'POST',
    body: { username: 'missing-account', password: 'wrong-password' },
    headers: { 'cf-connecting-ip': '192.0.2.92' },
    db: new TestD1(),
  });
  assert.equal(known.response.status, 401);
  assert.equal(unknown.response.status, 401);
  assert.equal(known.body.error, unknown.body.error);
});

test('login limits also apply to an account across different client IPs', async () => {
  const db = new TestD1();
  const results = [];
  for (let attempt = 0; attempt < 3; attempt++) {
    results.push(await request('/api/auth/login', {
      method: 'POST',
      body: { username: 'same-account', password: 'wrong-password' },
      headers: { 'cf-connecting-ip': `192.0.2.${attempt + 20}` },
      db,
    }));
  }
  assert.equal(results[0].response.status, 401);
  assert.equal(results[1].response.status, 401);
  assert.equal(results[2].response.status, 429);
});

test('logout revokes the active access token as well as its refresh token', async () => {
  const db = new TestD1([
    { id: 'user-1', role: 'adherent', adherentId: 'adherent-1' },
  ]);
  const token = await createToken();
  const logout = await request('/api/auth/logout', {
    user: token,
    method: 'POST',
    body: {},
    db,
  });
  assert.equal(logout.response.status, 200);

  const afterLogout = await request('/api/adherents/adherent-1', { user: token, db });
  assert.equal(afterLogout.response.status, 401);
});
