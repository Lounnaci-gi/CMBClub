CREATE TABLE IF NOT EXISTS revoked_access_tokens (
  jti TEXT PRIMARY KEY,
  expiresAt INTEGER NOT NULL,
  createdAt INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_revoked_access_tokens_expiresAt ON revoked_access_tokens(expiresAt);

CREATE TABLE IF NOT EXISTS auth_login_attempts (
  rateKey TEXT PRIMARY KEY,
  failures INTEGER NOT NULL,
  windowStartedAt INTEGER NOT NULL,
  blockedUntil INTEGER,
  updatedAt INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_auth_login_attempts_updatedAt ON auth_login_attempts(updatedAt);
