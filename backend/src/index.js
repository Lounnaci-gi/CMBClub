import { Hono } from 'hono';
import { cors } from 'hono/cors';

const app = new Hono();

// ── CORS : restreindre aux origines autorisées ──
app.use('*', cors({
  origin: (origin, c) => {
    if (!origin) return null;
    const allowedOrigins = String(c.env.CORS_ORIGINS || '')
      .split(',')
      .map(value => value.trim())
      .filter(Boolean);
    return allowedOrigins.includes(origin) ? origin : null;
  },
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400,
}));

// ── Headers de sécurité HTTP ──
app.use('*', async (c, next) => {
  await next();
  c.res.headers.set('X-Content-Type-Options', 'nosniff');
  c.res.headers.set('X-Frame-Options', 'DENY');
  c.res.headers.set('Referrer-Policy', 'no-referrer');
  c.res.headers.set('X-XSS-Protection', '1; mode=block');
  c.res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  c.res.headers.set('Cache-Control', 'no-store');
});

// ── Limite de taille des requêtes (Anti-Payload Bombing) ──
const MAX_BODY_SIZE = 2 * 1024 * 1024; // 2 Mo
app.use('*', async (c, next) => {
  const contentLength = parseInt(c.req.header('content-length') || '0', 10);
  if (contentLength > MAX_BODY_SIZE) {
    return c.json({ success: false, error: 'Requête trop volumineuse.' }, 413);
  }
  return next();
});

// ── Sanitisation des entrées (Anti-XSS) ──
function sanitizeStr(str, maxLen = 255) {
  if (!str && str !== 0) return '';
  return String(str)
    .replace(/[<>]/g, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .trim()
    .slice(0, maxLen);
}

function sanitizeCredential(str, maxLen = 128) {
  if (!str) return '';
  return String(str).replace(/[\x00-\x1F\x7F]/g, '').trim().slice(0, maxLen);
}

function normalizeIdentityString(value) {
  if (!value) return '';
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

async function findAdherentDuplicateInDb(db, nom, prenom, dateNaissance, excludeId = null) {
  if (!nom || !prenom || !dateNaissance) return null;
  const targetDate = String(dateNaissance).trim();
  const res = await db.prepare(
    'SELECT id, code, nom, prenom, dateNaissance FROM adherents WHERE dateNaissance = ?'
  ).bind(targetDate).all();
  const rows = res.results || [];
  const targetNom = normalizeIdentityString(nom);
  const targetPrenom = normalizeIdentityString(prenom);

  return rows.find(r => {
    if (excludeId && r.id === excludeId) return false;
    return normalizeIdentityString(r.nom) === targetNom && normalizeIdentityString(r.prenom) === targetPrenom;
  }) || null;
}


// ── Limitation distribuée des tentatives de connexion (D1) ──
const RATE_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_DELAYS = {
  THIRD_FAILURE_MS: 30 * 1000,
  FIFTH_FAILURE_MS: 5 * 60 * 1000,
  EIGHTH_FAILURE_MS: 15 * 60 * 1000,
};

function getClientIp(c) {
  return c.req.header('cf-connecting-ip') || 'unknown';
}

async function loginRateLimitKey(env, dimension, value) {
  const secret = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(requireJwtSecret(env)),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const digest = new Uint8Array(await crypto.subtle.sign(
    'HMAC',
    secret,
    new TextEncoder().encode(`cmbclub-login:${dimension}:${String(value).trim().toLowerCase()}`),
  ));
  return Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('');
}

async function checkRateLimit(db, keys) {
  const now = Date.now();
  for (const key of keys) {
    const state = await db.prepare(
      'SELECT blockedUntil, updatedAt FROM auth_login_attempts WHERE rateKey = ?'
    ).bind(key).first();
    if (state?.blockedUntil > now && state.updatedAt > now - RATE_WINDOW_MS) {
      return { allowed: false, retryAfter: Math.ceil((state.blockedUntil - now) / 1000) };
    }
  }
  return { allowed: true };
}

async function recordFailedAttempts(db, keys) {
  const now = Date.now();
  const windowStartedBefore = now - RATE_WINDOW_MS;
  const nextFailures = `CASE WHEN auth_login_attempts.windowStartedAt <= ? THEN 1 ELSE auth_login_attempts.failures + 1 END`;
  for (const key of keys) {
    await db.prepare(
      `INSERT INTO auth_login_attempts (rateKey, failures, windowStartedAt, blockedUntil, updatedAt)
       VALUES (?, 1, ?, NULL, ?)
       ON CONFLICT(rateKey) DO UPDATE SET
         failures = ${nextFailures},
         windowStartedAt = CASE
           WHEN auth_login_attempts.windowStartedAt <= ? THEN excluded.windowStartedAt
           ELSE auth_login_attempts.windowStartedAt
         END,
         blockedUntil = CASE
           WHEN ${nextFailures} >= 8 THEN ?
           WHEN ${nextFailures} >= 5 THEN ?
           WHEN ${nextFailures} >= 3 THEN ?
           ELSE NULL
         END,
         updatedAt = excluded.updatedAt`
    ).bind(
      key, now, now,
      windowStartedBefore,
      windowStartedBefore,
      windowStartedBefore, now + RATE_LIMIT_DELAYS.EIGHTH_FAILURE_MS,
      windowStartedBefore, now + RATE_LIMIT_DELAYS.FIFTH_FAILURE_MS,
      windowStartedBefore, now + RATE_LIMIT_DELAYS.THIRD_FAILURE_MS,
    ).run();
  }
}

async function resetRateLimit(db, keys) {
  for (const key of keys) {
    await db.prepare('DELETE FROM auth_login_attempts WHERE rateKey = ?').bind(key).run();
  }
}

// Helper pour formater les réponses JSON
const ok = (c, data) => c.json({ success: true, data });
const err = (c, message, status = 400) => c.json({ success: false, error: message }, status);

const OPEN_SEASON_REQUIRED_MESSAGE = 'Aucune saison ouverte. Créez ou rouvrez une saison avant de continuer.';

async function requireOpenActiveSeason(c, saisonId) {
  let activeSaison = await c.env.DB.prepare(
    "SELECT id FROM saisons WHERE actif = 1 AND COALESCE(statut, 'ouvert') = 'ouvert' LIMIT 1"
  ).first();

  // Répare les anciennes données où une unique saison a été rouverte sans
  // redevenir la saison courante. Ne jamais choisir automatiquement lorsqu'il
  // y a plusieurs saisons ouvertes : ce choix reste du ressort de l'admin.
  if (!activeSaison) {
    const { results: openSaisons } = await c.env.DB.prepare(
      "SELECT id FROM saisons WHERE COALESCE(statut, 'ouvert') = 'ouvert' ORDER BY annee DESC, createdAt DESC LIMIT 2"
    ).all();

    if (openSaisons?.length === 1) {
      activeSaison = openSaisons[0];
      await c.env.DB.batch([
        c.env.DB.prepare('UPDATE saisons SET actif = 0'),
        c.env.DB.prepare('UPDATE saisons SET actif = 1 WHERE id = ?').bind(activeSaison.id),
      ]);
    }
  }

  if (!activeSaison) {
    return { error: err(c, OPEN_SEASON_REQUIRED_MESSAGE, 409) };
  }

  if (saisonId && saisonId !== activeSaison.id) {
    const targetSaison = await c.env.DB.prepare(
      "SELECT id FROM saisons WHERE id = ? AND COALESCE(statut, 'ouvert') = 'ouvert' LIMIT 1"
    ).bind(saisonId).first();

    if (targetSaison) {
      await c.env.DB.batch([
        c.env.DB.prepare('UPDATE saisons SET actif = 0'),
        c.env.DB.prepare('UPDATE saisons SET actif = 1 WHERE id = ?').bind(targetSaison.id),
      ]);
      return { saison: targetSaison };
    }

    return { error: err(c, 'La saison concernée n’est pas la saison ouverte active.', 409) };
  }

  return { saison: activeSaison };
}

// ── Health Check ──
app.get('/api/health', async (c) => {
  try {
    const res = await c.env.DB.prepare('SELECT 1 as ping').first();
    return ok(c, { status: 'healthy', d1: res?.ping === 1, timestamp: new Date().toISOString() });
  } catch (e) {
    return err(c, `D1 Error: ${e.message}`, 500);
  }
});

// ── Vérification compatible avec les mots de passe déjà enregistrés ──
const LEGACY_SALT_PREFIX = 'cmb_slt_v1:';
const PASSWORD_HASH_PREFIX = 'cmb_pbkdf2_v2:';
const PASSWORD_HASH_ITERATIONS = 600000;
const LEGACY_USERNAME_PREFIX = 'cmb_enc_u1:';
const USERNAME_ENCRYPTION_PREFIX = 'cmb_srv_usr_aesgcm_v1:';
let usernameEncryptionKeyPromise;

function needsPasswordHashUpgrade(storedHash) {
  if (!String(storedHash || '').startsWith(PASSWORD_HASH_PREFIX)) return true;
  const iterations = Number(String(storedHash).slice(PASSWORD_HASH_PREFIX.length).split(':')[0]);
  return !Number.isInteger(iterations) || iterations < PASSWORD_HASH_ITERATIONS;
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

async function getUsernameEncryptionKey(env) {
  const secret = String(env.USERNAME_ENCRYPTION_KEY || '');
  if (secret.length < 32) {
    throw new Error('USERNAME_ENCRYPTION_KEY doit être configurée avec au moins 32 caractères aléatoires.');
  }
  if (!usernameEncryptionKeyPromise) {
    usernameEncryptionKeyPromise = (async () => {
      const keyBytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
      return crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
    })().catch(error => {
      usernameEncryptionKeyPromise = null;
      throw error;
    });
  }
  return usernameEncryptionKeyPromise;
}

async function encryptUsername(username, env) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    await getUsernameEncryptionKey(env),
    new TextEncoder().encode(String(username).trim()),
  );
  return `${USERNAME_ENCRYPTION_PREFIX}${bytesToHex(iv)}:${bytesToHex(new Uint8Array(ciphertext))}`;
}

async function decryptUsername(cipherUsername, env) {
  if (!cipherUsername) return '';
  const str = String(cipherUsername).trim();
  if (str.startsWith(USERNAME_ENCRYPTION_PREFIX)) {
    const [ivHex, ciphertextHex] = str.slice(USERNAME_ENCRYPTION_PREFIX.length).split(':');
    if (
      !/^[0-9a-f]{24}$/i.test(ivHex || '') ||
      !/^(?:[0-9a-f]{2}){16,}$/i.test(ciphertextHex || '')
    ) {
      throw new Error('Le nom d’utilisateur chiffré est invalide.');
    }
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: hexToBytes(ivHex) },
      await getUsernameEncryptionKey(env),
      hexToBytes(ciphertextHex),
    );
    return new TextDecoder().decode(plaintext);
  }
  if (!str.startsWith(LEGACY_USERNAME_PREFIX)) return str;

  const cipherKey = String(env.USERNAME_CIPHER_KEY || '');
  if (!cipherKey) throw new Error('USERNAME_CIPHER_KEY est requise pour migrer les anciens identifiants.');
  const hex = str.slice(LEGACY_USERNAME_PREFIX.length);
  if (!/^(?:[0-9a-f]{2})+$/i.test(hex)) throw new Error('Le nom d’utilisateur hérité est invalide.');
  let utf8 = '';
  for (let i = 0; i < hex.length; i += 2) {
    const enc = parseInt(hex.slice(i, i + 2), 16);
    const keyChar = cipherKey.charCodeAt((i / 2) % cipherKey.length);
    utf8 += String.fromCharCode(enc ^ keyChar);
  }
  try {
    return decodeURIComponent(escape(utf8));
  } catch {
    return utf8;
  }
}

