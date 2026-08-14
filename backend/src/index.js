import { Hono } from 'hono';
import { cors } from 'hono/cors';

const app = new Hono();

// ── CORS : restreindre aux origines autorisées ──
const ALLOWED_ORIGINS = [
  'http://localhost:8081',
  'http://localhost:19000',
  'http://localhost:19006',
  'exp://',
];

app.use('*', cors({
  origin: (origin) => {
    if (!origin) return 'http://localhost:8081'; // app mobile native (pas d'origine HTTP)
    if (ALLOWED_ORIGINS.some(o => origin.startsWith(o))) return origin;
    return null; // bloque les origines non autorisées
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

// ── Rate Limiting anti-brute force (en mémoire Worker, par IP) ──
const loginAttempts = new Map(); // Map<ip, { count, firstAttempt, lockedUntil }>

const RATE_LIMIT = {
  MAX_ATTEMPTS: 5,
  WINDOW_MS: 15 * 60 * 1000,   // 15 minutes
  LOCKOUT_MS: 15 * 60 * 1000,  // 15 minutes de verrouillage
};

function getClientIp(c) {
  return (
    c.req.header('cf-connecting-ip') ||
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
    c.req.header('x-real-ip') ||
    'unknown'
  );
}

function checkRateLimit(ip) {
  const now = Date.now();
  const state = loginAttempts.get(ip) || { count: 0, firstAttempt: now, lockedUntil: null };

  // Déverrouillage automatique après la période
  if (state.lockedUntil && now >= state.lockedUntil) {
    loginAttempts.delete(ip);
    return { allowed: true, remaining: RATE_LIMIT.MAX_ATTEMPTS };
  }

  // Encore verrouillé
  if (state.lockedUntil && now < state.lockedUntil) {
    const retryAfter = Math.ceil((state.lockedUntil - now) / 1000);
    return { allowed: false, retryAfter };
  }

  // Réinitialiser la fenêtre si expirée
  if (now - state.firstAttempt > RATE_LIMIT.WINDOW_MS) {
    loginAttempts.delete(ip);
    return { allowed: true, remaining: RATE_LIMIT.MAX_ATTEMPTS };
  }

  const remaining = RATE_LIMIT.MAX_ATTEMPTS - state.count;
  return { allowed: remaining > 0, remaining, state };
}

function recordFailedAttempt(ip) {
  const now = Date.now();
  const state = loginAttempts.get(ip) || { count: 0, firstAttempt: now, lockedUntil: null };
  state.count += 1;
  if (state.count >= RATE_LIMIT.MAX_ATTEMPTS) {
    state.lockedUntil = now + RATE_LIMIT.LOCKOUT_MS;
  }
  loginAttempts.set(ip, state);
}

function resetAttempts(ip) {
  loginAttempts.delete(ip);
}

// Helper pour formater les réponses JSON
const ok = (c, data) => c.json({ success: true, data });
const err = (c, message, status = 400) => c.json({ success: false, error: message }, status);

// ── Health Check ──
app.get('/api/health', async (c) => {
  try {
    const res = await c.env.DB.prepare('SELECT 1 as ping').first();
    return ok(c, { status: 'healthy', d1: res?.ping === 1, timestamp: new Date().toISOString() });
  } catch (e) {
    return err(c, `D1 Error: ${e.message}`, 500);
  }
});

// ── Sécurité : Chiffrement des identifiants & Hachage des mots de passe ──
const SALT_PREFIX = 'cmb_slt_v1:';
const ENC_PREFIX = 'cmb_enc_u1:';
const SECRET_KEY = 'CMBClub@SecureKey#2026_AuthVault';

function encryptUsername(plainUsername) {
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

function decryptUsername(cipherUsername) {
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

function matchesUsername(inputUsername, storedUsername) {
  if (!inputUsername || !storedUsername) return false;
  const cleanInput = String(inputUsername).trim().toLowerCase();
  const decrypted = decryptUsername(storedUsername).toLowerCase();
  if (cleanInput === decrypted) return true;
  if (cleanInput === String(storedUsername).trim().toLowerCase()) return true;
  return false;
}

async function sha256(text) {
  const msgBuffer = new TextEncoder().encode(String(text || ''));
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hashPassword(plainPassword) {
  if (!plainPassword) return '';
  const clean = String(plainPassword).trim();
  const hash = await sha256(`cmb_${clean}_club_secure`);
  return `${SALT_PREFIX}${hash}`;
}

async function verifyPassword(inputPassword, storedHash) {
  if (!inputPassword || !storedHash) return false;
  const cleanInput = String(inputPassword).trim();
  const cleanStored = String(storedHash).trim();

  const computedHash = await hashPassword(cleanInput);
  if (cleanStored === computedHash) return true;

  const directHash = await sha256(cleanInput);
  if (cleanStored === directHash) return true;

  if (cleanStored === cleanInput) return true;

  return false;
}

// ── Auth & Users ──
app.post('/api/auth/login', async (c) => {
  try {
    // ── Rate Limiting : anti brute force ──
    const ip = getClientIp(c);
    const rateCheck = checkRateLimit(ip);
    if (!rateCheck.allowed) {
      c.res.headers.set('Retry-After', String(rateCheck.retryAfter));
      return c.json(
        { success: false, error: `Trop de tentatives. Réessayez dans ${Math.ceil(rateCheck.retryAfter / 60)} minute(s).` },
        429
      );
    }

    const body = await c.req.json();
    const rawUser = sanitizeCredential(body.username, 64);
    const rawPass = sanitizeCredential(body.password, 128);
    if (!rawUser || !rawPass) return err(c, 'Identifiant et mot de passe requis');
    if (rawUser.length < 2 || rawPass.length < 4) {
      recordFailedAttempt(ip);
      return err(c, 'Identifiant ou mot de passe incorrect', 401);
    }

    const cleanUser = rawUser;
    const cleanPass = rawPass;
    const encUser = encryptUsername(cleanUser);

    // 1. Chercher un utilisateur
    let user = await c.env.DB.prepare(
      'SELECT id, username, password, role, adherentId FROM users WHERE username = ? OR LOWER(username) = LOWER(?)'
    ).bind(encUser, cleanUser).first();

    if (!user) {
      const { results: allUsers } = await c.env.DB.prepare('SELECT id, username, password, role, adherentId FROM users').all();
      user = (allUsers || []).find(u => matchesUsername(cleanUser, u.username));
    }

    if (user && (await verifyPassword(cleanPass, user.password))) {
      resetAttempts(ip);
      const needsUserEnc = user.username && !user.username.startsWith(ENC_PREFIX);
      const needsPassHash = user.password && !user.password.startsWith(SALT_PREFIX);
      if (needsUserEnc || needsPassHash) {
        const nextUser = needsUserEnc ? encryptUsername(cleanUser) : user.username;
        const nextPass = needsPassHash ? await hashPassword(cleanPass) : user.password;
        await c.env.DB.prepare('UPDATE users SET username = ?, password = ? WHERE id = ?').bind(nextUser, nextPass, user.id).run();
      }
      const { password: _, ...safeUser } = user;
      return ok(c, { user: { ...safeUser, username: decryptUsername(safeUser.username) } });
    }

    // 2. Chercher un adhérent par son code ou son nom de famille
    const adherent = await c.env.DB.prepare(
      'SELECT id, code, nom, prenom FROM adherents WHERE LOWER(code) = LOWER(?) OR LOWER(nom) = LOWER(?)'
    ).bind(cleanUser, cleanUser).first();

    if (adherent) {
      let adherentUser = await c.env.DB.prepare(
        'SELECT id, username, password, role, adherentId FROM users WHERE adherentId = ?'
      ).bind(adherent.id).first();

      if (!adherentUser) {
        const newId = `user-${adherent.id}`;
        const encCode = encryptUsername(adherent.code);
        const hashedPass = await hashPassword(adherent.code);
        await c.env.DB.prepare(
          `INSERT INTO users (id, username, password, role, adherentId, createdAt)
           VALUES (?, ?, ?, 'adherent', ?, datetime('now'))`
        ).bind(newId, encCode, hashedPass, adherent.id).run();
        adherentUser = { id: newId, username: encCode, role: 'adherent', adherentId: adherent.id };
      }

      if ((await verifyPassword(cleanPass, adherentUser.password)) || cleanPass === adherent.code) {
        resetAttempts(ip);
        const needsUserEnc = adherentUser.username && !adherentUser.username.startsWith(ENC_PREFIX);
        const needsPassHash = adherentUser.password && !adherentUser.password.startsWith(SALT_PREFIX);
        if (needsUserEnc || needsPassHash) {
          const nextUser = needsUserEnc ? encryptUsername(adherent.code) : adherentUser.username;
          const nextPass = needsPassHash ? await hashPassword(cleanPass) : adherentUser.password;
          await c.env.DB.prepare('UPDATE users SET username = ?, password = ? WHERE id = ?').bind(nextUser, nextPass, adherentUser.id).run();
        }
        return ok(c, { user: { id: adherentUser.id, username: adherent.code, role: 'adherent', adherentId: adherent.id } });
      }
    }

    // Identifiants incorrects → enregistrer la tentative
    recordFailedAttempt(ip);
    const newCheck = checkRateLimit(ip);
    if (!newCheck.allowed) {
      return c.json(
        { success: false, error: `Trop de tentatives. Compte verrouillé pendant ${Math.ceil(RATE_LIMIT.LOCKOUT_MS / 60000)} minutes.` },
        429
      );
    }
    return err(c, 'Identifiant ou mot de passe incorrect', 401);
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
    return ok(c, { ...admin, username: decryptUsername(admin.username) });
  } catch (e) {
    return err(c, e.message, 500);
  }
});

app.put('/api/auth/admin-credentials', async (c) => {
  try {
    const body = await c.req.json();
    const cleanUsername = sanitizeCredential(body.username, 64);
    const cleanPassword = sanitizeCredential(body.password, 128);
    if (!cleanUsername || !cleanPassword) return err(c, 'Champs obligatoires');
    if (cleanUsername.length < 2) return err(c, "L'identifiant doit contenir au moins 2 caractères.");
    if (cleanPassword.length < 4) return err(c, 'Le mot de passe doit contenir au moins 4 caractères.');

    const admin = await c.env.DB.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").first();
    const adminId = admin ? admin.id : 'admin-001';
    const encUsername = encryptUsername(cleanUsername);
    const hashedPassword = await hashPassword(cleanPassword);

    await c.env.DB.prepare(
      `INSERT INTO users (id, username, password, role, createdAt)
       VALUES (?, ?, ?, 'admin', datetime('now'))
       ON CONFLICT(id) DO UPDATE SET username = excluded.username, password = excluded.password`
    ).bind(adminId, encUsername, hashedPassword).run();

    return ok(c, { id: adminId, username: username.trim(), role: 'admin' });
  } catch (e) {
    return err(c, e.message, 500);
  }
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
    let active = await c.env.DB.prepare('SELECT * FROM saisons WHERE actif = 1 LIMIT 1').first();
    if (!active) {
      active = await c.env.DB.prepare('SELECT * FROM saisons ORDER BY annee DESC LIMIT 1').first();
    }
    return ok(c, active || null);
  } catch (e) {
    return err(c, e.message, 500);
  }
});

app.post('/api/saisons', async (c) => {
  try {
    const s = await c.req.json();
    await c.env.DB.prepare(
      `INSERT INTO saisons (id, label, annee, dateDebut, dateFin, actif, statut, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(s.id, s.label, s.annee, s.dateDebut, s.dateFin || null, s.actif ? 1 : 0, 'ouvert', s.createdAt || new Date().toISOString()).run();

    if (s.actif) {
      await c.env.DB.prepare('UPDATE saisons SET actif = 0 WHERE id != ?').bind(s.id).run();
    }
    return ok(c, { ...s, statut: 'ouvert' });
  } catch (e) {
    return err(c, e.message, 500);
  }
});

app.put('/api/saisons/:id/activate', async (c) => {
  try {
    const id = c.req.param('id');
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
    const saison = await c.env.DB.prepare('SELECT * FROM saisons WHERE id = ?').bind(id).first();
    
    if (!saison) {
      return err(c, 'Saison non trouvée', 404);
    }

    const newStatut = saison.statut === 'ouvert' ? 'fermé' : 'ouvert';
    const dateClose = newStatut === 'fermé' ? new Date().toISOString() : null;
    
    await c.env.DB.prepare(
      'UPDATE saisons SET statut = ?, dateFin = CASE WHEN ? THEN ? ELSE dateFin END WHERE id = ?'
    ).bind(newStatut, newStatut === 'fermé', dateClose, id).run();

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
             s.saisonId,
             s.dateInscription AS dateInscriptionSaison
      FROM adherents a
    `;
    let bindings = [];

    if (saisonId) {
      query += ` INNER JOIN adherent_saisons s ON a.id = s.adherentId WHERE s.saisonId = ? AND s.actif = 1 `;
      bindings.push(saisonId);
    } else {
      query += ` LEFT JOIN adherent_saisons s ON a.id = s.adherentId `;
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
    return ok(c, adherent);
  } catch (e) {
    return err(c, e.message, 500);
  }
});

app.post('/api/adherents', async (c) => {
  try {
    // Vérifier qu'il y a une saison active
    const activeSaison = await c.env.DB.prepare('SELECT id FROM saisons WHERE actif = 1 LIMIT 1').first();
    if (!activeSaison) {
      return err(c, 'Impossible de créer un adhérent sans saison active. Veuillez d\'abord créer et activer une saison.', 400);
    }

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
    await c.env.DB.prepare(
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
    ).run();
    return ok(c, a);
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

// ── Paiements ──
app.get('/api/paiements', async (c) => {
  try {
    const adherentId = c.req.query('adherentId');
    const saisonId = c.req.query('saisonId');

    let query = 'SELECT * FROM paiements WHERE 1=1';
    let binds = [];

    if (adherentId) {
      query += ' AND adherentId = ?';
      binds.push(adherentId);
    }
    if (saisonId) {
      query += ' AND saisonId = ?';
      binds.push(saisonId);
    }

    query += ' ORDER BY annee ASC, mois ASC, type ASC';
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
    const now = new Date().toISOString();
    await c.env.DB.prepare(
      `INSERT INTO paiements (
        id, adherentId, saisonId, type, label, mois, annee,
        montantDu, remisePct, remiseMontant, montantPaye,
        datePaiement, statut, notes, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      p.id, p.adherentId, p.saisonId, p.type, p.label, p.mois || null, p.annee || null,
      p.montantDu, p.remisePct || 0, p.remiseMontant || 0, p.montantPaye || 0,
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
    const now = new Date().toISOString();
    await c.env.DB.prepare(
      `UPDATE paiements SET
        montantPaye = ?, datePaiement = ?, statut = ?, notes = ?,
        remisePct = ?, remiseMontant = ?, updatedAt = ?
      WHERE id = ?`
    ).bind(
      p.montantPaye, p.datePaiement || null, p.statut, p.notes || '',
      p.remisePct || 0, p.remiseMontant || 0, now, id
    ).run();

    return ok(c, { id, ...p, updatedAt: now });
  } catch (e) {
    return err(c, e.message, 500);
  }
});

// ── Remises ──
app.get('/api/remises', async (c) => {
  try {
    const { results } = await c.env.DB.prepare('SELECT * FROM remises WHERE actif = 1 ORDER BY pourcentage ASC').all();
    return ok(c, results || []);
  } catch (e) {
    return err(c, e.message, 500);
  }
});

app.post('/api/remises', async (c) => {
  try {
    const r = await c.req.json();
    await c.env.DB.prepare(
      'INSERT INTO remises (id, label, pourcentage, actif, createdAt) VALUES (?, ?, ?, ?, ?)'
    ).bind(r.id, r.label, r.pourcentage, r.actif !== undefined ? (r.actif ? 1 : 0) : 1, r.createdAt || new Date().toISOString()).run();
    return ok(c, r);
  } catch (e) {
    return err(c, e.message, 500);
  }
});

app.delete('/api/remises/:id', async (c) => {
  try {
    const id = c.req.param('id');
    await c.env.DB.prepare('UPDATE remises SET actif = 0 WHERE id = ?').bind(id).run();
    return ok(c, { deleted: id });
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
        ).bind(pid, creneauId, item.adherentId, saisonId, dateSeance, item.statut || 'present', item.remarque || '', now, now)
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
      "SELECT COUNT(*) as total FROM paiements WHERE saisonId = ? AND statut = 'retard'"
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