function needsUsernameEncryptionUpgrade(storedUsername) {
  return Boolean(storedUsername) && !String(storedUsername).startsWith(USERNAME_ENCRYPTION_PREFIX);
}

async function matchesUsername(inputUsername, storedUsername, env) {
  if (!inputUsername || !storedUsername) return false;
  const cleanInput = String(inputUsername).trim().toLowerCase();
  if (cleanInput === String(storedUsername).trim().toLowerCase()) return true;
  const decrypted = (await decryptUsername(storedUsername, env)).toLowerCase();
  if (cleanInput === decrypted) return true;
  return false;
}

async function sha256(text) {
  const msgBuffer = new TextEncoder().encode(String(text || ''));
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function derivePasswordHash(password, salt, iterations) {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    keyMaterial,
    256,
  );
  return new Uint8Array(bits);
}

async function hashPassword(plainPassword) {
  if (!plainPassword) return '';
  const clean = String(plainPassword).trim();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const digest = await derivePasswordHash(clean, salt, PASSWORD_HASH_ITERATIONS);
  return `${PASSWORD_HASH_PREFIX}${PASSWORD_HASH_ITERATIONS}:${bytesToHex(salt)}:${bytesToHex(digest)}`;
}

async function verifyPassword(inputPassword, storedHash) {
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
    const actualHash = bytesToHex(await derivePasswordHash(cleanInput, hexToBytes(saltHex), iterations));
    let difference = 0;
    for (let i = 0; i < expectedHash.length; i++) {
      difference |= expectedHash.charCodeAt(i) ^ actualHash.charCodeAt(i);
    }
    return difference === 0;
  }

  if (cleanStored.startsWith(LEGACY_SALT_PREFIX)) {
    const legacyHash = await sha256(`cmb_${cleanInput}_club_secure`);
    if (cleanStored === `${LEGACY_SALT_PREFIX}${legacyHash}`) return true;
  }

  const directHash = await sha256(cleanInput);
  if (cleanStored === directHash) return true;

  return cleanStored === cleanInput;
}

const JWT_ISSUER = 'cmbclub-api';
const JWT_AUDIENCE = 'cmbclub-mobile';
const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const REFRESH_TOKEN_TTL_DAYS = 30;

function base64UrlEncode(value) {
  const bytes = value instanceof Uint8Array ? value : new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function requireJwtSecret(env) {
  const secret = String(env.JWT_SECRET || '');
  if (secret.length < 32) throw new Error('JWT_SECRET doit être configuré comme secret Cloudflare (32 caractères minimum).');
  return secret;
}

async function jwtKey(env) {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(requireJwtSecret(env)),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

async function signAccessToken(env, user) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64UrlEncode(JSON.stringify({
    iss: JWT_ISSUER,
    aud: JWT_AUDIENCE,
    sub: user.id,
    role: user.role,
    adherentId: user.adherentId || null,
    iat: now,
    exp: now + ACCESS_TOKEN_TTL_SECONDS,
    jti: crypto.randomUUID(),
  }));
  const content = `${header}.${payload}`;
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', await jwtKey(env), new TextEncoder().encode(content)));
  return `${content}.${base64UrlEncode(signature)}`;
}

async function verifyAccessToken(env, token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return null;
  try {
    const header = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[0])));
    if (header.alg !== 'HS256' || header.typ !== 'JWT') return null;
    const validSignature = await crypto.subtle.verify(
      'HMAC',
      await jwtKey(env),
      base64UrlDecode(parts[2]),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
    );
    if (!validSignature) return null;
    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[1])));
    const now = Math.floor(Date.now() / 1000);
    if (
      payload.iss !== JWT_ISSUER ||
      payload.aud !== JWT_AUDIENCE ||
      !payload.sub ||
      typeof payload.jti !== 'string' ||
      !payload.jti ||
      !['admin', 'adherent'].includes(payload.role) ||
      !Number.isInteger(payload.exp) ||
      payload.exp <= now ||
      !Number.isInteger(payload.iat) ||
      payload.iat > now + 60
    ) return null;
    return payload;
  } catch {
    return null;
  }
}

function refreshExpiry() {
  return new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

function newRefreshToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(48));
  return base64UrlEncode(bytes);
}

async function issueRefreshToken(db, userId) {
  const token = newRefreshToken();
  const id = crypto.randomUUID();
  await db.prepare(
    'INSERT INTO refresh_tokens (id, userId, tokenHash, expiresAt, createdAt) VALUES (?, ?, ?, ?, ?)'
  ).bind(id, userId, await sha256(token), refreshExpiry(), new Date().toISOString()).run();
  return { id, token };
}

async function safeUser(user, env) {
  return {
    id: user.id,
    username: await decryptUsername(user.username, env),
    role: user.role,
    adherentId: user.adherentId || null,
  };
}

async function authenticateRequest(c) {
  const authorization = c.req.header('Authorization') || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const claims = await verifyAccessToken(c.env, match[1]);
  if (!claims) return null;
  const revoked = await c.env.DB.prepare(
    'SELECT jti FROM revoked_access_tokens WHERE jti = ? AND expiresAt > ?'
  ).bind(claims.jti, Date.now()).first();
  if (revoked) return null;
  const user = await c.env.DB.prepare(
    'SELECT id, role, adherentId FROM users WHERE id = ?'
  ).bind(claims.sub).first();
  if (
    !user ||
    !['admin', 'adherent'].includes(user.role) ||
    user.role !== claims.role ||
    (user.role === 'adherent' && (user.adherentId || null) !== (claims.adherentId || null))
  ) return null;
  return { ...claims, id: user.id, role: user.role, adherentId: user.adherentId || null };
}

const PUBLIC_API_PATHS = new Set([
  '/api/health',
  '/api/auth/login',
  '/api/auth/refresh',
  '/api/auth/logout',
]);

app.use('/api/*', async (c, next) => {
  if (PUBLIC_API_PATHS.has(c.req.path)) return next();
  try {
    const authUser = await authenticateRequest(c);
    if (!authUser) return err(c, 'Jeton d’accès invalide ou expiré.', 401);
    c.set('authUser', authUser);
    if (!isAuthorizedForRoute(c, authUser)) {
      return err(c, 'Accès interdit.', 403);
    }
    return next();
  } catch {
    return err(c, 'Service d’authentification indisponible.', 503);
  }
});

function decodePathSegment(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return '';
  }
}

function isAuthorizedForRoute(c, user) {
  if (user.role === 'admin') return true;
  if (user.role !== 'adherent' || c.req.method !== 'GET' || !user.adherentId) return false;

  const path = c.req.path;
  if (
    path === '/api/saisons' ||
    path === '/api/saisons/active' ||
    path === '/api/disciplines' ||
    path === '/api/creneaux'
  ) return true;

  const ownProfile = path.match(/^\/api\/adherents\/([^/]+)$/);
  if (ownProfile) return decodePathSegment(ownProfile[1]) === user.adherentId;

  const ownPresences = path.match(/^\/api\/presences\/adherent\/([^/]+)$/);
  if (ownPresences) return decodePathSegment(ownPresences[1]) === user.adherentId;

  if (path === '/api/paiements') {
    const requestedAdherentId = c.req.query('adherentId');
    return !requestedAdherentId || requestedAdherentId === user.adherentId;
  }
  return false;
}

// ── Auth & Users ──
app.post('/api/auth/login', async (c) => {
  try {
    const ipKey = await loginRateLimitKey(c.env, 'ip', getClientIp(c));
    const ipCheck = await checkRateLimit(c.env.DB, [ipKey]);
    if (!ipCheck.allowed) {
      c.res.headers.set('Retry-After', String(ipCheck.retryAfter));
      return err(c, 'Identifiant ou mot de passe incorrect', 429);
    }
    await c.env.DB.prepare('DELETE FROM auth_login_attempts WHERE updatedAt <= ?')
      .bind(Date.now() - RATE_WINDOW_MS).run();

    const body = await c.req.json();
    const rawUser = sanitizeCredential(body.username, 64);
    const rawPass = sanitizeCredential(body.password, 128);
    const accountKey = await loginRateLimitKey(c.env, 'account', rawUser || 'invalid');
    const rateKeys = [ipKey, accountKey];
    const rateCheck = await checkRateLimit(c.env.DB, rateKeys);
    if (!rateCheck.allowed) {
      c.res.headers.set('Retry-After', String(rateCheck.retryAfter));
      return err(c, 'Identifiant ou mot de passe incorrect', 429);
    }

    if (!rawUser || !rawPass) return err(c, 'Identifiant et mot de passe requis');
    if (rawUser.length < 2 || rawPass.length < 4) {
      await recordFailedAttempts(c.env.DB, rateKeys);
      return err(c, 'Identifiant ou mot de passe incorrect', 401);
    }

    const { results: users } = await c.env.DB.prepare(
      'SELECT id, username, password, role, adherentId FROM users'
    ).all();
    let user = null;
    for (const candidate of users || []) {
      if (await matchesUsername(rawUser, candidate.username, c.env)) {
        user = candidate;
        break;
      }
    }

    if (
      user &&
      ['admin', 'adherent'].includes(user.role) &&
      (user.role !== 'adherent' || user.adherentId) &&
      await verifyPassword(rawPass, user.password)
    ) {
      if (needsPasswordHashUpgrade(user.password)) {
        await c.env.DB.prepare('UPDATE users SET password = ? WHERE id = ? AND password = ?')
          .bind(await hashPassword(rawPass), user.id, user.password).run();
      }
        if (needsUsernameEncryptionUpgrade(user.username)) {
          await c.env.DB.prepare('UPDATE users SET username = ? WHERE id = ? AND username = ?')
            .bind(await encryptUsername(await decryptUsername(user.username, c.env), c.env), user.id, user.username).run();
        }
        await resetRateLimit(c.env.DB, rateKeys);
      const accessToken = await signAccessToken(c.env, user);
      const refresh = await issueRefreshToken(c.env.DB, user.id);
      return ok(c, {
        user: await safeUser(user, c.env),
        accessToken,
        refreshToken: refresh.token,
        expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      });
    }

    await recordFailedAttempts(c.env.DB, rateKeys);
    const newCheck = await checkRateLimit(c.env.DB, rateKeys);
    if (!newCheck.allowed) {
      c.res.headers.set('Retry-After', String(newCheck.retryAfter));
      return err(c, 'Identifiant ou mot de passe incorrect', 429);
    }
    return err(c, 'Identifiant ou mot de passe incorrect', 401);
  } catch (e) {
    return err(c, e.message, 500);
  }
});

app.post('/api/auth/refresh', async (c) => {
  try {
    const { refreshToken } = await c.req.json().catch(() => ({}));
    const cleanToken = sanitizeCredential(refreshToken, 512);
    if (!cleanToken) return err(c, 'Refresh token invalide.', 401);

    const tokenHash = await sha256(cleanToken);
    const current = await c.env.DB.prepare(
      'SELECT id, userId, expiresAt, revokedAt FROM refresh_tokens WHERE tokenHash = ?'
    ).bind(tokenHash).first();
    if (!current || current.revokedAt || current.expiresAt <= new Date().toISOString()) {
      return err(c, 'Refresh token invalide ou expiré.', 401);
    }

    // Une révocation conditionnelle garantit qu’un token n’est utilisable qu’une fois.
    const revokedAt = new Date().toISOString();
    const revokeResult = await c.env.DB.prepare(
      'UPDATE refresh_tokens SET revokedAt = ? WHERE id = ? AND revokedAt IS NULL AND expiresAt > ?'
    ).bind(revokedAt, current.id, revokedAt).run();
    if (!revokeResult.meta?.changes) return err(c, 'Refresh token déjà utilisé.', 401);

    const user = await c.env.DB.prepare(
      'SELECT id, username, role, adherentId FROM users WHERE id = ?'
    ).bind(current.userId).first();
    if (!user || !['admin', 'adherent'].includes(user.role) || (user.role === 'adherent' && !user.adherentId)) {
      return err(c, 'Refresh token invalide ou expiré.', 401);
    }

    const refresh = await issueRefreshToken(c.env.DB, user.id);
    await c.env.DB.prepare(
      'UPDATE refresh_tokens SET replacedByTokenId = ? WHERE id = ?'
    ).bind(refresh.id, current.id).run();

    return ok(c, {
      user: await safeUser(user, c.env),
      accessToken: await signAccessToken(c.env, user),
      refreshToken: refresh.token,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    });
  } catch (e) {
    return err(c, e.message, 500);
  }
});

app.post('/api/auth/logout', async (c) => {
  try {
    const { refreshToken } = await c.req.json().catch(() => ({}));
    const cleanToken = sanitizeCredential(refreshToken, 512);
    if (cleanToken) {
      await c.env.DB.prepare(
        'UPDATE refresh_tokens SET revokedAt = COALESCE(revokedAt, ?) WHERE tokenHash = ?'
      ).bind(new Date().toISOString(), await sha256(cleanToken)).run();
    }
    const authorization = c.req.header('Authorization') || '';
    const accessMatch = authorization.match(/^Bearer\s+(.+)$/i);
    if (accessMatch) {
      const claims = await verifyAccessToken(c.env, accessMatch[1]);
      if (claims) {
        await c.env.DB.prepare(
          'INSERT OR IGNORE INTO revoked_access_tokens (jti, expiresAt, createdAt) VALUES (?, ?, ?)'
        ).bind(claims.jti, claims.exp * 1000, Date.now()).run();
      }
    }
    await c.env.DB.prepare('DELETE FROM revoked_access_tokens WHERE expiresAt <= ?').bind(Date.now()).run();
    return ok(c, { loggedOut: true });
  } catch (e) {
    return err(c, e.message, 500);
  }
});

app.get('/api/auth/admin', async (c) => {
  try {
    const admin = await c.env.DB.prepare(
      "SELECT id, username, role FROM users WHERE role = 'admin' LIMIT 1"
    ).first();
    if (!admin) return ok(c, null);
    return ok(c, await safeUser(admin, c.env));
  } catch (e) {
    return err(c, e.message, 500);
  }
});

app.put('/api/auth/admin-credentials', async (c) => {
  return err(c, 'La modification des identifiants n’est pas gérée par cette API.', 405);
});

// ── Config ──
app.get('/api/config', async (c) => {
  try {
    const { results } = await c.env.DB.prepare('SELECT key, value FROM config').all();
    const cfg = {};
    for (const r of results || []) {
      const num = parseFloat(r.value);
      cfg[r.key] = !isNaN(num) && String(num) === r.value ? num : r.value;
    }
    return ok(c, cfg);
  } catch (e) {
    return err(c, e.message, 500);
  }
});

app.put('/api/config', async (c) => {
  try {
    const { key, value } = await c.req.json();
    if (!key) return err(c, 'Clé de config requise');
    await c.env.DB.prepare(
      `INSERT INTO config (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    ).bind(key, String(value)).run();
    return ok(c, { key, value });
  } catch (e) {
    return err(c, e.message, 500);
  }
});

// ── Saisons ──
app.get('/api/saisons', async (c) => {
  try {
    const { results } = await c.env.DB.prepare('SELECT * FROM saisons ORDER BY annee DESC').all();
    return ok(c, results || []);
  } catch (e) {
    return err(c, e.message, 500);
  }
});

app.get('/api/saisons/active', async (c) => {
  try {
    let active = await c.env.DB.prepare(
      "SELECT * FROM saisons WHERE actif = 1 AND COALESCE(statut, 'ouvert') = 'ouvert' LIMIT 1"
    ).first();

    if (!active) {
      const { results: openSaisons } = await c.env.DB.prepare(
        "SELECT id FROM saisons WHERE COALESCE(statut, 'ouvert') = 'ouvert' ORDER BY annee DESC, createdAt DESC LIMIT 2"
      ).all();

      if (openSaisons?.length === 1) {
        const fallback = openSaisons[0];
        await c.env.DB.batch([
          c.env.DB.prepare('UPDATE saisons SET actif = 0'),
          c.env.DB.prepare('UPDATE saisons SET actif = 1 WHERE id = ?').bind(fallback.id),
        ]);
        active = await c.env.DB.prepare('SELECT * FROM saisons WHERE id = ?').bind(fallback.id).first();
      }
    }

    return ok(c, active || null);
  } catch (e) {
    return err(c, e.message, 500);
  }
});

app.post('/api/saisons', async (c) => {
  try {
    const s = await c.req.json();
    const dateFin = s.dateFin || `${s.annee}-12-31`;
    await c.env.DB.prepare(
      `INSERT INTO saisons (id, label, annee, dateDebut, dateFin, actif, statut, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(s.id, s.label, s.annee, s.dateDebut, dateFin, s.actif ? 1 : 0, 'ouvert', s.createdAt || new Date().toISOString()).run();

    if (s.actif) {
      await c.env.DB.prepare('UPDATE saisons SET actif = 0 WHERE id != ?').bind(s.id).run();
    }
    return ok(c, { ...s, dateFin, statut: 'ouvert' });
  } catch (e) {
    return err(c, e.message, 500);
  }
});

app.put('/api/saisons/:id/activate', async (c) => {
  try {
    const id = c.req.param('id');
    const saison = await c.env.DB.prepare('SELECT *, COALESCE(statut, \'ouvert\') AS statut FROM saisons WHERE id = ?').bind(id).first();
    if (!saison) return err(c, 'Saison non trouvée', 404);
    if (saison.statut !== 'ouvert') return err(c, 'Impossible d’activer une saison fermée.', 409);
    await c.env.DB.batch([
      c.env.DB.prepare('UPDATE saisons SET actif = 0'),
      c.env.DB.prepare('UPDATE saisons SET actif = 1 WHERE id = ?').bind(id),
    ]);
    return ok(c, { id, actif: 1 });
  } catch (e) {
    return err(c, e.message, 500);
  }
});

app.put('/api/saisons/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const { dateDebut, dateFin } = await c.req.json();

    if (!dateDebut || !dateFin) {
      return err(c, 'dateDebut et dateFin sont requis', 400);
    }

    // Valider que dateDebut < dateFin
    if (new Date(dateDebut) >= new Date(dateFin)) {
      return err(c, 'La date de début doit être avant la date de fin', 400);
    }

    await c.env.DB.prepare(
      'UPDATE saisons SET dateDebut = ?, dateFin = ? WHERE id = ?'
    ).bind(dateDebut, dateFin, id).run();

    const updated = await c.env.DB.prepare('SELECT * FROM saisons WHERE id = ?').bind(id).first();
    return ok(c, updated);
  } catch (e) {
    return err(c, e.message, 500);
  }
});

app.delete('/api/saisons/:id', async (c) => {
  try {
    const id = c.req.param('id');

    // Vérifier que la saison n'est pas active
    const saison = await c.env.DB.prepare('SELECT * FROM saisons WHERE id = ?').bind(id).first();
    if (!saison) {
      return err(c, 'Saison non trouvée', 404);
    }

    if (saison.actif) {
      return err(c, 'Impossible de supprimer une saison active', 400);
    }

    // Supprimer en cascade les données associées à la saison
    await c.env.DB.batch([
      c.env.DB.prepare('DELETE FROM presences WHERE saisonId = ?').bind(id),
      c.env.DB.prepare('DELETE FROM paiements WHERE saisonId = ?').bind(id),
      c.env.DB.prepare('DELETE FROM adherent_saisons WHERE saisonId = ?').bind(id),
      c.env.DB.prepare('DELETE FROM saisons WHERE id = ?').bind(id),
    ]);

    return ok(c, { success: true, id });
  } catch (e) {
    return err(c, e.message, 500);
  }
});

app.put('/api/saisons/:id/close', async (c) => {
  try {
    const id = c.req.param('id');
    const { username, password } = await c.req.json().catch(() => ({}));
    const saison = await c.env.DB.prepare('SELECT * FROM saisons WHERE id = ?').bind(id).first();
    
    if (!saison) {
      return err(c, 'Saison non trouvée', 404);
    }

    const newStatut = saison.statut === 'ouvert' ? 'fermé' : 'ouvert';

    const cleanUsername = sanitizeCredential(username, 64);
    const cleanPassword = sanitizeCredential(password, 128);
    const admin = await c.env.DB.prepare(
      "SELECT id, username, password FROM users WHERE role = 'admin' LIMIT 1"
    ).first();
    const authorized = Boolean(
      admin &&
      cleanUsername &&
      cleanPassword &&
      await matchesUsername(cleanUsername, admin.username, c.env) &&
      await verifyPassword(cleanPassword, admin.password)
    );

    if (!authorized) {
      return err(c, 'Identifiants administrateur invalides.', 401);
    }
    if (needsPasswordHashUpgrade(admin.password)) {
      await c.env.DB.prepare('UPDATE users SET password = ? WHERE id = ? AND password = ?')
        .bind(await hashPassword(cleanPassword), admin.id, admin.password).run();
    }
    if (needsUsernameEncryptionUpgrade(admin.username)) {
      await c.env.DB.prepare('UPDATE users SET username = ? WHERE id = ? AND username = ?')
        .bind(await encryptUsername(await decryptUsername(admin.username, c.env), c.env), admin.id, admin.username).run();
    }

    // La colonne dateFin des anciennes bases D1 est NOT NULL. Une chaîne vide
    // représente donc une saison rouverte sans date de clôture.
    const dateClose = newStatut === 'fermé' ? new Date().toISOString() : '';
    const hasOpenActiveSeason = await c.env.DB.prepare(
      "SELECT id FROM saisons WHERE actif = 1 AND COALESCE(statut, 'ouvert') = 'ouvert' LIMIT 1"
    ).first();
    const shouldActivateReopenedSeason = newStatut === 'ouvert' && !hasOpenActiveSeason;

    const statements = [
      c.env.DB.prepare('UPDATE saisons SET statut = ?, dateFin = ? WHERE id = ?').bind(newStatut, dateClose, id),
    ];
    if (shouldActivateReopenedSeason) {
      statements.push(
        c.env.DB.prepare('UPDATE saisons SET actif = 0'),
        c.env.DB.prepare('UPDATE saisons SET actif = 1 WHERE id = ?').bind(id),
      );
    }
    await c.env.DB.batch(statements);

    const updated = await c.env.DB.prepare('SELECT * FROM saisons WHERE id = ?').bind(id).first();
    return ok(c, updated);
  } catch (e) {
    return err(c, e.message, 500);
  }
});

// ── Adhérents ──
app.get('/api/adherents', async (c) => {
  try {
    const saisonId = c.req.query('saisonId');
    let query = `
      SELECT a.*,
             COALESCE(s.assure, a.assure) AS assure,
             CASE WHEN s.id IS NOT NULL THEN 1 ELSE 0 END AS isEnrolled,
             s.saisonId,
             s.dateInscription AS dateInscriptionSaison
      FROM adherents a
    `;
    let bindings = [];

    if (saisonId) {
      query += ` LEFT JOIN adherent_saisons s ON a.id = s.adherentId AND s.saisonId = ? AND s.actif = 1 `;
      bindings.push(saisonId);
    } else {
      query += ` LEFT JOIN adherent_saisons s ON a.id = s.adherentId AND s.actif = 1 `;
    }

    query += ` ORDER BY a.nom ASC, a.prenom ASC `;
    const stmt = c.env.DB.prepare(query);
    const { results } = bindings.length > 0 ? await stmt.bind(...bindings).all() : await stmt.all();
    return ok(c, results || []);
  } catch (e) {
    return err(c, e.message, 500);
  }
});

app.get('/api/adherents/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const adherent = await c.env.DB.prepare('SELECT * FROM adherents WHERE id = ?').bind(id).first();
    if (!adherent) return err(c, 'Adhérent non trouvé', 404);
    if (c.get('authUser').role === 'adherent') {
      const {
        id: adherentId,
        code,
        nom,
        prenom,
        dateNaissance,
        lieuNaissance,
        telephone,
        groupeSanguin,
        photo,
        discipline,
        genre,
        categorieOverride,
        assure,
      } = adherent;
      return ok(c, {
        id: adherentId,
        code,
        nom,
        prenom,
        dateNaissance,
        lieuNaissance,
        telephone,
        groupeSanguin,
        photo,
        discipline,
        genre,
        categorieOverride,
        assure,
      });
    }
    return ok(c, adherent);
  } catch (e) {
    return err(c, e.message, 500);
  }
});

app.post('/api/adherents', async (c) => {
  try {
    const seasonCheck = await requireOpenActiveSeason(c);
    if (seasonCheck.error) return seasonCheck.error;
    const activeSaison = seasonCheck.saison;

    const raw = await c.req.json();
    const now = new Date().toISOString();
    // Sanitisation anti-XSS de tous les champs texte
    const a = {
      ...raw,
      nom: sanitizeStr(raw.nom, 100),
      prenom: sanitizeStr(raw.prenom, 100),
      lieuNaissance: sanitizeStr(raw.lieuNaissance, 150),
      telephone: sanitizeStr(raw.telephone, 20),
      groupeSanguin: sanitizeStr(raw.groupeSanguin, 10),
      observationsMedicales: sanitizeStr(raw.observationsMedicales, 1000),
      discipline: sanitizeStr(raw.discipline, 100),
    };
    if (!a.nom || !a.prenom) return err(c, 'Le nom et le prénom sont obligatoires.');
    if (!a.dateNaissance) return err(c, 'La date de naissance est obligatoire.');

    const duplicatePost = await findAdherentDuplicateInDb(c.env.DB, a.nom, a.prenom, a.dateNaissance, a.id);
    if (duplicatePost) {
      return err(c, `Un adhérent avec le même nom, prénom et date de naissance existe déjà (${duplicatePost.nom} ${duplicatePost.prenom} - Code : ${duplicatePost.code || 'N/A'}).`, 409);
    }

    const linkId = `${a.id}-${activeSaison.id}`;
    await c.env.DB.batch([
      c.env.DB.prepare(
        `INSERT INTO adherents (
          id, code, nom, prenom, dateNaissance, lieuNaissance,
          telephone, taille, groupeSanguin, observationsMedicales,
          photo, discipline, genre, dateInscription, assure, categorieOverride,
          createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        a.id, a.code, a.nom, a.prenom, a.dateNaissance, a.lieuNaissance,
        a.telephone || '', a.taille || '', a.groupeSanguin || '', a.observationsMedicales || '',
        a.photo || null, a.discipline || '', a.genre || 'M', a.dateInscription || now,
        a.assure ? 1 : 0, a.categorieOverride || null,
        a.createdAt || now, a.updatedAt || now
      ),
      c.env.DB.prepare(
        `INSERT INTO adherent_saisons (id, adherentId, saisonId, dateInscription, assure, actif)
         VALUES (?, ?, ?, ?, ?, 1)
         ON CONFLICT(id) DO UPDATE SET
           dateInscription = excluded.dateInscription,
           assure = excluded.assure,
           actif = 1`
      ).bind(linkId, a.id, activeSaison.id, a.dateInscription || now, a.assure ? 1 : 0),
    ]);
    return ok(c, { ...a, isEnrolled: 1, saisonId: activeSaison.id });
  } catch (e) {
    return err(c, e.message, 500);
  }
});

app.put('/api/adherents/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const raw = await c.req.json();
    const now = new Date().toISOString();
    // Sanitisation anti-XSS de tous les champs texte
    const a = {
      ...raw,
      nom: sanitizeStr(raw.nom, 100),
      prenom: sanitizeStr(raw.prenom, 100),
      lieuNaissance: sanitizeStr(raw.lieuNaissance, 150),
      telephone: sanitizeStr(raw.telephone, 20),
      groupeSanguin: sanitizeStr(raw.groupeSanguin, 10),
      observationsMedicales: sanitizeStr(raw.observationsMedicales, 1000),
      discipline: sanitizeStr(raw.discipline, 100),
    };
    if (!a.nom || !a.prenom) return err(c, 'Le nom et le prénom sont obligatoires.');
    if (!a.dateNaissance) return err(c, 'La date de naissance est obligatoire.');

    const duplicatePut = await findAdherentDuplicateInDb(c.env.DB, a.nom, a.prenom, a.dateNaissance, id);
    if (duplicatePut) {
      return err(c, `Un autre adhérent avec le même nom, prénom et date de naissance existe déjà (${duplicatePut.nom} ${duplicatePut.prenom} - Code : ${duplicatePut.code || 'N/A'}).`, 409);
    }

    await c.env.DB.prepare(
      `UPDATE adherents SET
        nom = ?, prenom = ?, dateNaissance = ?, lieuNaissance = ?,
        telephone = ?, taille = ?, groupeSanguin = ?, observationsMedicales = ?,
        photo = ?, discipline = ?, genre = ?, dateInscription = ?, assure = ?,
        categorieOverride = ?, updatedAt = ?
      WHERE id = ?`
    ).bind(
      a.nom, a.prenom, a.dateNaissance, a.lieuNaissance,
      a.telephone || '', a.taille || '', a.groupeSanguin || '', a.observationsMedicales || '',
      a.photo || null, a.discipline || '', a.genre || 'M', a.dateInscription || '',
      a.assure ? 1 : 0, a.categorieOverride || null, now, id
    ).run();
    return ok(c, { id, ...a, updatedAt: now });
  } catch (e) {
    return err(c, e.message, 500);
  }
});

app.delete('/api/adherents/:id', async (c) => {
  try {
    const id = c.req.param('id');
    await c.env.DB.batch([
      c.env.DB.prepare('DELETE FROM presences WHERE adherentId = ?').bind(id),
      c.env.DB.prepare('DELETE FROM paiements WHERE adherentId = ?').bind(id),
      c.env.DB.prepare('DELETE FROM adherent_saisons WHERE adherentId = ?').bind(id),
      c.env.DB.prepare('DELETE FROM users WHERE adherentId = ?').bind(id),
      c.env.DB.prepare('DELETE FROM adherents WHERE id = ?').bind(id),
    ]);
    return ok(c, { deleted: id });
  } catch (e) {
    return err(c, e.message, 500);
  }
});

app.put('/api/adherents/:id/assure', async (c) => {
  try {
    const id = c.req.param('id');
    const { assure, saisonId } = await c.req.json();
    const val = assure ? 1 : 0;

    const batches = [
      c.env.DB.prepare('UPDATE adherents SET assure = ? WHERE id = ?').bind(val, id)
    ];
    if (saisonId) {
      batches.push(
        c.env.DB.prepare('UPDATE adherent_saisons SET assure = ? WHERE adherentId = ? AND saisonId = ?').bind(val, id, saisonId)
      );
    }
    await c.env.DB.batch(batches);
    return ok(c, { id, assure: val });
  } catch (e) {
    return err(c, e.message, 500);
  }
});

app.post('/api/adherents/:id/enroll', async (c) => {
  try {
    const id = c.req.param('id');
    const { saisonId, dateInscription, assure } = await c.req.json();
    const seasonCheck = await requireOpenActiveSeason(c, saisonId);
    if (seasonCheck.error) return seasonCheck.error;
    const linkId = `${id}-${saisonId}`;
    await c.env.DB.prepare(
      `INSERT INTO adherent_saisons (id, adherentId, saisonId, dateInscription, assure, actif)
       VALUES (?, ?, ?, ?, ?, 1)
       ON CONFLICT(id) DO UPDATE SET
         dateInscription = excluded.dateInscription,
         assure = excluded.assure,
         actif = 1`
    ).bind(linkId, id, saisonId, dateInscription || new Date().toISOString(), assure ? 1 : 0).run();

    return ok(c, { linkId, adherentId: id, saisonId });
  } catch (e) {
    return err(c, e.message, 500);
  }
});

app.get('/api/adherents/:id/enrolled', async (c) => {
  try {
    const id = c.req.param('id');
    const saisonId = c.req.query('saisonId');
    if (!saisonId) return ok(c, { isEnrolled: false });

    const row = await c.env.DB.prepare(
      'SELECT id FROM adherent_saisons WHERE adherentId = ? AND saisonId = ? AND actif = 1 LIMIT 1'
    ).bind(id, saisonId).first();
    if (row) return ok(c, { isEnrolled: true });

    // Auto-réparation si l'adhérent a été inscrit durant l'année de la saison
    const saison = await c.env.DB.prepare('SELECT annee FROM saisons WHERE id = ?').bind(saisonId).first();
    if (saison?.annee) {
      const adh = await c.env.DB.prepare('SELECT dateInscription, assure FROM adherents WHERE id = ?').bind(id).first();
      if (adh?.dateInscription && adh.dateInscription.startsWith(String(saison.annee))) {
        const linkId = `${id}-${saisonId}`;
        await c.env.DB.prepare(
          `INSERT INTO adherent_saisons (id, adherentId, saisonId, dateInscription, assure, actif)
           VALUES (?, ?, ?, ?, ?, 1)
           ON CONFLICT(id) DO UPDATE SET actif = 1`
        ).bind(linkId, id, saisonId, adh.dateInscription, adh.assure || 0).run();
        return ok(c, { isEnrolled: true });
      }
    }

    return ok(c, { isEnrolled: false });
  } catch (e) {
    return err(c, e.message, 500);
  }
});

// ── Paiements ──
app.get('/api/paiements', async (c) => {
  try {
    const adherentId = c.req.query('adherentId');
    const saisonId = c.req.query('saisonId');
    const authUser = c.get('authUser');

    let query = authUser.role === 'admin'
      ? `SELECT p.*, a.nom, a.prenom, a.code, a.discipline, a.dateNaissance
         FROM paiements p JOIN adherents a ON a.id = p.adherentId WHERE 1=1`
      : 'SELECT p.* FROM paiements p WHERE p.adherentId = ?';
    let binds = [];

    if (authUser.role === 'adherent') binds.push(authUser.adherentId);
    if (adherentId && authUser.role === 'admin') {
      query += ' AND p.adherentId = ?';
      binds.push(adherentId);
    }
    if (saisonId) {
      query += ' AND p.saisonId = ?';
      binds.push(saisonId);
    }

    query += ' ORDER BY p.annee ASC, p.mois ASC, p.type ASC';
    const stmt = c.env.DB.prepare(query);
    const { results } = binds.length > 0 ? await stmt.bind(...binds).all() : await stmt.all();
    return ok(c, results || []);
  } catch (e) {
    return err(c, e.message, 500);
  }
});

app.post('/api/paiements', async (c) => {
  try {
    const p = await c.req.json();
    const seasonCheck = await requireOpenActiveSeason(c, p.saisonId);
    if (seasonCheck.error) return seasonCheck.error;
    const now = new Date().toISOString();
    await c.env.DB.prepare(
      `INSERT INTO paiements (
        id, adherentId, saisonId, type, label, mois, annee,
        montantDu, remisePct, remiseMontant, montantPaye,
        datePaiement, statut, notes, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?, ?)`
    ).bind(
      p.id, p.adherentId, p.saisonId, p.type, p.label, p.mois || null, p.annee || null,
      p.montantDu, p.montantPaye || 0,
      p.datePaiement || null, p.statut || 'a_payer', p.notes || '',
      p.createdAt || now, p.updatedAt || now
    ).run();

    return ok(c, p);
  } catch (e) {
    return err(c, e.message, 500);
  }
});

app.put('/api/paiements/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const p = await c.req.json();
    const existing = await c.env.DB.prepare('SELECT saisonId FROM paiements WHERE id = ?').bind(id).first();
    if (!existing) return err(c, 'Paiement non trouvé', 404);
    const seasonCheck = await requireOpenActiveSeason(c, existing.saisonId);
    if (seasonCheck.error) return seasonCheck.error;
    const now = new Date().toISOString();
    await c.env.DB.prepare(
      `UPDATE paiements SET
        montantPaye = ?, datePaiement = ?, statut = ?, notes = ?,
        remisePct = 0, remiseMontant = 0, updatedAt = ?
      WHERE id = ?`
    ).bind(
      p.montantPaye, p.datePaiement || null, p.statut, p.notes || '',
      now, id
    ).run();

    return ok(c, { id, ...p, updatedAt: now });
  } catch (e) {
    return err(c, e.message, 500);
  }
});

// ── Disciplines ──
app.get('/api/disciplines', async (c) => {
  try {
    const { results } = await c.env.DB.prepare('SELECT * FROM disciplines ORDER BY nom ASC').all();
    return ok(c, results || []);
  } catch (e) {
    return err(c, e.message, 500);
  }
});

app.post('/api/disciplines', async (c) => {
  try {
    const d = await c.req.json();
    await c.env.DB.prepare(
      'INSERT INTO disciplines (id, nom, createdAt) VALUES (?, ?, ?)'
    ).bind(d.id, d.nom, d.createdAt || new Date().toISOString()).run();
    return ok(c, d);
  } catch (e) {
    return err(c, e.message, 500);
  }
});

app.delete('/api/disciplines/:id', async (c) => {
  try {
    const id = c.req.param('id');
    await c.env.DB.prepare('DELETE FROM disciplines WHERE id = ?').bind(id).run();
    return ok(c, { deleted: id });
  } catch (e) {
    return err(c, e.message, 500);
  }
});

// ── Créneaux ──
app.get('/api/creneaux', async (c) => {
  try {
    const { results } = await c.env.DB.prepare('SELECT * FROM creneaux ORDER BY jour ASC, heureDebut ASC').all();
    return ok(c, results || []);
  } catch (e) {
    return err(c, e.message, 500);
  }
});

app.post('/api/creneaux', async (c) => {
  try {
    const seasonCheck = await requireOpenActiveSeason(c);
    if (seasonCheck.error) return seasonCheck.error;
    const cr = await c.req.json();
    await c.env.DB.prepare(
      `INSERT INTO creneaux (id, discipline, categorie, jour, heureDebut, heureFin, lieu, remarque, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(cr.id, cr.discipline, cr.categorie, cr.jour, cr.heureDebut, cr.heureFin, cr.lieu || '', cr.remarque || '', cr.createdAt || new Date().toISOString()).run();
    return ok(c, cr);
  } catch (e) {
    return err(c, e.message, 500);
  }
});

app.put('/api/creneaux/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const cr = await c.req.json();
    await c.env.DB.prepare(
      `UPDATE creneaux SET
        discipline = ?, categorie = ?, jour = ?, heureDebut = ?,
        heureFin = ?, lieu = ?, remarque = ?
      WHERE id = ?`
    ).bind(cr.discipline, cr.categorie, cr.jour, cr.heureDebut, cr.heureFin, cr.lieu || '', cr.remarque || '', id).run();
    return ok(c, { id, ...cr });
  } catch (e) {
    return err(c, e.message, 500);
  }
});

app.delete('/api/creneaux/:id', async (c) => {
  try {
    const id = c.req.param('id');
    await c.env.DB.batch([
      c.env.DB.prepare('DELETE FROM presences WHERE creneauId = ?').bind(id),
      c.env.DB.prepare('DELETE FROM creneaux WHERE id = ?').bind(id),
    ]);
    return ok(c, { deleted: id });
  } catch (e) {
    return err(c, e.message, 500);
  }
});

// ── Présences ──
app.get('/api/presences/seance', async (c) => {
  try {
    const creneauId = c.req.query('creneauId');
    const dateSeance = c.req.query('dateSeance');
    const { results } = await c.env.DB.prepare(
      `SELECT p.*, a.nom, a.prenom, a.code
       FROM presences p
       JOIN adherents a ON p.adherentId = a.id
       WHERE p.creneauId = ? AND p.dateSeance = ?
       ORDER BY a.nom ASC`
    ).bind(creneauId, dateSeance).all();
    return ok(c, results || []);
  } catch (e) {
    return err(c, e.message, 500);
  }
});

app.post('/api/presences/seance', async (c) => {
  try {
    const { creneauId, dateSeance, saisonId, presencesList } = await c.req.json();
    const seasonCheck = await requireOpenActiveSeason(c, typeof saisonId === 'string' ? saisonId : undefined);
    if (seasonCheck.error) return seasonCheck.error;
    const effectiveSaisonId = seasonCheck.saison.id;
    const now = new Date().toISOString();
    const statements = [];

    for (const item of presencesList || []) {
      const pid = `pres-${creneauId}-${item.adherentId}-${dateSeance}`;
      statements.push(
        c.env.DB.prepare(
          `INSERT INTO presences (id, creneauId, adherentId, saisonId, dateSeance, statut, remarque, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             statut = excluded.statut,
             remarque = excluded.remarque,
             updatedAt = excluded.updatedAt`
        ).bind(pid, creneauId, item.adherentId, effectiveSaisonId, dateSeance, item.statut || 'present', item.remarque || '', now, now)
      );
    }

    if (statements.length > 0) {
      await c.env.DB.batch(statements);
    }
    return ok(c, { saved: statements.length });
  } catch (e) {
    return err(c, e.message, 500);
  }
});

app.get('/api/presences/adherent/:id', async (c) => {
  try {
    const adherentId = c.req.param('id');
    const saisonId = c.req.query('saisonId');
    let query = `
      SELECT p.*, c.discipline, c.categorie, c.jour, c.heureDebut, c.heureFin, c.lieu
      FROM presences p
      JOIN creneaux c ON p.creneauId = c.id
      WHERE p.adherentId = ?
    `;
    const binds = [adherentId];
    if (saisonId) {
      query += ' AND p.saisonId = ?';
      binds.push(saisonId);
    }
    query += ' ORDER BY p.dateSeance DESC';
    const stmt = c.env.DB.prepare(query);
    const { results } = await stmt.bind(...binds).all();
    return ok(c, results || []);
  } catch (e) {
    return err(c, e.message, 500);
  }
});

// ── Statistiques ──
app.get('/api/stats', async (c) => {
  try {
    const saisonId = c.req.query('saisonId');
    if (!saisonId) return err(c, 'saisonId requis');

    const adhCount = await c.env.DB.prepare(
      `SELECT COUNT(DISTINCT a.id) as total
       FROM adherents a
       JOIN adherent_saisons s ON a.id = s.adherentId
       WHERE s.saisonId = ? AND s.actif = 1`
    ).bind(saisonId).first();

    const sumPaye = await c.env.DB.prepare(
      'SELECT SUM(montantPaye) as total FROM paiements WHERE saisonId = ?'
    ).bind(saisonId).first();

    const retardsCount = await c.env.DB.prepare(
      `SELECT COUNT(DISTINCT adherentId) as total
       FROM paiements
       WHERE saisonId = ?
         AND montantPaye < montantDu
         AND (
           (mois IS NOT NULL AND annee IS NOT NULL
             AND date('now') >= date(annee || '-' || printf('%02d', mois) || '-10'))
           OR (type = 'inscription' AND createdAt IS NOT NULL
             AND datetime('now') > datetime(createdAt, '+30 days'))
         )`
    ).bind(saisonId).first();

    return ok(c, {
      nbAdherents: adhCount?.total || 0,
      collected: sumPaye?.total || 0,
      retards: retardsCount?.total || 0,
    });
  } catch (e) {
    return err(c, e.message, 500);
  }
});

export default app;
